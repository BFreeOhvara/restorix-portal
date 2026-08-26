import { useEffect, useState } from 'react'
import { Play, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useMyCallsForDay, fetchRecordingUrl } from '../hooks/useCalls'
import StatusBadge from '../components/ui/StatusBadge'
import { DayPaginator } from '../components/ui/DayPaginator'
import Modal from '../components/ui/Modal'
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
//
// Prompt 525 — the player itself now lives in a centered Modal instead of
// inline in the table row (was a full <audio> scrubber taking over the
// Recording cell). Fetch starts the moment the modal opens rather than
// waiting for a second click inside it — "Play Recording" is already the
// explicit play action, a loading state inside the modal is enough
// feedback. Revokes the blob URL on close/unmount since the modal gives
// this a real lifecycle to hang cleanup on (the old inline version had no
// such moment).
function RecordingModal({ callId, onClose }) {
  const [state, setState] = useState('loading') // loading | ready | error
  const [blobUrl, setBlobUrl] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchRecordingUrl(callId)
      .then((url) => {
        if (cancelled) { URL.revokeObjectURL(url); return }
        setBlobUrl(url)
        setState('ready')
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Failed to load recording')
          setState('error')
        }
      })
    return () => { cancelled = true }
  }, [callId])

  useEffect(() => {
    if (!blobUrl) return
    return () => URL.revokeObjectURL(blobUrl)
  }, [blobUrl])

  return (
    <Modal title="Call Recording" onClose={onClose}>
      {state === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-6 font-sans text-sm text-fg-secondary">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      )}
      {state === 'error' && <p className="py-2 font-sans text-sm text-danger">{error}</p>}
      {state === 'ready' && blobUrl && <audio controls autoPlay src={blobUrl} className="w-full" />}
    </Modal>
  )
}

function RecordingCell({ callId }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-line bg-elevated px-3 py-1.5 font-sans text-xs font-medium text-fg-primary hover:border-fg-primary/40"
      >
        <Play size={13} /> Play Recording
      </button>
      {open && <RecordingModal callId={callId} onClose={() => setOpen(false)} />}
    </>
  )
}

export default function MyCalls() {
  const { profile } = useAuth()
  const tz = profile?.timezone || DEFAULT_TIMEZONE
  const [date, setDate] = useState(() => zonedDateStr(Date.now(), tz))
  const { data: calls, isLoading } = useMyCallsForDay(date, tz)
  const isAdmin = profile?.role === 'admin'
  // Prompt 474: setter-only label swap, page heading side — closer/admin
  // keep "My Calls" exactly as-is, same route/data either way.
  const heading = profile?.role === 'setter' ? 'My Recordings' : 'My Calls'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">{heading}</h1>
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
                        <RecordingCell callId={c.id} />
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
