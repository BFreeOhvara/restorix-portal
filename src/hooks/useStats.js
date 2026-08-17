import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

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
        .select('id, last_action_by, last_action_status, last_action_at, assigned_closer, status, strategy_call_at, follow_up_at')
      if (error) throw error
      return data
    },
  })
}

export function useReps() {
  return useQuery({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['setter', 'closer'])
        .order('full_name')
      if (error) throw error
      return data
    },
  })
}

export function inRange(iso, start, end) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (start && t < new Date(start).getTime()) return false
  if (end && t > new Date(end).getTime() + 86400000 - 1) return false
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
export function followUpsDueToday(leads, userId, todayStr) {
  return leads.filter(
    (l) => l.last_action_by === userId && l.last_action_status === 'follow_up' && inRange(l.follow_up_at, todayStr, todayStr)
  ).length
}

export function statsForCloser(leads, closerId, start, end) {
  const assigned = leads.filter(
    (l) => l.assigned_closer === closerId && l.status === 'appointment_booked' && inRange(l.strategy_call_at, start, end)
  )
  return { assigned: assigned.length }
}
