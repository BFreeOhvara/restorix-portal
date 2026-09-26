import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Play, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useMyCallsForDay, fetchRecordingUrl, useMyStrategyRecordings, fetchStrategyRecordingUrl } from '../hooks/useCalls'
import StatusBadge from '../components/ui/StatusBadge'
import { DayPaginator } from '../components/ui/DayPaginator'
import { DateCalendar } from '../components/ui/DateCalendar'
import Modal from '../components/ui/Modal'
import { zonedDateStr, zonedDayRange, monthOf } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'
import { usePageHeader } from '../components/Layout'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'

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

// Prompt 646 — closer-only Setter/Closer split, same boxed SegmentedTabs
// variant="grouped" My Pipeline/Team Activity use. Setter = the dialer
// calls this page has always listed; Closer = Zoom strategy-call
// recordings (Prompt 647: real rows from zoom_recordings once
// zoom-recording-webhook has stored any; honest Soon state until then).
// Prompt 649: the rows now come from the closer's own browser tab
// (lib/callRecorder) — recording is live, so the empty state is just
// "none yet", no Soon badge.
const RECORDING_TABS = [
  { key: 'setter', label: 'Setter' },
  { key: 'closer', label: 'Closer' },
]

// Prompt 656 — same copy as before 656, just rendered inside the table's
// body instead of replacing the whole box, so the header (Lead/When/
// Duration/Recording) stays visible even with zero rows.
function CloserRecordingsEmptyState() {
  return (
    <div className="mx-auto max-w-sm">
      <p className="font-sans text-sm font-medium text-fg-faint">Strategy call recordings</p>
      <p className="mt-1.5 font-sans text-xs text-fg-faint">
        Each strategy call you run in the Meeting Room is recorded from your browser tab and shows up here, attached to the lead, once the call ends. No recordings yet.
      </p>
    </div>
  )
}

// Prompt 647 — same modal lifecycle as the Setter RecordingModal, but the
// file is a short-lived signed URL on the private call-recordings bucket
// (streamed by the <video> element) rather than a proxied blob.
function StrategyRecordingModal({ storagePath, onClose }) {
  const [state, setState] = useState('loading') // loading | ready | error
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchStrategyRecordingUrl(storagePath)
      .then((signed) => {
        if (cancelled) return
        setUrl(signed)
        setState('ready')
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Failed to load recording')
          setState('error')
        }
      })
    return () => { cancelled = true }
  }, [storagePath])

  return (
    <Modal title="Strategy Call Recording" onClose={onClose}>
      {state === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-6 font-sans text-sm text-fg-secondary">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      )}
      {state === 'error' && <p className="py-2 font-sans text-sm text-danger">{error}</p>}
      {state === 'ready' && url && <video controls autoPlay src={url} className="w-full rounded-card bg-black" />}
    </Modal>
  )
}

function StrategyRecordingCell({ recording }) {
  const [open, setOpen] = useState(false)

  if (recording.status === 'failed') {
    return <span className="font-sans text-xs text-danger">Couldn't save</span>
  }
  if (recording.status !== 'stored' || !recording.storage_path) {
    return <span className="font-sans text-xs text-fg-faint">Processing…</span>
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-line bg-elevated px-3 py-1.5 font-sans text-xs font-medium text-fg-primary hover:border-fg-primary/40"
      >
        <Play size={13} /> Play Recording
      </button>
      {open && <StrategyRecordingModal storagePath={recording.storage_path} onClose={() => setOpen(false)} />}
    </>
  )
}

// Same box/row geometry as the Setter table (736px box, 63px rows) so
// switching tabs never moves the page.
// Prompt 656 — `date`/`tz` add the same day filter the Setter tab already
// has (DayPaginator + jump-to-date calendar, driven by the shared `date`
// state in MyCalls below). useMyStrategyRecordings() itself stays flat
// (Prompt 649's own note: "a closer runs a handful of strategy calls, not
// a dialer's hundred calls a day") — filtered client-side by day instead
// of adding a second, day-scoped query.
function CloserRecordings({ date, tz }) {
  const { data: allRecordings, isLoading } = useMyStrategyRecordings()
  const { start, end } = zonedDayRange(date, tz)
  const recordings = allRecordings?.filter((r) => {
    const t = r.recorded_at || r.created_at
    return t >= start && t < end
  })
  const isEmpty = !isLoading && !recordings?.length

  return (
    <div className="mt-5 h-[736px] overflow-hidden rounded-card border border-line bg-elevated">
      <div className="h-full overflow-y-auto">
        <table className={clsx('w-full text-left', recordings?.length > 0 && 'border-b border-line')}>
          <thead className="eyebrow sticky top-0 z-10 bg-surface">
            <tr>
              <th className="px-5 py-3">Lead</th>
              <th className="px-5 py-3">When</th>
              <th className="px-5 py-3">Duration</th>
              <th className="px-5 py-3">Recording</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={99} className="h-[693px] px-8 text-center align-middle font-sans text-sm text-fg-secondary">
                  Loading…
                </td>
              </tr>
            ) : isEmpty ? (
              <tr>
                <td colSpan={99} className="h-[693px] px-8 text-center align-middle">
                  <CloserRecordingsEmptyState />
                </td>
              </tr>
            ) : (
              recordings.map((r) => (
                <tr key={r.id} className="h-[63px] border-t border-line font-sans text-sm">
                  <td className="px-5 py-4 font-medium text-fg-primary">
                    {r.leads?.facility_name || '—'}
                    {/* Prompt 649 — long calls are saved in ~15-minute parts. */}
                    {r.part_number > 1 && <span className="ml-2 font-normal text-fg-faint">Part {r.part_number}</span>}
                  </td>
                  <td className="px-5 py-4 text-fg-secondary">{fmt(r.recorded_at || r.created_at)}</td>
                  <td className="px-5 py-4 text-fg-secondary">{fmtDuration(r.duration_seconds)}</td>
                  <td className="px-5 py-4">
                    <StrategyRecordingCell recording={r} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function MyCalls() {
  const { profile } = useAuth()
  const tz = profile?.timezone || DEFAULT_TIMEZONE
  const [date, setDate] = useState(() => zonedDateStr(Date.now(), tz))
  const { data: calls, isLoading } = useMyCallsForDay(date, tz)
  const isAdmin = profile?.role === 'admin'
  // Prompt 646 — only closers get the tabs; a setter's page and admin's
  // "My Calls" render exactly as before.
  const isCloser = profile?.role === 'closer'
  // Prompt 657 — a closer who's flipped "I also set" off doesn't self-dial,
  // so the Setter tab (their dialer call history) is dead weight: no tab
  // bar at all, always the Closer (strategy-call recordings) content.
  // Undefined defaults to true (every existing closer's row).
  const isSetter = profile?.is_setter !== false
  const showRecordingTabs = isCloser && isSetter
  const [tab, setTab] = useState('setter')
  const effectiveTab = isCloser && !isSetter ? 'closer' : tab
  // Prompt 653 — Meeting Room's Recordings card links here with
  // ?tab=closer (a closer just recorded a call, or wants their most recent
  // one) so it lands on the right tab instead of always defaulting to
  // Setter. Only applies once we know this profile is actually a closer.
  const [searchParams] = useSearchParams()
  useEffect(() => {
    if (isCloser && searchParams.get('tab') === 'closer') setTab('closer')
  }, [isCloser, searchParams])
  // Prompt 474 / 561: page heading side of the label swap — setter (474)
  // and closer (561) both read "My Recordings"; only admin keeps "My Calls".
  // Same route/data either way.
  const heading = isAdmin ? 'My Calls' : 'My Recordings'
  // Prompt 646 — Closer tab gets its own subtitle, same per-tab swap My
  // Pipeline does; the Setter tab keeps the existing copy.
  usePageHeader({
    title: heading,
    subtitle: isAdmin
      ? 'Every call placed through the dashboard, this day'
      : effectiveTab === 'closer' ? 'Your strategy call recordings' : 'Calls you\'ve placed through the dashboard, this day',
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

  // Prompt 646 — closes the jump-to-date popover so it doesn't reopen on
  // its own when switching back to Setter.
  function handleTabChange(key) {
    setTab(key)
    setCalendarOpen(false)
  }

  return (
    <div>
      {/* Prompt 656 — the date paginator now applies to both tabs (the
          Closer tab filters its own recordings by the same selected day,
          same as Setter always has), so it's no longer gated on
          effectiveTab === 'setter'. 657's "skip the row entirely for a
          closer-only user" no longer applies either, since that user's
          sole (Closer) tab still needs the date filter. */}
      <div className={clsx('flex', showRecordingTabs ? 'flex-wrap items-center justify-between gap-3' : 'justify-end')}>
        {showRecordingTabs && (
          <SegmentedTabs tabs={RECORDING_TABS} active={tab} onChange={handleTabChange} variant="grouped" />
        )}
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

      {/* Prompt 646 — the tabs row is 42px vs the paginator's 38px, so the
          closer's top margin drops 24px→20px (here and in
          CloserRecordingsEmptyState's box) to keep total page height, and
          605's no-page-scroll fit, unchanged. */}
      {effectiveTab === 'closer' ? <CloserRecordings date={date} tz={tz} /> : (<>
      {/* Own scroll region, same treatment as Overview's lead table
          (Prompt 440). Prompt 602 — box quantized to the sticky header's
          own height (~43px) plus a whole number of rows, so the box's
          bottom edge always lands on a row's own bottom border and the
          page itself never needs to scroll, same approach 595/596 used
          for Overview's tables.
          Prompt 603 — 9 rows at the old 63px row height (610px) was
          measured to overflow by 32px; left at 8 rows (547px).
          Prompt 604 — shrank rows 63px→53px to buy 10 rows; reverted by
          605 (below) — Brayden's own live screenshot showed real slack
          604's synthetic-viewport measurement missed, so the box grows
          instead of the rows shrinking.
          Prompt 605 — row height/padding back to original (63px /
          py-4), box grown to 11 rows (43px header + 11×63px = 736px),
          `mt-6` left untouched. At the 1366×768 viewport 602/603 tested,
          this box alone (736px) already exceeds that viewport's whole
          content height, so 11 rows only fits if Brayden's real window
          is taller than that synthetic check — which his screenshot
          says it is. NOT live-verified against real data this session:
          the local checkout has no `.env.local`, so the dev server
          can't authenticate — flagged for Brayden rather than guessing
          at numbers. */}
      <div className={clsx(isCloser ? 'mt-5' : 'mt-6', 'h-[736px] overflow-hidden rounded-card border border-line bg-elevated')}>
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
                  <td colSpan={99} className="h-[693px] px-8 text-center align-middle font-sans text-sm text-fg-secondary">
                    Loading…
                  </td>
                </tr>
              ) : !calls?.length ? (
                <tr>
                  <td colSpan={99} className="h-[693px] px-8 text-center align-middle font-sans text-sm text-fg-secondary">
                    No calls logged this day.
                  </td>
                </tr>
              ) : (
                calls.map((c) => (
                  <tr key={c.id} className="h-[63px] border-t border-line font-sans text-sm">
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>)}
    </div>
  )
}
