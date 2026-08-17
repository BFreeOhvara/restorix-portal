import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Prompt 443: 26 badges across 4 categories (5 counting Commission),
// all computed from the `calls` table (Prompt 447) now that it exists —
// a more accurate "dials" source than the old last_action_* proxy on
// leads, since calls is one row per real dial attempt, not per lead.
export const DIAL_TIERS = [150, 500, 1000, 2500, 5000, 10000]
export const BOOKING_TIERS = [5, 15, 25, 50, 100, 200]
export const PERFECT_DAY_TIERS = [1, 5, 10, 25, 50]
export const COMMISSION_TIERS = [100, 250, 500, 1000, 2500, 5000, 10000]

export function tieredProgress(value, thresholds) {
  const earned = thresholds.filter((t) => value >= t)
  const next = thresholds.find((t) => value < t)
  return { earned, next }
}

// All of a setter's own calls, all-time — badges need the full history,
// not the My Calls page's 100-row display cap.
export function useMyAllCalls(setterId) {
  return useQuery({
    queryKey: ['calls-all', setterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select('created_at, outcome')
        .eq('setter_id', setterId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!setterId,
  })
}

// Same UTC-calendar-day convention already used everywhere else in this
// app for "today" (Overview's TodayStrip, My Goals' daily target) —
// staying consistent rather than introducing local-time grouping just
// for badges, which would make a "perfect day" disagree with "Booked
// Today" on where the day boundary actually falls.
function dayKey(iso) {
  return new Date(iso).toISOString().split('T')[0]
}

export function computeBadgeProgress(calls) {
  const dials = calls.length
  const bookings = calls.filter((c) => c.outcome === 'appointment_booked').length

  const byDay = new Map()
  for (const c of calls) {
    const key = dayKey(c.created_at)
    if (!byDay.has(key)) byDay.set(key, { dials: 0, bookings: 0 })
    const d = byDay.get(key)
    d.dials += 1
    if (c.outcome === 'appointment_booked') d.bookings += 1
  }

  let perfectDays = 0
  let hatTrick = false
  for (const d of byDay.values()) {
    if (d.dials >= 150 && d.bookings >= 2) perfectDays += 1
    if (d.bookings >= 3) hatTrick = true
  }

  // Back-to-Back: two consecutive logged outcomes (in the setter's own
  // chronological sequence) both Appointment Booked — calls with no
  // outcome yet (abandoned before Save) don't count as part of the
  // sequence, since they're not a logged outcome at all.
  const outcomeSequence = calls.filter((c) => c.outcome).map((c) => c.outcome)
  let backToBack = false
  for (let i = 1; i < outcomeSequence.length; i++) {
    if (outcomeSequence[i] === 'appointment_booked' && outcomeSequence[i - 1] === 'appointment_booked') {
      backToBack = true
      break
    }
  }

  return { dials, bookings, perfectDays, backToBack, hatTrick }
}
