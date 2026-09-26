// ============================================================
// expire-awaiting-payment — Prompt 660. A payment request that's sat
// unpaid for too long auto-flips its lead to Lost, same "don't make a
// human remember to clean this up" shape as no-show-lost-timeout
// (Prompt 659).
//
// Grace period: 45 minutes (the middle of the prompt's own suggested
// 30–60 minute range) from awaiting_payment_at — set the moment
// create-payment-request sends the invoice, which in practice is right
// at/after the strategy call ends. ACH authorization itself is
// near-instant even though full settlement takes days (per the prompt's
// own note), so 45 minutes is generous room for a client to actually fill
// out the hosted invoice page and authorize their bank, not a race.
//
// Anchored on awaiting_payment_at rather than the Zoom call's own
// join/leave lifecycle: a client can still be filling out the Stripe page
// after the closer has already left the Meeting Room / closed the tab, so
// a client-side timer tied to that ephemeral session can't be trusted to
// fire. A periodic server-side sweep can.
//
// Also voids the Stripe invoice on expiry (best-effort) so it doesn't
// stay open forever confusing anyone who looks at the Stripe dashboard —
// failure to void never blocks the lead from flipping to Lost.
//
// Driven by a 15-minute pg_cron tick (see the migration) via
// net.http_post + the same x-cron-secret header pattern every other cron
// job in this project uses — verify_jwt is off since the caller is
// pg_cron, not a user.
//
// Deploy WITHOUT jwt verification:
//   supabase functions deploy expire-awaiting-payment --no-verify-jwt --project-ref avgvmzshujwphneykuvu
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY — to void the stale invoice (best-effort; missing
//     doesn't block the lead update)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const GRACE_MINUTES = 45
const AUTO_LOST_NOTE = '[Automatic — payment request expired] Marked Lost: payment request sent but never completed within the grace period.'

async function voidInvoice(stripeKey: string, invoiceId: string) {
  const resp = await fetch(`https://api.stripe.com/v1/invoices/${invoiceId}/void`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}` },
  })
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    // Already paid/voided/uncollectible races are expected and harmless —
    // only genuinely unexpected failures get logged loudly.
    console.log('[expire-awaiting-payment] invoice void skipped for', invoiceId, ':', data?.error?.message || resp.status)
  }
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: secretRow } = await admin.from('app_secrets').select('value').eq('key', 'cron_secret').single()
  if (!secretRow || req.headers.get('x-cron-secret') !== secretRow.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const cutoff = new Date(Date.now() - GRACE_MINUTES * 60 * 1000).toISOString()

  const { data: dueLeads, error } = await admin
    .from('leads')
    .select('id, closer_notes, stripe_invoice_id')
    .eq('closer_outcome', 'awaiting_payment')
    .lt('awaiting_payment_at', cutoff)

  if (error) {
    console.error('[expire-awaiting-payment] query failed:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  const now = new Date().toISOString()
  let expired = 0
  for (const lead of dueLeads || []) {
    const closer_notes = [lead.closer_notes, AUTO_LOST_NOTE].filter(Boolean).join('\n\n')
    const { error: updateError } = await admin
      .from('leads')
      .update({ closer_outcome: 'lost', closer_outcome_at: now, closer_notes })
      .eq('id', lead.id)
    if (updateError) {
      console.error(`[expire-awaiting-payment] failed to expire lead ${lead.id}:`, updateError.message)
      continue
    }
    expired += 1
    if (stripeKey && lead.stripe_invoice_id) {
      await voidInvoice(stripeKey, lead.stripe_invoice_id)
    }
  }

  return new Response(JSON.stringify({ ok: true, expired }), { headers: { 'Content-Type': 'application/json' } })
})
