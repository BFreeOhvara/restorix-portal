import { useMemo } from 'react'
import { useMyBooked } from './useLeads'
import { inRange } from './useStats'
import { zonedDateStr, zonedDayRange } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'

// Prompt 615 — extracted out of Overview.jsx's CloserOverview (Prompt 608)
// so the new Meeting Room tab can show the exact same today's/upcoming
// calls list without re-deriving it a second time. Behavior unchanged from
// 608: raw closer_outcome (not displayOutcome) so a No Show that happened
// today still shows up for the closer to log a real outcome, capped-at-5
// upcoming list sorted chronologically.
const UPCOMING_CALLS_LIMIT = 5

export function useStrategyCalls(profile) {
  const { data: leads, isLoading } = useMyBooked(profile.id)
  const tz = profile.timezone || DEFAULT_TIMEZONE

  const todayRange = useMemo(() => zonedDayRange(zonedDateStr(Date.now(), tz), tz), [tz])

  const todaysCalls = useMemo(
    () =>
      (leads || [])
        .filter(
          (l) =>
            l.strategy_call_at &&
            inRange(l.strategy_call_at, todayRange.start, todayRange.end) &&
            (!l.closer_outcome || l.closer_outcome === 'pending')
        )
        .sort((a, b) => new Date(a.strategy_call_at) - new Date(b.strategy_call_at)),
    [leads, todayRange]
  )

  const upcomingCalls = useMemo(
    () =>
      (leads || [])
        .filter(
          (l) =>
            l.strategy_call_at &&
            new Date(l.strategy_call_at) >= new Date(todayRange.end) &&
            (!l.closer_outcome || l.closer_outcome === 'pending')
        )
        .sort((a, b) => new Date(a.strategy_call_at) - new Date(b.strategy_call_at))
        .slice(0, UPCOMING_CALLS_LIMIT),
    [leads, todayRange]
  )

  return { leads, isLoading, tz, todaysCalls, upcomingCalls }
}
