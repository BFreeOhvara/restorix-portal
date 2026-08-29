-- Prompt 554 — real 24h No-Answer hold.
--
-- ⚠️ NOT YET APPLIED. Eagle applies this via the Supabase MCP against
--    project `avgvmzshujwphneykuvu` (same flow as Prompt 549), then confirms
--    with a real setter test account per the verification notes below.
--
-- This repo has no migrations history table wired to `supabase db push`;
-- DB changes are applied directly via MCP and tracked in Supabase's own
-- `supabase_migrations.schema_migrations`. This file is the reviewed source
-- of record for that apply.
--
-- ── Why ────────────────────────────────────────────────────────────────
-- OLD: `_do_setter_day_end` rolled every still-assigned `no_answer` lead at
-- the setter's local day-end (null `assigned_setter` + insert a
-- `no_answer_queue` row with `available_at = now() + 24h`), and
-- `redistribute_no_answers()` later handed each queued lead to a random
-- *different* active setter — never to Unassigned. Net: a No-Answer lead
-- went invisible to everyone at day-end, then silently bounced to another
-- rep ~24h after day-end.
--
-- NEW: day-end leaves `no_answer` leads alone. `handle_lead_pipeline`
-- already keeps `assigned_setter` set and stamps `no_answer_at` when the
-- status flips, so the lead stays in the rep's own pool view AND admin's
-- Setter → No Answer sub-tab (`assigned_setter IS NOT NULL`) for a real 24h
-- from `no_answer_at`. When that window expires, `redistribute_no_answers()`
-- drops it straight to the general Unassigned pool
-- (`assigned_setter = null, status = 'new', no_answer_at = null`) for anyone
-- to pick up — no more auto-hand-off to a specific other rep.
--
-- Applies to setters AND closers: the mechanism keys off `leads.no_answer_at`,
-- not the assigned role. Closer midnight release already exists
-- (`_do_closer_day_end` / `process_all_closer_day_ends`, Prompt 547,
-- migration 20260828222610) and is unchanged. `run_setter_day_end` stays
-- setter-only on purpose — the setter path does a behavioral_health-only
-- 150-lead refill that must NOT run for closers, who have their own
-- release-only `run_closer_day_end`.
--
-- Live state at authoring time: `no_answer_queue` has 0 rows, 9 `no_answer`
-- leads all still assigned, none past 24h — so applying this does not
-- trigger any mass release.
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._do_setter_day_end(p_setter_id uuid)
 RETURNS TABLE(no_answer_rolled integer, new_released integer, refilled integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tz text;
  v_local_date date;
  v_last date;
  v_new_count int;
  v_due_count int;
  v_needed int;
  v_released int := 0;
  v_refilled int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('day_end:' || p_setter_id::text));

  select timezone, last_day_end_date into v_tz, v_last from profiles where id = p_setter_id;
  v_tz := coalesce(v_tz, 'America/Chicago');
  v_local_date := (now() at time zone v_tz)::date;

  if v_last is not null and v_last >= v_local_date then
    no_answer_rolled := 0;
    new_released := 0;
    refilled := 0;
    return next;
    return;
  end if;

  -- Prompt 554 — the no_answer-rolling half is gone. no_answer leads now
  -- ride a real 24h hold keyed off leads.no_answer_at (released to Unassigned
  -- by redistribute_no_answers()), not this per-setter day-end. Only the
  -- new-status release + refill remains. no_answer_rolled is kept in the
  -- RETURNS TABLE signature (callers / PostgREST schema cache) but is
  -- always 0 now.

  update leads
  set assigned_setter = null
  where assigned_setter = p_setter_id and status = 'new';
  get diagnostics v_released = row_count;

  select count(*) into v_new_count from leads where assigned_setter = p_setter_id and status = 'new';
  select count(*) into v_due_count
    from follow_up_queue fq
    where fq.setter_id = p_setter_id and fq.completed_at is null
      and (fq.follow_up_at at time zone v_tz)::date <= v_local_date;

  v_needed := greatest(0, 150 - v_new_count - v_due_count);
  if v_needed > 0 then
    update leads set assigned_setter = p_setter_id
    where id in (
      select id from leads
      where assigned_setter is null and status = 'new' and niche = 'behavioral_health'
      order by created_at
      limit v_needed
    );
    get diagnostics v_refilled = row_count;
  end if;

  update profiles set last_day_end_date = v_local_date where id = p_setter_id;

  no_answer_rolled := 0;
  new_released := v_released;
  refilled := v_refilled;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.redistribute_no_answers()
 RETURNS TABLE(redistributed_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int := 0;
begin
  -- Prompt 554 — expire the 24h No-Answer hold. A no_answer lead stays with
  -- whoever marked it (assigned_setter untouched by the trigger + day-end)
  -- until 24h past leads.no_answer_at, then drops to the general Unassigned
  -- pool for anyone to pick up. Replaces the old "reassign to a random
  -- different active setter via no_answer_queue" behavior entirely.
  --
  -- Function name + cron schedule (cron.job jobid 2, '*/5 * * * *') kept for
  -- continuity. The no_answer_queue table is no longer read or written here
  -- (see COMMENT ON TABLE public.no_answer_queue).
  update leads
  set assigned_setter = null,
      status = 'new',
      no_answer_at = null
  where status = 'no_answer'
    and no_answer_at is not null
    and now() - no_answer_at >= interval '24 hours';
  get diagnostics n = row_count;

  redistributed_count := n;
  return next;
end;
$function$;

COMMENT ON TABLE public.no_answer_queue IS
  'DEPRECATED (Prompt 554, 2026-08-29). Was the hand-off queue between '
  '_do_setter_day_end (which inserted rolled no_answer leads) and '
  'redistribute_no_answers (which reassigned them to another setter). Both '
  'sides now bypass it: no_answer leads ride a 24h hold keyed off '
  'leads.no_answer_at and release straight to Unassigned. Table + any '
  'historical rows retained as an audit trail; safe to drop once no longer '
  'referenced for history.';
