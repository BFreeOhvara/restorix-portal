-- Prompt 660 — Close deals through real Stripe ACH payments instead of a
-- manual Closed button.
--
-- ⚠️ NOT YET APPLIED, same classifier block as every prior DDL/cron prompt
--    (506/515, 554, 611, 619, 657, 659). Eagle/Brayden applies this via the
--    Supabase MCP or SQL editor against project `avgvmzshujwphneykuvu`.
--
-- ⚠️ TWO-PART APPLY, not optional this time: Postgres will not let a new
--    enum value be referenced in the same transaction block that added it
--    ("unsafe use of new value of enum type"). Run Part 1 alone, let it
--    commit, THEN run Part 2 (they're separated below with a clear marker).
--    If applying by hand in the SQL editor, that's two separate "Run"
--    clicks — don't paste the whole file as one statement.
--
-- Also blocked, same classifier: deploying the three new edge functions.
-- Once their source exists (it does, see supabase/functions/) run:
--   supabase functions deploy create-payment-request --project-ref avgvmzshujwphneykuvu
--   supabase functions deploy stripe-payment-webhook --no-verify-jwt --project-ref avgvmzshujwphneykuvu
--   supabase functions deploy expire-awaiting-payment --no-verify-jwt --project-ref avgvmzshujwphneykuvu
-- Deploy the functions BEFORE applying Part 2 below — its cron.schedule
-- starts calling expire-awaiting-payment on the very next tick, and the
-- Stripe dashboard webhook (see secrets list) needs stripe-payment-webhook
-- already live to point at.
--
-- Required Supabase secrets (paste in once Brayden's real/test Stripe
-- account exists — see supabase/functions/create-payment-request/index.ts
-- and stripe-payment-webhook/index.ts headers for exactly which):
--   STRIPE_SECRET_KEY
--   STRIPE_WEBHOOK_SECRET
--
-- ── What this does ──────────────────────────────────────────────────────
-- `awaiting_payment` — a new closer_outcome_status value for "payment
-- request sent, not yet confirmed." Distinct from `pending` (call hasn't
-- happened / no outcome logged yet) per the prompt's own instruction not
-- to overload that value.
--
-- New leads columns carry the Stripe side of a deal: which customer/
-- invoice/subscription/payment-method this lead is tied to, when its
-- payment request went out (anchors the grace-period timeout in
-- expire-awaiting-payment), and a flag for "payment failed/disputed after
-- this lead was already marked Closed" (task #4's "don't silently unwind
-- it, flag it" requirement) rather than a guessed automatic reversal.
--
-- `contact_email` is new too — Stripe's hosted invoice email (the
-- "email is simplest via Stripe's own hosted invoice email" choice the
-- prompt calls out) needs a real address to send to, and nothing on
-- `leads` carried one before this (phone was the only contact channel,
-- used for the client-portal SMS invite). Collected by the closer at
-- Send-Payment-Request time, same moment deal_setup_fee/deal_first_month_fee
-- get entered/confirmed now (previously only entered at Closed time).
-- ─────────────────────────────────────────────────────────────────────────

-- ============================================================
-- PART 1 — run this alone, let it commit before Part 2
-- ============================================================

alter type closer_outcome_status add value if not exists 'awaiting_payment';

-- ============================================================
-- PART 2 — run after Part 1 has committed
-- ============================================================

alter table leads
  add column if not exists contact_email text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_invoice_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists awaiting_payment_at timestamptz,
  add column if not exists payment_failed_at timestamptz,
  add column if not exists payment_failed_note text;

comment on column leads.awaiting_payment_at is
  'Prompt 660 — set when create-payment-request sends the Stripe invoice. Anchors the grace-period check in expire-awaiting-payment (auto-Lost if still awaiting_payment this long after).';
comment on column leads.payment_failed_at is
  'Prompt 660 — set by stripe-payment-webhook when a payment fails/is disputed AFTER this lead was already marked Closed. Deliberately does not change closer_outcome away from closed — flagged for Brayden to review, not auto-unwound (see the prompt''s own instruction not to guess how to unwind a closed deal).';

create index if not exists leads_stripe_invoice_id_idx on leads (stripe_invoice_id) where stripe_invoice_id is not null;
create index if not exists leads_stripe_subscription_id_idx on leads (stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists leads_stripe_customer_id_idx on leads (stripe_customer_id) where stripe_customer_id is not null;

-- Task #4 — the Zoom call-end lifecycle hook. A booked lead still sitting
-- as 'pending' (or null — same isNoShow()/handle_lead_pipeline default)
-- when the closer leaves the meeting had a real strategy call happen with
-- no outcome ever logged and no payment ever requested: per the prompt,
-- that becomes Lost automatically rather than sitting there. Called from
-- MeetingRoom.jsx's closeCall() (see src/pages/MeetingRoom.jsx), the exact
-- moment the Zoom join/leave lifecycle already tears the call down —
-- nothing about joining/leaving itself changes.
--
-- SECURITY DEFINER + an explicit assigned_closer = auth.uid() check
-- (mirrors request_closer_leads' own pattern) rather than relying on
-- leads' existing RLS update policy, so this can't be pointed at a lead
-- the caller doesn't own. A lead already 'awaiting_payment' is
-- deliberately left alone here — its own grace period is time-based
-- (expire-awaiting-payment), not tied to this specific call-end moment,
-- since a client can finish authorizing their bank after the call/modal
-- has already closed.
create or replace function mark_call_ended_no_outcome(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update leads
  set closer_outcome = 'lost',
      closer_notes = trim(both E'\n' from concat_ws(E'\n\n', closer_notes,
        '[Automatic — call ended] Marked Lost: strategy call ended with no outcome logged and no payment ever requested.'))
  where id = p_lead_id
    and assigned_closer = auth.uid()
    and status = 'appointment_booked'
    and (closer_outcome is null or closer_outcome = 'pending');
end;
$$;

grant execute on function mark_call_ended_no_outcome(uuid) to authenticated;

-- ============================================================
-- Cron — expire-awaiting-payment, every 15 minutes (grace period is
-- 45 minutes — see the edge function header for why that number).
-- Same net.http_post + x-cron-secret pattern as send-appointment-reminders
-- / no-show-lost-timeout. Deploy the function BEFORE running this.
-- ============================================================

select cron.schedule(
  'expire-awaiting-payment-15m',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://avgvmzshujwphneykuvu.supabase.co/functions/v1/expire-awaiting-payment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from app_secrets where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
