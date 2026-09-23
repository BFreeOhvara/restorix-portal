import { useMemo, useState } from 'react'
import { Video } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useStrategyCalls } from '../hooks/useStrategyCalls'
import { Button } from '../components/ui/Button'
import { usePageHeader } from '../components/Layout'
import { StrategyCallRow } from './Overview'
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

// Prompt 636 — one shared useStrategyCalls call (leads/tz/now) feeding both
// the status card and the table, only ever rendered once `profile` is
// guaranteed non-null (MeetingRoom below guards this).
function MeetingRoomBody({ profile, onOpenLead, onJoin }) {
  const { isLoading, tz, todaysCalls, upcomingCalls, now } = useStrategyCalls(profile)

  return (
    <>
      <MeetingStatusCard tz={tz} now={now} todaysCalls={todaysCalls} upcomingCalls={upcomingCalls} onJoin={onJoin} />
      <CallsCard
        isLoading={isLoading}
        tz={tz}
        now={now}
        todaysCalls={todaysCalls}
        upcomingCalls={upcomingCalls}
        onOpenLead={onOpenLead}
        onJoin={onJoin}
      />
    </>
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
