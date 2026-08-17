import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import StatusBadge from '../components/ui/StatusBadge'

function useMyActivity(setterId) {
  return useQuery({
    queryKey: ['my-activity', setterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, facility_name, contact_name, last_action_status, last_action_at')
        .eq('last_action_by', setterId)
        .not('last_action_at', 'is', null)
        .order('last_action_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
    enabled: !!setterId,
  })
}

function fmt(dt) {
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function Activity() {
  const { profile } = useAuth()
  const { data: rows, isLoading } = useMyActivity(profile?.id)

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Activity</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">Your most recent logged calls, newest first</p>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !rows?.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            No logged calls yet — activity shows up here as soon as you log your first one.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-sans text-sm font-medium text-fg-primary">{r.facility_name}</p>
                  <p className="truncate font-sans text-xs text-fg-secondary">{r.contact_name || 'No contact name'}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <StatusBadge status={r.last_action_status} />
                  <span className="font-sans text-xs text-fg-faint">{fmt(r.last_action_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 font-sans text-xs text-fg-faint">
        Shows your last 50 logged outcomes. A lead reappears here again if the pipeline reassigns it back to you and you log it a second time.
      </p>
    </div>
  )
}
