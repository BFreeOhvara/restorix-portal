import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Play, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useMyCallsForDay, fetchRecordingUrl } from '../hooks/useCalls'
import StatusBadge from '../components/ui/StatusBadge'
import { DayPaginator } from '../components/ui/DayPaginator'
import { DateCalendar } from '../components/ui/DateCalendar'
import Modal from '../components/ui/Modal'
import { zonedDateStr, monthOf } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'
import { usePageHeader } from '../components/Layout'

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
  // Prompt 474 / 561: page heading side of the label swap — setter (474)
  // and closer (561) both read "My Recordings"; only admin keeps "My Calls".
  // Same route/data either way.
  const heading = isAdmin ? 'My Calls' : 'My Recordings'
  usePageHeader({
    title: heading,
    subtitle: isAdmin ? 'Every call placed through the dashboard, this day' : 'Calls you\'ve placed through the dashboard, this day',
  })

  // Prompt 602 — jump-to-date popover next to the day-paginator arrows.
  // Single-date only (DateCalendar, not the range-picking
  // DateRangeCalendar) — wired straight to the same date/setDate state the
  // arrows already drive.
  const [calendarOpen, setCalendarOpen] = useState(false)
  const calendarRef = useRef(null)

  useEffect(() => {
    if (!calendarOpen) return
    function handleClick(e) {
      if (calendarRef.current && !calendarRef.current.contains(e.target)) setCalendarOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [calendarOpen])

  return (
    <div>
      <div className="flex justify-end">
        <div ref={calendarRef} className="relative">
          <DayPaginator
            date={date}
            onChange={setDate}
            timezone={tz}
            onLabelClick={() => setCalendarOpen((v) => !v)}
          />
          {calendarOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-72 shadow-lg">
              <p className="mb-2 rounded-card border border-line bg-elevated px-3 py-2 font-sans text-[11px] text-fg-secondary">
                Select a date.
              </p>
              <DateCalendar
                selected={date}
                onChange={(d) => { setDate(d); setCalendarOpen(false) }}
                initialMonth={monthOf(date)}
                today={zonedDateStr(Date.now(), tz)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Own scroll region, same treatment as Overview's lead table
          (Prompt 440). Prompt 602 — box quantized to the sticky header's
          own height (~43px) plus a whole number of rows, so the box's
          bottom edge always lands on a row's own bottom border and the
          page itself never needs to scroll, same approach 595/596 used
          for Overview's tables.
          Prompt 603 — 9 rows at the old 63px row height (610px) was
          measured to overflow by 32px; left at 8 rows (547px), flagged
          that the only way to fit more was shrinking the row height
          itself, not `main`'s shared bottom padding.
          Prompt 604 — did that: row height 63px→53px (cell padding
          py-4→py-2 to keep content from feeling cramped) buys 10 rows
          (43px header + 10×53px = 573px) in the same footprint 602/603
          already measured as available (578px before `main`'s own
          untouched 32px bottom padding), live-verified at 1366×768 with
          zero page scroll. */}
      <div className="mt-6 h-[573px] overflow-hidden rounded-card border border-line bg-elevated">
        <div className="h-full overflow-y-auto">
          <table className={clsx('w-full text-left', calls?.length > 0 && 'border-b border-line')}>
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
              {isLoading ? (
                <tr>
                  <td colSpan={99} className="h-[530px] px-8 text-center align-middle font-sans text-sm text-fg-secondary">
                    Loading…
                  </td>
                </tr>
              ) : !calls?.length ? (
                <tr>
                  <td colSpan={99} className="h-[530px] px-8 text-center align-middle font-sans text-sm text-fg-secondary">
                    No calls logged this day.
                  </td>
                </tr>
              ) : (
                calls.map((c) => (
                  <tr key={c.id} className="h-[53px] border-t border-line font-sans text-sm">
                    <td className="px-5 py-2 font-medium text-fg-primary">{c.leads?.facility_name || '—'}</td>
                    {isAdmin && <td className="px-5 py-2 text-fg-secondary">{c.profiles?.full_name || '—'}</td>}
                    <td className="px-5 py-2 text-fg-secondary">{fmt(c.created_at)}</td>
                    <td className="px-5 py-2 text-fg-secondary">{fmtDuration(c.duration_seconds)}</td>
                    <td className="px-5 py-2">
                      <StatusBadge status={c.outcome} />
                    </td>
                    <td className="px-5 py-2">
                      {c.recording_url ? (
                        <RecordingCell callId={c.id} />
                      ) : (
                        <span className="font-sans text-xs text-fg-faint">
                          {c.duration_seconds != null ? 'No recording' : 'Processing…'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
