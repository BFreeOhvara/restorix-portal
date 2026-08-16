import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Stats are computed client-side from the leads table rather than a DB view
// or RPC — this project has no per-action call-log timestamp (only
// created_at on the lead itself), so "logged in range" uses created_at as
// the closest available proxy. Booking milestones (badges) are all-time,
// not date-range-scoped, since they're cumulative achievements.

export function useAllLeadsForStats() {
  return useQuery({
    queryKey: ['leads-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, created_by, assigned_closer, status, created_at, strategy_call_at')
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
  const owned = leads.filter((l) => l.created_by === userId && inRange(l.created_at, start, end))
  const logged = owned.filter((l) => l.status !== 'new')
  const booked = owned.filter((l) => l.status === 'booked')
  return {
    logged: logged.length,
    booked: booked.length,
    bookingPct: logged.length ? Math.round((booked.length / logged.length) * 100) : 0,
  }
}

export function statsForCloser(leads, closerId, start, end) {
  const assigned = leads.filter(
    (l) => l.assigned_closer === closerId && l.status === 'booked' && inRange(l.strategy_call_at, start, end)
  )
  return { assigned: assigned.length }
}

export const BADGE_TIERS = [
  { threshold: 5, label: '5 Booked' },
  { threshold: 25, label: '25 Booked' },
  { threshold: 50, label: '50 Booked' },
]

export function badgesForCount(allTimeBookedCount) {
  const earned = BADGE_TIERS.filter((t) => allTimeBookedCount >= t.threshold)
  const next = BADGE_TIERS.find((t) => allTimeBookedCount < t.threshold)
  return { earned, next }
}
