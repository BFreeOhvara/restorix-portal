// ============================================================
// create-payment-request — Prompt 660. Replaces freely picking "Closed" on
// the Log Outcome tab: a closer sends a real Stripe invoice (ACH Direct
// Debit only — no cards, see the prompt's own reasoning on chargeback
// windows for business bank accounts) for the setup fee + first month fee
// already computed by the Closer Survey (lib/agentCatalog.js's
// priceForSurveyValue), and the lead moves to `awaiting_payment` — not
// `closed` — until stripe-payment-webhook confirms the money actually
// landed.
//
// Uses Stripe's Invoicing API with collection_method: 'send_invoice', not
// Checkout — invoices auto-email a hosted payment link the moment they're
// finalized+sent, which is "Stripe's own hosted invoice email" the prompt
// asks to prefer over building the app's own email delivery.
//
// Idempotent-ish: if this lead already has a stripe_customer_id, that
// customer is reused (email kept in sync) rather than creating a
// duplicate Stripe customer per retry.
//
// Called from useCreatePaymentRequest (src/hooks/useLeads.js), from
// LogOutcomeModal.jsx's new "Send Payment Request" mode.
//
// Deploy WITH jwt verification (called by an authed closer):
//   supabase functions deploy create-payment-request --project-ref avgvmzshujwphneykuvu
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY — Brayden's real (or Stripe test-mode) secret key,
//     see Restorix CC Queue Prompt 660 for what's blocked on his real
//     account vs. testable now in Stripe test mode.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function stripeFetch(path: string, secretKey: string, params: Record<string, string>) {
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(`Stripe ${path} failed: ${data?.error?.message || resp.status}`)
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing or invalid Authorization header' }, 401)

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeKey) {
    console.error('[create-payment-request] STRIPE_SECRET_KEY not set')
    return json({ error: 'Stripe not configured yet — Brayden needs to add STRIPE_SECRET_KEY.' }, 503)
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const jwt = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await admin.auth.getUser(jwt)
  if (authError || !user) return json({ error: 'Invalid or expired token' }, 401)

  let body: { leadId?: string; setupFee?: number; firstMonthFee?: number; contactEmail?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const { leadId, setupFee, firstMonthFee, contactEmail } = body

  if (!leadId) return json({ error: 'leadId is required' }, 400)
  if (typeof setupFee !== 'number' || setupFee < 0) return json({ error: 'setupFee must be a non-negative number' }, 400)
  if (typeof firstMonthFee !== 'number' || firstMonthFee < 0) return json({ error: 'firstMonthFee must be a non-negative number' }, 400)
  if (!contactEmail || !EMAIL_RE.test(contactEmail)) return json({ error: 'A valid contact email is required' }, 400)

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'closer' && profile?.role !== 'admin') {
    return json({ error: 'Forbidden — closer or admin role required' }, 403)
  }

  const { data: lead, error: leadError } = await admin
    .from('leads')
    .select('id, facility_name, assigned_closer, closer_outcome, survey_front_runner, stripe_customer_id, closer_notes')
    .eq('id', leadId)
    .single()
  if (leadError || !lead) return json({ error: 'Lead not found' }, 404)
  if (profile.role === 'closer' && lead.assigned_closer !== user.id) {
    return json({ error: 'Forbidden — not your lead' }, 403)
  }
  if (!lead.survey_front_runner) {
    return json({ error: "Run the Closer Survey first — a payment request needs a confirmed Stack." }, 422)
  }
  // Only a lead with no real outcome logged yet can get a payment request
  // — mirrors the old Closed gate, and stops a second request going out
  // to a lead that's already awaiting_payment/closed/lost.
  if (lead.closer_outcome && lead.closer_outcome !== 'pending') {
    return json({ error: `This lead is already ${lead.closer_outcome} — can't send a new payment request.` }, 409)
  }

  const totalCents = Math.round((setupFee + firstMonthFee) * 100)
  if (totalCents <= 0) return json({ error: 'Total amount must be greater than zero' }, 400)

  try {
    let customerId = lead.stripe_customer_id
    if (customerId) {
      await stripeFetch(`customers/${customerId}`, stripeKey, { email: contactEmail })
    } else {
      const customer = await stripeFetch('customers', stripeKey, {
        email: contactEmail,
        name: lead.facility_name || '',
        'metadata[lead_id]': leadId,
      })
      customerId = customer.id
    }

    await stripeFetch('invoiceitems', stripeKey, {
      customer: customerId,
      amount: String(Math.round(setupFee * 100)),
      currency: 'usd',
      description: `${lead.facility_name || 'Restorix'} — Setup fee`,
    })
    await stripeFetch('invoiceitems', stripeKey, {
      customer: customerId,
      amount: String(Math.round(firstMonthFee * 100)),
      currency: 'usd',
      description: `${lead.facility_name || 'Restorix'} — First month`,
    })

    const invoice = await stripeFetch('invoices', stripeKey, {
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: '3',
      auto_advance: 'false',
      'payment_settings[payment_method_types][0]': 'us_bank_account',
      'metadata[lead_id]': leadId,
    })

    const finalized = await stripeFetch(`invoices/${invoice.id}/finalize`, stripeKey, {})
    await stripeFetch(`invoices/${finalized.id}/send`, stripeKey, {})

    const now = new Date().toISOString()
    const { error: updateError } = await admin
      .from('leads')
      .update({
        contact_email: contactEmail,
        deal_setup_fee: setupFee,
        deal_first_month_fee: firstMonthFee,
        stripe_customer_id: customerId,
        stripe_invoice_id: finalized.id,
        closer_outcome: 'awaiting_payment',
        awaiting_payment_at: now,
      })
      .eq('id', leadId)
    if (updateError) throw new Error(`lead update failed: ${updateError.message}`)

    return json({ ok: true, invoiceUrl: finalized.hosted_invoice_url })
  } catch (e) {
    console.error('[create-payment-request] failed:', e?.message || e)
    return json({ error: e?.message || 'Failed to create the payment request' }, 500)
  }
})
