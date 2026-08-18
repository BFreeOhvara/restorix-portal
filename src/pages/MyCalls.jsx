import { useState } from 'react'
import { Play, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useMyCallsForDay, fetchRecordingUrl } from '../hooks/useCalls'
import StatusBadge from '../components/ui/StatusBadge'
import { DayPaginator } from '../components/ui/DayPaginator'
import { zonedDateStr } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'

function fmt(dt) {
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function fmtDuration(seconds) {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Recordings can only be fetched through the authenticated get-recording
// proxy (Twilio media needs credentials the browser can never hold), and
// only on demand — fetching a blob per row eagerly for a list of 100
// calls would be a lot of wasted Twilio API traffic for recordings
// nobody ends up listening to.
function RecordingPlayer({ callId }) {
  const [state, setState] = useState('idle') // idle | loading | ready | error
  const [blobUrl, setBlobUrl] = useState(null)
  const [error, setError] = useState('')

  async function play() {
    setState('loading')
    setError('')
    try {
      const url = await fetchRecordingUrl(callId)
      setBlobUrl(url)
      setState('ready')
    } catch (e) {
      setError(e.message || 'Failed to load recording')
      setState('error')
    }
  }

  if (state === 'ready' && blobUrl) {
    return <audio controls autoPlay src={blobUrl} className="h-8 w-56" />
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={play}
        disabled={state === 'loading'}
        className="flex items-center gap-1.5 rounded-full border border-line bg-elevated px-3 py-1.5 font-sans text-xs font-medium text-fg-primary hover:border-fg-primary/40 disabled:opacity-60"
      >
        {state === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
        {state === 'loading' ? 'Loading…' : 'Play'}
      </button>
      {state === 'error' && <span className="font-sans text-xs text-danger">{error}</span>}
    </div>
  )
}

export default function MyCalls() {
  const { profile } = useAuth()
  const tz = profile?.timezone || DEFAULT_TIMEZONE
  const [date, setDate] = useState(() => zonedDateStr(Date.now(), tz))
  const { data: calls, isLoading } = useMyCallsForDay(date, tz)
  const isAdmin = profile?.role === 'admin'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">My Calls</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">
            {isAdmin ? 'Every call placed through the dashboard, this day' : 'Calls you\'ve placed through the dashboard, this day'}
          </p>
        </div>
        <DayPaginator date={date} onChange={setDate} timezone={tz} />
      </div>

      {/* Own scroll region, same treatment as Overview's lead table
          (Prompt 440) — fixed-height box with its own scrollbar rather
          than the whole page scrolling. */}
      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !calls?.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            No calls logged this day.
          </p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="eyebrow sticky top-0 z-10 bg-surface">
                <tr>
                  <th className="px-5 py-3">Lead</th>
                  {isAdmin && <th className="px-5 py-3">Setter</th>}
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Duration</th>
                  <th className="px-5 py-3">Outcome</th>
                  <th className="px-5 py-3">Recording</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-t border-line font-sans text-sm">
                    <td className="px-5 py-4 font-medium text-fg-primary">{c.leads?.facility_name || '—'}</td>
                    {isAdmin && <td className="px-5 py-4 text-fg-secondary">{c.profiles?.full_name || '—'}</td>}
                    <td className="px-5 py-4 text-fg-secondary">{fmt(c.created_at)}</td>
                    <td className="px-5 py-4 text-fg-secondary">{fmtDuration(c.duration_seconds)}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={c.outcome} />
                    </td>
                    <td className="px-5 py-4">
                      {c.recording_url ? (
                        <RecordingPlayer callId={c.id} />
                      ) : (
                        <span className="font-sans text-xs text-fg-faint">
                          {c.duration_seconds != null ? 'No recording' : 'Processing…'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
