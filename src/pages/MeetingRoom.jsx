import { useState } from 'react'
import { Video } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useZoomConnection, useZoomPersonalRoom } from '../hooks/useZoom'
import { useStrategyCalls } from '../hooks/useStrategyCalls'
import { Button } from '../components/ui/Button'
import { usePageHeader } from '../components/Layout'
import { StrategyCallRow } from './Overview'
import CloserLeadModal from '../components/CloserLeadModal'
import ZoomCallModal from '../components/ZoomCallModal'

// Prompt 615 — first piece of Phase 2 ("bring the call into the portal"):
// one destination for both a closer's standing Personal Meeting Room and
// quick-join links for their booked Strategy Calls, instead of scattered
// across Settings and Overview.
// Prompt 618 — Phase 3: both join actions now open the call in an
// embedded modal (ZoomCallModal, via the Meeting SDK) instead of a new
// tab. `data` is the widened {join_url, meeting_number, password} shape
// from get-zoom-personal-room.
function PersonalRoomCard({ profile, onJoin }) {
  const { data: connection, isLoading: connectionLoading } = useZoomConnection(profile.id)
  const { data, isLoading: roomLoading, isError, error } = useZoomPersonalRoom(profile.id, !!connection)

  return (
    <div className="rounded-card border border-line bg-elevated p-6">
      <p className="font-sans text-sm font-semibold text-fg-primary">Your Meeting Room</p>
      <p className="mt-1 font-sans text-xs text-fg-secondary">
        A standing Zoom room you can start any time — not tied to any one lead. Share it or start it whenever you
        and a client are ready to meet.
      </p>

      <div className="mt-4">
        {connectionLoading ? (
          <p className="font-sans text-sm text-fg-secondary">Checking Zoom connection…</p>
        ) : !connection ? (
          <div className="space-y-2">
            <p className="font-sans text-sm text-fg-secondary">Connect Zoom to get your own Meeting Room.</p>
            <Link to="/settings">
              <Button type="button" variant="secondary">Go to Settings</Button>
            </Link>
          </div>
        ) : roomLoading ? (
          <p className="font-sans text-sm text-fg-secondary">Loading your room…</p>
        ) : isError || !data?.join_url ? (
          <p className="font-sans text-sm text-danger">
            {error?.message || "Couldn't load your Meeting Room — try again shortly."}
          </p>
        ) : (
          <Button
            type="button"
            onClick={() => onJoin({ meetingNumber: data.meeting_number, password: data.password })}
            className="!px-6 !py-3 !text-base"
          >
            <Video size={18} /> Start Your Meeting Room
          </Button>
        )}
      </div>
    </div>
  )
}

// Prompt 615 — reuses Prompt 608's exact todaysCalls/upcomingCalls data
// shape (useStrategyCalls) and StrategyCallRow so this list looks and
// behaves identically to Overview's own Strategy Calls section, just in
// its own dedicated destination.
function CallsCard({ profile, onOpenLead, onJoin }) {
  const { isLoading, tz, todaysCalls, upcomingCalls } = useStrategyCalls(profile)

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

export default function MeetingRoom() {
  const { profile } = useAuth()
  usePageHeader({ title: 'Meeting Room', subtitle: 'Start or join a call without leaving the app.' })
  const [activeLead, setActiveLead] = useState(null)
  const [activeCall, setActiveCall] = useState(null) // { meetingNumber, password } | null

  if (!profile) return null

  return (
    <div>
      <PersonalRoomCard profile={profile} onJoin={setActiveCall} />
      <CallsCard profile={profile} onOpenLead={setActiveLead} onJoin={setActiveCall} />
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
