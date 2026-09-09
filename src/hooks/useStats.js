import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { displayOutcome } from '../lib/closerOutcome'

// Stats are computed client-side from the leads table rather than a DB view
// or RPC.
//
// Prompt 437: leads are now admin-added (created_by is always admin), and
// assigned_setter/status are both transient — the pipeline (redistribution,
// follow-up returns) can cycle a lead's status back to 'new' well after a
// setter logged an outcome on it, and re-touches updated_at when it does.
// So neither status nor updated_at can tell you "what did this setter do,
// and when" — both get overwritten by later automated pipeline activity
// on the same row. last_action_by/last_action_status/last_action_at are
// stamped once, by the trigger, at the moment the setter actually logs the
// call, and are never touched again by the pipeline afterward — that's
// what stats key off, not the lead's current live state.
//
// Known limitation: these are single-slot stamps (the row's *latest*
// action), not a full history — if the same setter is handed the same
// lead twice, only the second call is reflected. A real per-call log table
// would fix that; out of scope for this pass.

export function useAllLeadsForStats() {
  return useQuery({
    queryKey: ['leads-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, last_action_by, last_action_status, last_action_at, assigned_closer, status, strategy_call_at, follow_up_at, closer_outcome, closer_outcome_at')
      if (error) throw error
      return data
    },
    // Prompt 459: same 15s safety net useMyPool/useLeads already have
    // (useLeads.js) — belt-and-suspenders so this self-heals even if some
    // future write path forgets to invalidate 'leads-stats' explicitly,
    // same reasoning that already justified the interval on those hooks.
    refetchInterval: 15000,
  })
}

export function useReps() {
  return useQuery({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, timezone')
        .in('role', ['setter', 'closer'])
        .order('full_name')
      if (error) throw error
      return data
    },
  })
}

// Prompt 458: `start`/`end` are now real instant strings (start inclusive,
// end EXCLUSIVE) — e.g. from zonedDayRange/zonedTimeToUtcIso in lib/dates.js
// — not bare 'YYYY-MM-DD' strings. Previously this assumed UTC-midnight
// bounds and fudged `end` by +86400000-1 to cover a whole calendar day;
// callers now compute the real per-user zoned day boundaries themselves,
// so a "day" here means whichever user's calendar day is relevant, not
// always UTC's.
export function inRange(iso, start, end) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (start && t < new Date(start).getTime()) return false
  if (end && t >= new Date(end).getTime()) return false
  return true
}

export function statsForUser(leads, userId, start, end) {
  const owned = leads.filter((l) => l.last_action_by === userId)
  const logged = owned.filter((l) => l.last_action_status && inRange(l.last_action_at, start, end))
  const booked = logged.filter((l) => l.last_action_status === 'appointment_booked')
  return {
    logged: logged.length,
    booked: booked.length,
    bookingPct: logged.length ? Math.round((booked.length / logged.length) * 100) : 0,
  }
}

// Follow-ups due today for a setter — keys off the same frozen
// last_action_* stamps as statsForUser rather than the live status/
// assigned_setter columns, since those get reset by process_follow_up_returns
// well before the due date if a different lead cycles through in the
// meantime; last_action_by/status/follow_up_at aren't touched again once set.
// Prompt 458: takes explicit start/end instants (e.g. from zonedDayRange)
// instead of a single todayStr, same shape as statsForUser now.
export function followUpsDueToday(leads, userId, start, end) {
  return leads.filter(
    (l) => l.last_action_by === userId && l.last_action_status === 'follow_up' && inRange(l.follow_up_at, start, end)
  ).length
}

// Prompt 579 — was `{ assigned }` only. Extended to the same depth the
// setter's own Stats page and CloserOverview already have, reusing
// CloserOverview's exact logic and reasoning (Overview.jsx) rather than a
// second computation:
//   - assigned / pending / noShow  → scoped by strategy_call_at (the
//     booked strategy call falls in the period)
//   - closed / lost                → scoped by closer_outcome_at (the
//     outcome was logged in the period — matches CloserOverview's own
//     closedThisWeek; a null stamp on an older row is simply not countable
//     in a date-ranged view, not an error)
//   - winRate                      → deliberately ALL-TIME regardless of
//     the selected period (a single period's sample is too small to mean
//     anything — CloserOverview's own words). closed / (closed + lost),
//     resolved deals only; pending/no-show are out of the denominator.
// No Show goes through displayOutcome, never a raw closer_outcome check —
// 'no_show' is derived, never stored (lib/closerOutcome.js).
export function statsForCloser(leads, closerId, start, end) {
  const mine = leads.filter(
    (l) => l.assigned_closer === closerId && l.status === 'appointment_booked'
  )

  const byCall = mine.filter((l) => inRange(l.strategy_call_at, start, end))
  const pending = byCall.filter((l) => displayOutcome(l) === 'pending').length
  const noShow = byCall.filter((l) => displayOutcome(l) === 'no_show').length

  // Closed/Lost scope by closer_outcome_at (matches CloserOverview's
  // closedThisWeek) for a bounded period. `closer_outcome_at` is
  // forward-only (Prompt 548) — older rows can have a null stamp — so on
  // an UNbounded (All Time) view, count those too rather than silently
  // dropping them, which would leave Closed/Lost reading 0 while an
  // all-time Win Rate below shows a real percentage.
  const unbounded = !start && !end
  const outcomeInRange = (iso) => (unbounded ? true : inRange(iso, start, end))
  const closed = mine.filter((l) => l.closer_outcome === 'closed' && outcomeInRange(l.closer_outcome_at)).length
  const lost = mine.filter((l) => l.closer_outcome === 'lost' && outcomeInRange(l.closer_outcome_at)).length

  const allClosed = mine.filter((l) => l.closer_outcome === 'closed').length
  const allLost = mine.filter((l) => l.closer_outcome === 'lost').length
  const winRate = allClosed + allLost > 0 ? `${Math.round((allClosed / (allClosed + allLost)) * 100)}%` : '—'

  return { assigned: byCall.length, pending, noShow, lost, closed, winRate }
}
