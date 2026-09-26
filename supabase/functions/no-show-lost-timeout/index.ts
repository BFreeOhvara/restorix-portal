// ============================================================
// no-show-lost-timeout — Prompt 659. A booked lead that's still sitting
// as Pending/No Show (closer_outcome null or 'pending') 7+ days after its
// strategy_call_at auto-flips to Lost, so a closer no longer has to
// remember to clean these up by hand.
//
// This supersedes the lazy write-on-read escalation added in Prompt 540
// (escalateStaleNoShows in src/lib/closerOutcome.js, still called from
// useMyBooked in useLeads.js) — that mechanism only fires when the
// specific closer who owns the lead happens to load their own My
// Pipeline/Overview, which is exactly the "relies on someone loading the
// right view" gap this prompt asks to close. Left in place rather than
// removed: it's a harmless, fully idempotent no-op once this job has
// already flipped a lead (isNoShow() reads false the moment
// closer_outcome stops being 'pending'), it's out of this prompt's stated
// scope, and removing it would drop the only escalation path for any
// closer session that predates this job's first run. Real source of
// truth for anyone auditing an auto-lost lead: closer_notes carries this
// job's own "[Automatic — no-show timeout]" marker distinctly from
// Prompt 540's "Auto-marked Lost — no-show, not rebooked within 7 days."
// wording, so either path is identifiable after the fact.
//
// Driven by a once-daily pg_cron tick via net.http_post + the same
// x-cron-secret header pattern send-appointment-reminders established —
// verify_jwt is off since the caller is pg_cron, not a user.
//
// Deploy WITHOUT jwt verification:
//   supabase functions deploy no-show-lost-timeout --no-verify-jwt --project-ref avgvmzshujwphneykuvu
//
// Required Supabase secrets:
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const TIMEOUT_DAYS = 7
const AUTO_LOST_NOTE = '[Automatic — no-show timeout] Marked Lost: booked call passed with no outcome logged and no reschedule within 7 days.'

Deno.serve(async (req) => {
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: secretRow } = await adminClient
    .from('app_secrets')
    .select('value')
    .eq('key', 'cron_secret')
    .single()
  if (!secretRow || req.headers.get('x-cron-secret') !== secretRow.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  const cutoff = new Date(Date.now() - TIMEOUT_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Mirrors isNoShow()'s own rule (src/lib/closerOutcome.js): a booked
  // lead with no real outcome logged yet reads as Pending/No Show
  // regardless of whether closer_outcome is null or the literal string
  // 'pending'. A reschedule (Prompt 540's useRescheduleLead) pushes
  // strategy_call_at back into the future, which naturally drops the lead
  // out of this filter — no separate "was it rescheduled" check needed.
  const { data: dueLeads, error } = await adminClient
    .from('leads')
    .select('id, closer_notes')
    .eq('status', 'appointment_booked')
    .or('closer_outcome.is.null,closer_outcome.eq.pending')
    .lt('strategy_call_at', cutoff)

  if (error) {
    console.error('[no-show-lost-timeout] query failed:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const now = new Date().toISOString()
  let escalated = 0
  for (const lead of dueLeads || []) {
    const closer_notes = [lead.closer_notes, AUTO_LOST_NOTE].filter(Boolean).join('\n\n')
    const { error: updateError } = await adminClient
      .from('leads')
      .update({ closer_outcome: 'lost', closer_outcome_at: now, closer_notes })
      .eq('id', lead.id)
    if (updateError) {
      console.error(`[no-show-lost-timeout] failed to escalate lead ${lead.id}:`, updateError.message)
      continue
    }
    escalated += 1
  }

  return new Response(JSON.stringify({ ok: true, escalated }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
