import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import StatusBadge from '../components/ui/StatusBadge'
import { DayPaginator } from '../components/ui/DayPaginator'
import { todayUTCStr, dayRange } from '../lib/dates'

// Prompt 451: switched from `leads.last_action_*` to the `calls` table
// (Prompt 447) — the same reasoning Prompt 443's badge system already
// established for "what happened over time" queries. `leads.last_action_*`
// is frozen per-lead (one row, overwritten on the next action), so if a
// setter dials the same lead twice in one day, only the second outcome
// would show — the day-filter this prompt asks for would silently drop
// the earlier attempt. `calls` has one row per real dial, so a day's
// activity is actually complete.
function useMyActivityForDay(setterId, date) {
  return useQuery({
    queryKey: ['my-activity', setterId, date],
    queryFn: async () => {
      const { start, end } = dayRange(date)
      const { data, error } = await supabase
        .from('calls')
        .select('id, outcome, created_at, leads(facility_name, contact_name)')
        .eq('setter_id', setterId)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!setterId,
  })
}

function fmtTime(dt) {
  return new Date(dt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function Activity() {
  const { profile } = useAuth()
  const [date, setDate] = useState(todayUTCStr())
  const { data: rows, isLoading } = useMyActivityForDay(profile?.id, date)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">Activity</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">Calls you logged this day</p>
        </div>
        <DayPaginator date={date} onChange={setDate} />
      </div>

      {/* Own scroll region, same treatment as Overview's lead table
          (Prompt 440) — fixed-height box with its own scrollbar rather
          than the whole page scrolling. */}
      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !rows?.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            No calls logged this day.
          </p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto">
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-sans text-sm font-medium text-fg-primary">{r.leads?.facility_name || '—'}</p>
                    <p className="truncate font-sans text-xs text-fg-secondary">{r.leads?.contact_name || 'No contact name'}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    {r.outcome ? <StatusBadge status={r.outcome} /> : <span className="font-sans text-xs text-fg-faint">In progress</span>}
                    <span className="font-sans text-xs text-fg-faint">{fmtTime(r.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
