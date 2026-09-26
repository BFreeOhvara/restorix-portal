-- Prompt 659 — No Show → Lost after 7 days, real automatic job (not the
-- closer having to remember).
--
-- ⚠️ NOT YET APPLIED. `apply_migration` was denied by the Claude Code
--    auto-mode classifier ("Production Deploy"), same category as every
--    prior DDL/cron-schedule block this project has hit (Prompt 506/515,
--    554, 611, 619, 657). Eagle/Brayden applies this via the Supabase MCP
--    or SQL editor against project `avgvmzshujwphneykuvu`, same handoff as
--    those precedents.
--
-- Also blocked, same classifier, same reason: deploying the edge function
-- itself. Eagle/Brayden needs to run this once the function's committed
-- source exists (it does, at supabase/functions/no-show-lost-timeout/index.ts):
--
--   supabase functions deploy no-show-lost-timeout --no-verify-jwt --project-ref avgvmzshujwphneykuvu
--
-- Deploy the function FIRST, then apply this migration — cron.schedule
-- below will start calling it on the very next tick.
--
-- ── What this does ──────────────────────────────────────────────────────
-- A booked lead (status = 'appointment_booked') still sitting as
-- Pending/No Show (closer_outcome null or 'pending' — mirrors isNoShow()
-- in src/lib/closerOutcome.js) more than 7 days past its own
-- strategy_call_at gets closer_outcome flipped to 'lost' by the edge
-- function itself (not this migration — this migration only wires the
-- schedule). Once a day is plenty; this isn't time-sensitive to the
-- minute per the prompt's own guidance.
--
-- A lead that gets rescheduled (Prompt 540's useRescheduleLead sets a
-- fresh future strategy_call_at) naturally drops out of the function's own
-- `strategy_call_at < now() - 7 days` filter — confirmed against real rows
-- before writing this file (see Restorix Memories for the exact query and
-- results), no separate handling needed here.
--
-- Does NOT touch the existing lazy client-side escalation from Prompt 540
-- (escalateStaleNoShows, still called from useMyBooked in useLeads.js) —
-- left in place as a harmless, idempotent no-op once this job has already
-- run (see the comment at the top of no-show-lost-timeout/index.ts for why).
-- ─────────────────────────────────────────────────────────────────────────

select cron.schedule(
  'no-show-lost-timeout-daily',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://avgvmzshujwphneykuvu.supabase.co/functions/v1/no-show-lost-timeout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from app_secrets where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
