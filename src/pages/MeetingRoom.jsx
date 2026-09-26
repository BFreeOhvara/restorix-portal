import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Video, CheckCircle2, Circle, ArrowRight, Mic } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useStrategyCalls } from '../hooks/useStrategyCalls'
import { useZoomConnection } from '../hooks/useZoom'
import { useMyStrategyRecordings } from '../hooks/useCalls'
import { Button } from '../components/ui/Button'
import { usePageHeader } from '../components/Layout'
import { StrategyCallRow } from './Overview'
import { AGENT_CATALOG } from '../lib/agentCatalog'
import { displayOutcome } from '../lib/closerOutcome'
import { formatPhone } from '../lib/phone'
import { zonedDateStr, zonedDayRange } from '../lib/dates'
import CloserLeadModal from '../components/CloserLeadModal'
import ZoomCallModal from '../components/ZoomCallModal'
import { RecordingIndicator, RecordingSaveBanner } from '../components/CallRecordingStatus'
import { startCallRecording } from '../lib/callRecorder'

// Prompt 615 — first piece of Phase 2 ("bring the call into the portal"):
// one destination for quick-join links into a closer's booked Strategy
// Calls, instead of scattered across Settings and Overview.
// Prompt 618 — Phase 3: join actions open the call in an embedded modal
// (ZoomCallModal, via the Meeting SDK) instead of a new tab. `data` is the
// widened {join_url, meeting_number, password} shape from
// get-zoom-personal-room.
// Prompt 636 — the standing Personal Meeting Room (not tied to any booked
// call) is gone per Brayden's own call: Meeting Room is now 100% about
// booked Strategy Calls. Replaced by a live status card, below, that's
// driven by whether there's a call to join right now.
const JOIN_WINDOW_MS = 15 * 60 * 1000

// Prompt 636 — the top-of-page status box: "is there something to join
// right now." Considers todaysCalls + upcomingCalls together (both already
// exclude anything the closer has logged an outcome for) — the soonest
// call with a real zoom_join_url that has entered its 15-minute join
// window wins, no upper bound (a call in progress stays joinable). When
// nothing is in-window, names the next booked call (if any) so it's clear
// why there's nothing to click yet, rather than leaving the state blank.
function MeetingStatusCard({ tz, now, todaysCalls, upcomingCalls, onJoin }) {
  const { joinable, next, isNextToday } = useMemo(() => {
    const all = [...todaysCalls, ...upcomingCalls].sort(
      (a, b) => new Date(a.strategy_call_at) - new Date(b.strategy_call_at)
    )
    const joinable = all.find(
      (l) => l.zoom_join_url && now >= new Date(l.strategy_call_at).getTime() - JOIN_WINDOW_MS
    )
    const next = joinable ? null : all[0] || null
    const isNextToday = next ? todaysCalls.some((l) => l.id === next.id) : false
    return { joinable, next, isNextToday }
  }, [todaysCalls, upcomingCalls, now])

  if (joinable) {
    const when = new Date(joinable.strategy_call_at).toLocaleString('en-US', {
      timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
    return (
      <JoinPanel
        active
        title="You have a meeting to join"
        detail={`${joinable.facility_name} · ${when}`}
        hint="The room is open. The call runs right here in the portal."
        onJoin={() =>
          onJoin({ leadId: joinable.id, meetingNumber: joinable.zoom_meeting_id, password: joinable.zoom_meeting_password })
        }
      />
    )
  }

  const nextWhen = next
    ? isNextToday
      ? `Today at ${new Date(next.strategy_call_at).toLocaleTimeString('en-US', {
          timeZone: tz, hour: 'numeric', minute: '2-digit',
        })}`
      : new Date(next.strategy_call_at).toLocaleString('en-US', {
          timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        })
    : null

  // Prompt 645 — display only: says when the (disabled) button will come
  // alive. The gating decision itself is the useMemo above, unchanged.
  const opensAt = next ? new Date(next.strategy_call_at).getTime() - JOIN_WINDOW_MS : null
  const opensLabel = next
    ? isNextToday
      ? new Date(opensAt).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
      : fmtWhen(new Date(opensAt).toISOString(), tz)
    : null

  return (
    <JoinPanel
      title="You have no meetings to join"
      detail={next ? `Next call: ${nextWhen} with ${next.facility_name}` : 'No strategy calls booked yet.'}
      hint={
        !next
          ? 'Unlocks 15 minutes before your next booked call.'
          : next.zoom_join_url
            ? `Unlocks at ${opensLabel}.`
            : `Unlocks at ${opensLabel}, once the call’s Zoom meeting is created.`
      }
    />
  )
}

// Prompt 645 — the one join button, active or not. Same size, icon and
// label in both states so an empty room reads as "this button, not yet"
// rather than a different object; disabled swaps the accent fill for a
// muted one (a 50%-opacity accent still looked clickable).
function JoinRoomButton({ disabled, onClick }) {
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="!px-6 !py-3 !text-base disabled:!bg-muted disabled:!text-fg-faint disabled:!opacity-100"
    >
      <Video size={18} /> Join the Meeting Room
    </Button>
  )
}

// Prompt 645 — MeetingStatusCard's frame for both states: status line,
// headline, detail, then the join button with a hint beside it.
function JoinPanel({ active = false, title, detail, hint, onJoin }) {
  return (
    <div
      className={clsx(
        'relative flex h-full flex-col overflow-hidden rounded-card border bg-elevated p-6 sm:p-8',
        active ? 'border-accent/40' : 'border-line'
      )}
    >
      {active && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-transparent"
        />
      )}
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {active && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
            )}
            <span className={clsx('relative inline-flex h-2.5 w-2.5 rounded-full', active ? 'bg-success' : 'bg-fg-faint')} />
          </span>
          <p className="eyebrow">{active ? 'Room open' : 'Room closed'}</p>
        </div>
        <p className="mt-4 font-display text-2xl font-medium text-fg-primary sm:text-3xl">{title}</p>
        <p className="mt-2 font-sans text-sm text-fg-secondary">{detail}</p>
        <div className="mt-auto flex flex-col items-start gap-3 pt-8 sm:flex-row sm:items-center sm:gap-4">
          <JoinRoomButton disabled={!active} onClick={onJoin} />
          <p className="font-sans text-xs text-fg-faint">{hint}</p>
        </div>
      </div>
    </div>
  )
}

// Prompt 615 — reuses Prompt 608's exact todaysCalls/upcomingCalls data
// shape (useStrategyCalls) and StrategyCallRow so this list looks and
// behaves identically to Overview's own Strategy Calls section, just in
// its own dedicated destination.
function CallsCard({ isLoading, tz, now, todaysCalls, upcomingCalls, onOpenLead, onJoin }) {
  return (
    <div className="mt-6">
      <h2 className="font-display text-lg font-medium text-fg-primary">Today's & Upcoming Calls</h2>
      <div className="mt-3 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !todaysCalls.length && !upcomingCalls.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            No strategy calls booked today or upcoming.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="eyebrow bg-surface">
              <tr>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {todaysCalls.length > 0 && upcomingCalls.length > 0 && (
                <tr>
                  <td colSpan={4} className="eyebrow border-t border-line bg-surface px-5 py-2 !text-fg-faint">
                    Today
                  </td>
                </tr>
              )}
              {todaysCalls.map((lead) => (
                <StrategyCallRow
                  key={lead.id}
                  lead={lead}
                  tz={tz}
                  now={now}
                  onOpen={() => onOpenLead(lead)}
                  onEmbedJoin={() => onJoin({ leadId: lead.id, meetingNumber: lead.zoom_meeting_id, password: lead.zoom_meeting_password })}
                />
              ))}
              {todaysCalls.length > 0 && upcomingCalls.length > 0 && (
                <tr>
                  <td colSpan={4} className="eyebrow border-t border-line bg-surface px-5 py-2 !text-fg-faint">
                    Upcoming
                  </td>
                </tr>
              )}
              {upcomingCalls.map((lead) => (
                <StrategyCallRow
                  key={lead.id}
                  lead={lead}
                  tz={tz}
                  now={now}
                  onOpen={() => onOpenLead(lead)}
                  showDate
                  onEmbedJoin={() => onJoin({ leadId: lead.id, meetingNumber: lead.zoom_meeting_id, password: lead.zoom_meeting_password })}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Prompt 644 — the page built out around 636's status card + calls table
// (both untouched). Everything below reads the same useMyBooked `leads`
// array useStrategyCalls already holds, plus the closer's own Zoom
// connection row and profile — no new queries against new tables, no new
// schema.

const DAY_MS = 24 * 60 * 60 * 1000

function fmtWhen(iso, tz) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function isOpenOutcome(lead) {
  return !lead.closer_outcome || lead.closer_outcome === 'pending'
}

// The call Call Prep focuses on — the same rule MeetingStatusCard uses to
// pick what it shows (in-window joinable call first, else the soonest
// booked call), so the two panels always talk about the same call.
function pickFocusCall(todaysCalls, upcomingCalls, now) {
  const all = [...todaysCalls, ...upcomingCalls].sort(
    (a, b) => new Date(a.strategy_call_at) - new Date(b.strategy_call_at)
  )
  const joinable = all.find(
    (l) => l.zoom_join_url && now >= new Date(l.strategy_call_at).getTime() - JOIN_WINDOW_MS
  )
  return { call: joinable || all[0] || null, isJoinable: !!joinable }
}

function SectionHeading({ title, action }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="font-display text-lg font-medium text-fg-primary">{title}</h2>
      {action}
    </div>
  )
}

function CheckRow({ ok, label, detail }) {
  return (
    <div className="flex items-start gap-3 bg-surface px-4 py-3">
      {ok ? (
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
      ) : (
        <Circle size={16} className="mt-0.5 shrink-0 text-fg-faint" />
      )}
      <div className="min-w-0">
        <p className="font-sans text-sm font-medium text-fg-primary">{label}</p>
        {detail && <p className="mt-0.5 font-sans text-xs text-fg-secondary">{detail}</p>}
      </div>
    </div>
  )
}

// Is the room itself ready — the closer's real Zoom connection (the same
// closer_zoom_tokens row Settings → Integrations reads) and their saved
// auto-open preference, described exactly as honestly as Settings does
// ("not yet wired into automatic behavior").
function RoomCheckCard({ profile }) {
  const { data: connection, isLoading } = useZoomConnection(profile.id)
  const connected = !!connection

  return (
    <div className="flex h-full flex-col rounded-card border border-line bg-elevated p-6 sm:p-8">
      <p className="eyebrow">Room check</p>
      <p className="mt-2 font-sans text-sm text-fg-secondary">What the Meeting Room needs before a call.</p>
      <div className="mt-5 divide-y divide-line overflow-hidden rounded-lg border border-line">
        {isLoading ? (
          <p className="bg-surface px-4 py-3 font-sans text-sm text-fg-secondary">Checking…</p>
        ) : (
          <>
            <CheckRow
              ok={connected}
              label="Zoom account"
              detail={connected ? `Connected${connection.zoom_email ? ` as ${connection.zoom_email}` : ''}` : 'Not connected — meetings can’t be created for your calls'}
            />
            <CheckRow
              ok={connected}
              label="Join inside the portal"
              detail={connected ? 'Calls open right here, no separate tab' : 'Needs a connected Zoom account'}
            />
          </>
        )}
        <CheckRow
          ok={!!profile.auto_open_meeting_room}
          label={`Auto-open before calls: ${profile.auto_open_meeting_room ? 'On' : 'Off'}`}
          detail="Saved preference — not wired into automatic behavior yet"
        />
      </div>
      <Link
        to="/settings"
        className="mt-auto inline-flex items-center gap-1.5 self-start pt-5 font-sans text-sm font-semibold text-accent hover:opacity-80"
      >
        Manage in Settings <ArrowRight size={14} />
      </Link>
    </div>
  )
}

// Numbers that matter from inside the Meeting Room specifically — today's
// load, the week ahead, whether Zoom links exist for what's booked, and
// how many past calls still need an outcome logged. Same leads array,
// same outcome rules (raw closer_outcome for open calls, displayOutcome
// for No Show) as Overview/My Pipeline.
function RoomStats({ isLoading, leads, tz, now, todaysCalls }) {
  const stats = useMemo(() => {
    const all = leads || []
    const todayStart = new Date(zonedDayRange(zonedDateStr(now, tz), tz).start).getTime()
    const open = all.filter(
      (l) => l.strategy_call_at && isOpenOutcome(l) && new Date(l.strategy_call_at).getTime() >= todayStart
    )
    const nextWeek = open.filter((l) => {
      const t = new Date(l.strategy_call_at).getTime()
      return t >= now && t < now + 7 * DAY_MS
    }).length
    const ready = open.filter((l) => l.zoom_join_url).length
    const awaiting = all.filter((l) => displayOutcome(l) === 'no_show').length
    return { nextWeek, zoomReady: open.length ? `${ready} / ${open.length}` : '—', awaiting }
  }, [leads, tz, now])

  const items = [
    { label: 'Calls Today', value: todaysCalls.length },
    { label: 'Next 7 Days', value: stats.nextWeek },
    { label: 'Zoom Links Ready', value: stats.zoomReady },
    { label: 'Awaiting Outcome', value: stats.awaiting },
  ]

  // Prompt 645 — one strip with hairline dividers (gap-px over bg-line)
  // instead of four separate bordered boxes; same numbers as before.
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line bg-clip-padding sm:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="bg-elevated px-5 py-4">
          <p className="eyebrow">{s.label}</p>
          <p className="mt-1.5 font-display text-2xl font-medium text-fg-primary [font-variant-numeric:tabular-nums]">
            {isLoading ? '—' : s.value}
          </p>
        </div>
      ))}
    </div>
  )
}

const REMINDERS = [
  { key: 'reminder_24h_sent_at', label: '24h' },
  { key: 'reminder_1h_sent_at', label: '1h' },
  { key: 'reminder_15m_sent_at', label: '15m' },
]

// A one-glance brief on the call you're about to take: who, the setter's
// own notes from booking it, whether the lead's automated reminder texts
// actually went out (send-appointment-reminders stamps these columns),
// and whether the Closer Survey has already been run for this lead. Opens
// the same CloserLeadModal the table rows do for survey/outcome/reschedule.
function CallPrepCard({ isLoading, tz, now, todaysCalls, upcomingCalls, onOpenLead }) {
  const { call, isJoinable } = useMemo(
    () => pickFocusCall(todaysCalls, upcomingCalls, now),
    [todaysCalls, upcomingCalls, now]
  )

  return (
    <div>
      <SectionHeading
        title="Call Prep"
        action={
          call && (
            <button
              type="button"
              onClick={() => onOpenLead(call)}
              className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-accent hover:opacity-80"
            >
              Open lead <ArrowRight size={14} />
            </button>
          )
        }
      />
      <div className="mt-3 rounded-card border border-line bg-elevated p-6 sm:p-8">
        {isLoading ? (
          <p className="text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !call ? (
          <p className="text-center font-sans text-sm text-fg-secondary">
            Nothing booked to prep for yet. Your next call’s details land here.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
            <div className="min-w-0">
              <p className="eyebrow">{isJoinable ? 'Joinable now' : 'Next up'}</p>
              <p className="mt-2 font-display text-xl font-medium text-fg-primary">{call.facility_name}</p>
              <p className="mt-1 font-mono text-sm text-fg-secondary [font-variant-numeric:tabular-nums]">
                {fmtWhen(call.strategy_call_at, tz)}
              </p>
              <p className="mt-3 font-sans text-sm text-fg-primary">
                {call.contact_name || 'No contact name'}
                <span className="text-fg-secondary"> · {formatPhone(call.phone) || 'No phone'}</span>
              </p>
              <p className="eyebrow mt-5">Setter notes</p>
              {call.notes ? (
                <p className="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-primary">
                  {call.notes}
                </p>
              ) : (
                <p className="mt-2 font-sans text-sm text-fg-faint">No notes from the setter.</p>
              )}
            </div>

            <div className="min-w-0">
              <p className="eyebrow mb-2">Readiness</p>
              <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                <CheckRow
                  ok={!!call.zoom_join_url}
                  label="Zoom meeting"
                  detail={call.zoom_join_url ? 'Created — joinable from 15 minutes before' : 'Zoom pending — no meeting created yet'}
                />
                <div className="flex items-start gap-3 bg-surface px-4 py-3">
                  {REMINDERS.some((r) => call[r.key]) ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                  ) : (
                    <Circle size={16} className="mt-0.5 shrink-0 text-fg-faint" />
                  )}
                  <div className="min-w-0">
                    <p className="font-sans text-sm font-medium text-fg-primary">Reminder texts to the lead</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {REMINDERS.map((r) => (
                        <span
                          key={r.key}
                          title={call[r.key] ? `Sent ${fmtWhen(call[r.key], tz)}` : 'Not sent'}
                          className={clsx(
                            'rounded-full border px-2 py-0.5 font-mono text-[11px]',
                            call[r.key] ? 'border-success/40 text-success' : 'border-line text-fg-faint'
                          )}
                        >
                          {r.label} {call[r.key] ? 'sent' : '—'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <CheckRow
                  ok={!!call.survey_front_runner}
                  label="Closer Survey"
                  detail={
                    call.survey_front_runner
                      ? `${AGENT_CATALOG[call.survey_front_runner]?.label || call.survey_front_runner}${
                          call.survey_sub_agents?.length
                            ? ` + ${call.survey_sub_agents.length} sub-agent${call.survey_sub_agents.length === 1 ? '' : 's'}`
                            : ''
                        }`
                      : 'Not run yet — run it with them on the call'
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function fmtRecordedAt(dt) {
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function fmtRecordingDuration(seconds) {
  if (seconds == null) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Prompt 653 — replaces the "Recordings & transcripts" Soon placeholder
// with the real thing: 649 already records every Meeting Room call from
// the closer's own browser tab, so this reads the same zoom_recordings
// rows My Recordings' Closer tab shows (useMyStrategyRecordings), and
// surfaces the single most recent one rather than duplicating that
// page's full table here.
function RecordingsCard() {
  const { data: recordings, isLoading } = useMyStrategyRecordings()
  const latest = recordings?.[0]
  const count = recordings?.length || 0

  return (
    <div className="flex h-full flex-col rounded-card border border-line bg-elevated p-6 sm:p-8">
      <p className="eyebrow">Recordings</p>
      <p className="mt-2 font-sans text-sm text-fg-secondary">
        Strategy calls you join here are recorded from your browser tab.
      </p>
      <div className="mt-5 flex-1">
        {isLoading ? (
          <p className="font-sans text-sm text-fg-secondary">Checking…</p>
        ) : !latest ? (
          <p className="font-sans text-sm text-fg-faint">No recordings yet — nothing recorded so far.</p>
        ) : (
          <div className="rounded-lg border border-line bg-surface px-4 py-3">
            <p className="font-sans text-sm font-medium text-fg-primary">
              {latest.leads?.facility_name || 'Unknown lead'}
              {latest.part_number > 1 && (
                <span className="ml-2 font-normal text-fg-faint">Part {latest.part_number}</span>
              )}
            </p>
            <p className="mt-0.5 font-mono text-xs text-fg-secondary [font-variant-numeric:tabular-nums]">
              {fmtRecordedAt(latest.recorded_at || latest.created_at)}
              {fmtRecordingDuration(latest.duration_seconds) && ` · ${fmtRecordingDuration(latest.duration_seconds)}`}
            </p>
            <p className={clsx('mt-1.5 font-sans text-xs font-medium', latest.status === 'failed' ? 'text-danger' : 'text-success')}>
              {latest.status === 'failed' ? "Couldn't save" : 'Saved'}
            </p>
          </div>
        )}
      </div>
      <Link
        to="/my-calls?tab=closer"
        className="mt-auto inline-flex items-center gap-1.5 self-start pt-5 font-sans text-sm font-semibold text-accent hover:opacity-80"
      >
        {count > 0 ? `View all ${count} recording${count === 1 ? '' : 's'}` : 'View My Recordings'} <ArrowRight size={14} />
      </Link>
    </div>
  )
}

const CAMERA_MIC_ERROR_COPY = {
  denied: 'Camera/mic access was denied. Allow access in your browser’s site settings, then try again.',
  'no-device': 'No camera or microphone was found on this device.',
  error: 'Couldn’t start the camera/mic check.',
}

// Live mic level (0–1) from a getUserMedia stream's audio track, via a Web
// Audio analyser rather than MediaRecorder — this never records or saves
// anything, it just reads the level while the check is running.
function useMicLevel(stream) {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) {
      setLevel(0)
      return
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioContextClass()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    let raf

    function tick() {
      analyser.getByteTimeDomainData(data)
      let sumSquares = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sumSquares += v * v
      }
      setLevel(Math.min(1, Math.sqrt(sumSquares / data.length) * 4))
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      source.disconnect()
      analyser.disconnect()
      ctx.close().catch(() => {})
    }
  }, [stream])

  return level
}

// Prompt 653 — replaces the "Camera & mic check" Soon placeholder with a
// real self-test: a live camera preview and a mic level meter from the
// browser's own devices, independent of Zoom's SDK (matches 649's own tab
// capture, which is also plain browser APIs, not Zoom). Access is only
// requested on click, not on page load, and permission-denied/no-device
// are shown honestly rather than faked as a passing check.
function CameraMicCheckCard() {
  const [state, setState] = useState('idle') // idle | requesting | active | denied | no-device | error
  const [stream, setStream] = useState(null)
  const videoRef = useRef(null)
  const level = useMicLevel(state === 'active' ? stream : null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null
  }, [stream])

  // Stops the tracks if the closer navigates away mid-check.
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [stream])

  async function runCheck() {
    setState('requesting')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setStream(s)
      setState('active')
    } catch (e) {
      setState(e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
        ? 'denied'
        : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError'
          ? 'no-device'
          : 'error')
    }
  }

  function stopCheck() {
    stream?.getTracks().forEach((t) => t.stop())
    setStream(null)
    setState('idle')
  }

  return (
    <div className="flex h-full flex-col rounded-card border border-line bg-elevated p-6 sm:p-8">
      <p className="eyebrow">Camera &amp; mic check</p>
      <p className="mt-2 font-sans text-sm text-fg-secondary">Test your devices before the join window opens.</p>

      <div className="mt-5 flex flex-1 flex-col">
        {state === 'active' ? (
          <>
            <div className="aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            </div>
            <div className="mt-4">
              <p className="flex items-center gap-1.5 font-sans text-xs text-fg-secondary">
                <Mic size={14} /> Microphone level
              </p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-success transition-[width] duration-75"
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center">
            {['denied', 'no-device', 'error'].includes(state) && (
              <p className="font-sans text-xs text-danger">{CAMERA_MIC_ERROR_COPY[state]}</p>
            )}
            <p className="font-sans text-sm text-fg-secondary">
              {state === 'requesting' ? 'Requesting camera and microphone access…' : 'See a live preview and mic level before you join.'}
            </p>
          </div>
        )}
      </div>

      <div className="mt-5">
        {state === 'active' ? (
          <Button type="button" variant="secondary" onClick={stopCheck}>Stop check</Button>
        ) : (
          <Button type="button" variant="secondary" onClick={runCheck} disabled={state === 'requesting'}>
            <Video size={16} /> {['denied', 'no-device', 'error'].includes(state) ? 'Try again' : 'Run check'}
          </Button>
        )}
      </div>
    </div>
  )
}

// Prompt 636 — one shared useStrategyCalls call (leads/tz/now) feeding both
// the status card and the table, only ever rendered once `profile` is
// guaranteed non-null (MeetingRoom below guards this).
// Prompt 644 — same single hook call now also feeds the new sections.
function MeetingRoomBody({ profile, onOpenLead, onJoin }) {
  const { leads, isLoading, tz, todaysCalls, upcomingCalls, now } = useStrategyCalls(profile)

  // Prompt 653 — the stat strip now leads the page (Brayden's own layout
  // pass, same idea as Stats' top-of-page summary tiles), with the
  // join/room-check hero below it. Same 40px rhythm between sections,
  // each introduced by the same heading style.
  return (
    <div>
      <RoomStats isLoading={isLoading} leads={leads} tz={tz} now={now} todaysCalls={todaysCalls} />

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MeetingStatusCard tz={tz} now={now} todaysCalls={todaysCalls} upcomingCalls={upcomingCalls} onJoin={onJoin} />
        </div>
        <RoomCheckCard profile={profile} />
      </div>

      <div className="mt-10">
        <CallPrepCard
          isLoading={isLoading}
          tz={tz}
          now={now}
          todaysCalls={todaysCalls}
          upcomingCalls={upcomingCalls}
          onOpenLead={onOpenLead}
        />
      </div>

      {/* CallsCard (unchanged since 636) carries its own mt-6: 16 + 24 = the same 40px rhythm. */}
      <div className="mt-4">
        <CallsCard
          isLoading={isLoading}
          tz={tz}
          now={now}
          todaysCalls={todaysCalls}
          upcomingCalls={upcomingCalls}
          onOpenLead={onOpenLead}
          onJoin={onJoin}
        />
      </div>

      {/* Prompt 653 — Recent Calls removed (duplicated Overview/My Pipeline
          and now My Recordings); the two Soon items are now real. */}
      <div className="mt-10">
        <SectionHeading title="In the Meeting Room" />
        <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <RecordingsCard />
          <CameraMicCheckCard />
        </div>
      </div>
    </div>
  )
}

export default function MeetingRoom() {
  const { profile } = useAuth()
  usePageHeader({ title: 'Meeting Room', subtitle: 'Join a call without leaving the app.' })
  const [activeLead, setActiveLead] = useState(null)
  const [activeCall, setActiveCall] = useState(null) // { leadId, meetingNumber, password } | null
  // Prompt 649 — tab-capture recording of the call, started from the Join
  // click itself (the browser only allows the share prompt during a user
  // gesture) and stopped when the call modal closes.
  const recorderRef = useRef(null)
  const joinedRef = useRef(false)
  const [recording, setRecording] = useState(null)
  const queryClient = useQueryClient()

  if (!profile) return null

  function joinCall(call) {
    joinedRef.current = false
    // Token, not the recorder itself: onChange fires synchronously inside
    // startCallRecording, before its return value exists.
    const token = {}
    recorderRef.current = token
    const recorder = startCallRecording({
      leadId: call.leadId,
      closerId: profile.id,
      meetingNumber: call.meetingNumber,
      onChange: (next) => {
        // In-call states only matter for the call still open; the upload
        // outcome is shown whenever it lands.
        const live = recorderRef.current === token || recorderRef.current?.token === token
        if (!live && next.phase !== 'saving' && next.phase !== 'saved' && next.phase !== 'save_failed') return
        setRecording(next)
        if (next.phase === 'saved' || next.phase === 'save_failed') {
          queryClient.invalidateQueries({ queryKey: ['zoom_recordings'] })
        }
      },
    })
    recorder.token = token
    recorderRef.current = recorder
    setActiveCall(call)
  }

  function handleCallStatus(status) {
    if (status === 'joined') {
      joinedRef.current = true
      recorderRef.current?.markJoined()
    }
  }

  function closeCall() {
    const recorder = recorderRef.current
    recorderRef.current = null
    // Only the upload banner outlives the modal; in-call states clear.
    setRecording(null)
    recorder?.stop({ keepIt: joinedRef.current })
    setActiveCall(null)
  }

  return (
    <div>
      <RecordingSaveBanner state={recording} onDismiss={() => setRecording(null)} />
      <MeetingRoomBody profile={profile} onOpenLead={setActiveLead} onJoin={joinCall} />
      {activeLead && <CloserLeadModal lead={activeLead} onClose={() => setActiveLead(null)} />}
      {activeCall && (
        <ZoomCallModal
          meetingNumber={activeCall.meetingNumber}
          password={activeCall.password}
          displayName={profile.full_name || profile.username}
          onClose={closeCall}
          onStatusChange={handleCallStatus}
          recordingIndicator={<RecordingIndicator state={recording} />}
        />
      )}
    </div>
  )
}
