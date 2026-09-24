import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Video, CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useStrategyCalls } from '../hooks/useStrategyCalls'
import { useZoomConnection } from '../hooks/useZoom'
import { Button } from '../components/ui/Button'
import OutcomeBadge from '../components/ui/OutcomeBadge'
import { usePageHeader } from '../components/Layout'
import { StrategyCallRow, Tile, DateClockRow } from './Overview'
import { SoonBadge } from './Settings'
import { AGENT_CATALOG } from '../lib/agentCatalog'
import { displayOutcome } from '../lib/closerOutcome'
import { formatPhone } from '../lib/phone'
import { zonedDateStr, zonedDayRange } from '../lib/dates'
import CloserLeadModal from '../components/CloserLeadModal'
import ZoomCallModal from '../components/ZoomCallModal'

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
      <div className="rounded-card border border-line bg-elevated p-6">
        <p className="font-sans text-sm font-semibold text-fg-primary">You have a meeting to join</p>
        <p className="mt-1 font-sans text-xs text-fg-secondary">
          {joinable.facility_name} · {when}
        </p>
        <div className="mt-4">
          <Button
            type="button"
            onClick={() =>
              onJoin({ meetingNumber: joinable.zoom_meeting_id, password: joinable.zoom_meeting_password })
            }
            className="!px-6 !py-3 !text-base"
          >
            <Video size={18} /> Join the Meeting Room
          </Button>
        </div>
      </div>
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

  return (
    <div className="rounded-card border border-line bg-elevated p-6">
      <p className="font-sans text-sm font-semibold text-fg-primary">You have no meetings to join</p>
      {next && (
        <p className="mt-1 font-sans text-xs text-fg-secondary">
          Next call: {nextWhen} with {next.facility_name}
        </p>
      )}
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
                  onEmbedJoin={() => onJoin({ meetingNumber: lead.zoom_meeting_id, password: lead.zoom_meeting_password })}
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
                  onEmbedJoin={() => onJoin({ meetingNumber: lead.zoom_meeting_id, password: lead.zoom_meeting_password })}
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
// schema. Anything not backed by real data yet is an honest "Soon" card.

const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_CALLS_LIMIT = 5

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
    <div className="flex h-full flex-col rounded-card border border-line bg-elevated p-6">
      <p className="font-sans text-sm font-semibold text-fg-primary">Room check</p>
      <p className="mt-1 font-sans text-xs text-fg-secondary">What the Meeting Room needs before a call.</p>
      <div className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line">
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
        className="mt-4 inline-flex items-center gap-1.5 self-start font-sans text-sm font-semibold text-accent hover:opacity-80"
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

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Tile label="Calls Today" value={isLoading ? '—' : todaysCalls.length} />
      <Tile label="Next 7 Days" value={isLoading ? '—' : stats.nextWeek} />
      <Tile label="Zoom Links Ready" value={isLoading ? '—' : stats.zoomReady} />
      <Tile label="Awaiting Outcome" value={isLoading ? '—' : stats.awaiting} />
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
      <SectionHeading title="Call Prep" />
      <div className="mt-3 rounded-card border border-line bg-elevated p-6">
        {isLoading ? (
          <p className="text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !call ? (
          <p className="text-center font-sans text-sm text-fg-secondary">
            Nothing booked to prep for yet. Your next call’s details land here.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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

            <div className="flex min-w-0 flex-col">
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
              <div className="mt-4">
                <Button type="button" variant="secondary" onClick={() => onOpenLead(call)}>
                  Open lead
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// The other end of the call: the closer's most recent past calls with the
// outcome each one actually has (displayOutcome, so an unlogged past call
// reads as No Show exactly as it does on Overview/My Pipeline). Clicking a
// row opens the same lead modal to log or change the outcome.
function RecentCallsCard({ isLoading, leads, tz, now, onOpenLead }) {
  const recent = useMemo(
    () =>
      (leads || [])
        .filter((l) => l.strategy_call_at && new Date(l.strategy_call_at).getTime() < now)
        .sort((a, b) => new Date(b.strategy_call_at) - new Date(a.strategy_call_at))
        .slice(0, RECENT_CALLS_LIMIT),
    [leads, now]
  )

  return (
    <div>
      <SectionHeading
        title="Recent Calls"
        action={
          <Link
            to="/my-pipeline"
            className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-accent hover:opacity-80"
          >
            My Pipeline <ArrowRight size={14} />
          </Link>
        }
      />
      <div className="mt-3 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !recent.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">No past calls yet.</p>
        ) : (
          <table className="w-full text-left">
            <thead className="eyebrow bg-surface">
              <tr>
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => onOpenLead(lead)}
                  className="cursor-pointer border-t border-line font-sans text-sm hover:bg-surface"
                >
                  <td className="px-5 py-4 font-mono text-fg-primary [font-variant-numeric:tabular-nums]">
                    {fmtWhen(lead.strategy_call_at, tz)}
                  </td>
                  <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                  <td className="px-5 py-4">
                    <OutcomeBadge outcome={displayOutcome(lead)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const SOON_ITEMS = [
  {
    title: 'Recordings & transcripts',
    description: 'Each call’s Zoom recording and transcript, attached to the lead afterward.',
  },
  {
    title: 'Camera & mic check',
    description: 'Test your devices here before the join window opens.',
  },
]

function SoonCard() {
  return (
    <div className="rounded-card border border-line bg-elevated p-6">
      <p className="font-sans text-sm font-semibold text-fg-primary">Coming to the Meeting Room</p>
      <div className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line">
        {SOON_ITEMS.map((item) => (
          <div key={item.title} className="bg-surface px-4 py-3">
            <p className="flex items-center gap-2 font-sans text-sm font-medium text-fg-faint">
              {item.title}
              <SoonBadge />
            </p>
            <p className="mt-0.5 font-sans text-xs text-fg-faint">{item.description}</p>
          </div>
        ))}
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

  return (
    <div>
      <div className="flex justify-end">
        <DateClockRow timezone={tz} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MeetingStatusCard tz={tz} now={now} todaysCalls={todaysCalls} upcomingCalls={upcomingCalls} onJoin={onJoin} />
          <div className="mt-5">
            <RoomStats isLoading={isLoading} leads={leads} tz={tz} now={now} todaysCalls={todaysCalls} />
          </div>
        </div>
        <RoomCheckCard profile={profile} />
      </div>

      <div className="mt-8">
        <CallPrepCard
          isLoading={isLoading}
          tz={tz}
          now={now}
          todaysCalls={todaysCalls}
          upcomingCalls={upcomingCalls}
          onOpenLead={onOpenLead}
        />
      </div>

      <div className="mt-8">
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

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentCallsCard isLoading={isLoading} leads={leads} tz={tz} now={now} onOpenLead={onOpenLead} />
        </div>
        <div className="lg:pt-10">
          <SoonCard />
        </div>
      </div>
    </div>
  )
}

export default function MeetingRoom() {
  const { profile } = useAuth()
  usePageHeader({ title: 'Meeting Room', subtitle: 'Join a call without leaving the app.' })
  const [activeLead, setActiveLead] = useState(null)
  const [activeCall, setActiveCall] = useState(null) // { meetingNumber, password } | null

  if (!profile) return null

  return (
    <div>
      <MeetingRoomBody profile={profile} onOpenLead={setActiveLead} onJoin={setActiveCall} />
      {activeLead && <CloserLeadModal lead={activeLead} onClose={() => setActiveLead(null)} />}
      {activeCall && (
        <ZoomCallModal
          meetingNumber={activeCall.meetingNumber}
          password={activeCall.password}
          displayName={profile.full_name || profile.username}
          onClose={() => setActiveCall(null)}
        />
      )}
    </div>
  )
}
