// ============================================================
// stripe-payment-webhook — Prompt 660. Stripe calls this when a payment
// request's invoice is paid (or fails / gets disputed).
//
// `invoice.paid` on the ONE-OFF invoice create-payment-request sent
// (matched by leads.stripe_invoice_id): the client just authorized their
// bank account via ACH Direct Debit. This attaches that same bank account
// (PaymentMethod) to the customer as their default, starts a recurring
// Stripe Subscription for the monthly fee (billed starting the following
// month — proration_behavior: 'none' + a next-month billing_cycle_anchor,
// so nothing extra is charged today), and — only now, once real money has
// actually moved — flips the lead to `closed`. This is the whole point of
// Prompt 660: Closed is a consequence of a real payment, not a manual
// pick.
//
// `invoice.payment_failed` on a lead already `closed` (a later recurring
// subscription charge bounced), or `charge.dispute.created` on that same
// lead's Stripe customer: per the prompt's own instruction NOT to guess
// how to unwind an already-Closed deal, this only flags it
// (payment_failed_at/payment_failed_note) — closer_outcome stays 'closed'
// so Brayden has to look at it and decide, rather than the system quietly
// reversing a real close on its own judgment.
//
// Mirrors zoom-recording-webhook's shape exactly: public (Stripe hits
// this, no user JWT), signature verified against STRIPE_WEBHOOK_SECRET
// instead of a JWT, every branch best-effort/logged rather than throwing,
// since Stripe retries a non-2xx response and every write here is already
// idempotent (guarded on the lead's current closer_outcome).
//
// Deploy WITHOUT jwt verification:
//   supabase functions deploy stripe-payment-webhook --no-verify-jwt --project-ref avgvmzshujwphneykuvu
//
// Stripe dashboard → Developers → Webhooks → endpoint URL:
//   https://avgvmzshujwphneykuvu.supabase.co/functions/v1/stripe-payment-webhook
// events to send: invoice.paid, invoice.payment_failed, charge.dispute.created
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY — same key create-payment-request uses
//   STRIPE_WEBHOOK_SECRET — the endpoint's "Signing secret" (Stripe
//     dashboard → the webhook endpoint's own detail page)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const jsonHeaders = { 'Content-Type': 'application/json' }
// Reject events whose signature timestamp is older than this — same
// replay-protection shape as zoom-recording-webhook's MAX_SKEW_SECONDS.
const MAX_SKEW_SECONDS = 5 * 60

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Stripe's own signature scheme (not HMAC-of-header like Zoom's): the
// Stripe-Signature header is `t=<ts>,v1=<hex>[,v0=...]`; the signed
// payload is `${t}.${rawBody}`, HMAC-SHA256'd with the endpoint secret.
async function verifyStripeSignature(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const header = req.headers.get('stripe-signature')
  if (!header) return false
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')))
  const timestamp = parts.t
  const v1 = parts.v1
  if (!timestamp || !v1) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) return false
  const expected = await hmacHex(secret, `${timestamp}.${rawBody}`)
  if (expected.length !== v1.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i)
  return diff === 0
}

async function stripeGet(path: string, secretKey: string) {
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${secretKey}` } })
  const data = await resp.json()
  if (!resp.ok) throw new Error(`Stripe GET ${path} failed: ${data?.error?.message || resp.status}`)
  return data
}

async function stripePost(path: string, secretKey: string, params: Record<string, string>) {
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(`Stripe POST ${path} failed: ${data?.error?.message || resp.status}`)
  return data
}

// One calendar month from now, as a unix timestamp — the recurring
// subscription's first real billing date. Matches the prompt's "starting
// the following month" (the invoice create-payment-request already sent
// covers today's setup fee + first month, so the subscription's OWN first
// charge should be a month after that, not immediately).
function unixOneMonthFromNow(): number {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return Math.floor(d.getTime() / 1000)
}

async function handleInvoicePaid(admin, stripeKey: string, invoice) {
  const { data: lead } = await admin
    .from('leads')
    .select('id, deal_first_month_fee, stripe_customer_id, closer_outcome')
    .eq('stripe_invoice_id', invoice.id)
    .maybeSingle()
  if (!lead) {
    console.log('[stripe-payment-webhook] invoice.paid for', invoice.id, '— no matching lead, ignored')
    return
  }
  // Idempotent — Stripe can and does redeliver the same event.
  if (lead.closer_outcome !== 'awaiting_payment') {
    console.log('[stripe-payment-webhook] invoice.paid for lead', lead.id, 'already', lead.closer_outcome, '— skipped')
    return
  }

  let paymentMethodId: string | null = null
  if (invoice.payment_intent) {
    const pi = await stripeGet(`payment_intents/${invoice.payment_intent}`, stripeKey)
    paymentMethodId = pi.payment_method || null
  }

  if (paymentMethodId) {
    try {
      await stripePost(`payment_methods/${paymentMethodId}/attach`, stripeKey, { customer: lead.stripe_customer_id })
    } catch (e) {
      // Already attached to this customer is fine (Stripe hosted invoice
      // pages sometimes attach it themselves); anything else, log and
      // continue — the subscription create below still works without a
      // default_payment_method, Stripe will just fall back to the
      // invoice's own payment method next cycle.
      console.log('[stripe-payment-webhook] payment_method attach:', e?.message || e)
    }
    await stripePost(`customers/${lead.stripe_customer_id}`, stripeKey, {
      'invoice_settings[default_payment_method]': paymentMethodId,
    })
  }

  let subscriptionId: string | null = null
  try {
    const subParams: Record<string, string> = {
      customer: lead.stripe_customer_id,
      collection_method: 'charge_automatically',
      proration_behavior: 'none',
      billing_cycle_anchor: String(unixOneMonthFromNow()),
      'items[0][price_data][currency]': 'usd',
      'items[0][price_data][unit_amount]': String(Math.round((lead.deal_first_month_fee || 0) * 100)),
      'items[0][price_data][recurring][interval]': 'month',
      'items[0][price_data][product_data][name]': 'Restorix Stack — Monthly',
      'metadata[lead_id]': lead.id,
    }
    if (paymentMethodId) subParams.default_payment_method = paymentMethodId
    const subscription = await stripePost('subscriptions', stripeKey, subParams)
    subscriptionId = subscription.id
  } catch (e) {
    // The payment itself succeeded — don't fail the whole handler over a
    // subscription-create hiccup. Logged loudly since this needs a human
    // to set up the recurring charge manually if it happens.
    console.error('[stripe-payment-webhook] subscription create failed for lead', lead.id, ':', e?.message || e)
  }

  const { error } = await admin
    .from('leads')
    .update({
      closer_outcome: 'closed',
      closer_outcome_at: new Date().toISOString(),
      stripe_subscription_id: subscriptionId,
      stripe_payment_method_id: paymentMethodId,
    })
    .eq('id', lead.id)
  if (error) console.error('[stripe-payment-webhook] failed to close lead', lead.id, ':', error.message)
}

async function handleInvoicePaymentFailed(admin, invoice) {
  // Recurring subscription invoice, on an already-Closed lead.
  if (invoice.subscription) {
    const { data: lead } = await admin
      .from('leads')
      .select('id, closer_outcome, payment_failed_note')
      .eq('stripe_subscription_id', invoice.subscription)
      .maybeSingle()
    if (lead?.closer_outcome === 'closed') {
      await flagPaymentFailure(admin, lead, `Recurring payment failed on invoice ${invoice.id}.`)
    }
    return
  }
  // The original one-off setup+first-month invoice failed before the lead
  // ever closed — leave it awaiting_payment; expire-awaiting-payment's own
  // grace-period timeout handles the "never completes" case, no action
  // needed here (Stripe/the client may still retry the same invoice).
  console.log('[stripe-payment-webhook] invoice.payment_failed for', invoice.id, '(pre-close, awaiting grace period)')
}

async function flagPaymentFailure(admin, lead, note: string) {
  const combinedNote = [lead.payment_failed_note, note].filter(Boolean).join('\n\n')
  const { error } = await admin
    .from('leads')
    .update({ payment_failed_at: new Date().toISOString(), payment_failed_note: combinedNote })
    .eq('id', lead.id)
  if (error) console.error('[stripe-payment-webhook] failed to flag lead', lead.id, ':', error.message)
  else console.log('[stripe-payment-webhook] flagged lead', lead.id, 'for review:', note)
}

async function handleDisputeCreated(admin, stripeKey: string, dispute) {
  try {
    const charge = await stripeGet(`charges/${dispute.charge}`, stripeKey)
    const { data: lead } = await admin
      .from('leads')
      .select('id, closer_outcome, payment_failed_note')
      .eq('stripe_customer_id', charge.customer)
      .eq('closer_outcome', 'closed')
      .maybeSingle()
    if (lead) {
      await flagPaymentFailure(admin, lead, `Dispute opened on charge ${dispute.charge} (reason: ${dispute.reason || 'unknown'}).`)
    }
  } catch (e) {
    console.error('[stripe-payment-webhook] dispute handling failed:', e?.message || e)
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders })

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!webhookSecret || !stripeKey) {
    console.error('[stripe-payment-webhook] STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY not set')
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), { status: 503, headers: jsonHeaders })
  }

  const rawBody = await req.text()
  if (!(await verifyStripeSignature(req, rawBody, webhookSecret))) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: jsonHeaders })
  }

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: jsonHeaders })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const object = event?.data?.object

  const work = (async () => {
    try {
      if (event.type === 'invoice.paid') await handleInvoicePaid(admin, stripeKey, object)
      else if (event.type === 'invoice.payment_failed') await handleInvoicePaymentFailed(admin, object)
      else if (event.type === 'charge.dispute.created') await handleDisputeCreated(admin, stripeKey, object)
    } catch (e) {
      console.error(`[stripe-payment-webhook] ${event.type} failed:`, e?.message || e)
    }
  })()
  // @ts-ignore — EdgeRuntime is a Supabase Edge Runtime global
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work)
  else await work

  return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders })
})
