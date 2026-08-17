import { useMemo, useState } from 'react'
import { Phone } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useMyPool, useMyBooked, usePipelineHealth } from '../hooks/useLeads'
import { useAllLeadsForStats, useReps, statsForUser, statsForCloser } from '../hooks/useStats'
import { Button } from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
import LogCallModal from '../components/LogCallModal'

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function Tile({ label, value }) {
  return (
    <div className="rounded-card border border-line bg-elevated p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-3xl font-medium text-fg-primary">{value}</p>
    </div>
  )
}

function SetterOverview({ profile }) {
  const { data: leads, isLoading } = useMyPool(profile.id)
  const [callLead, setCallLead] = useState(null)

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Overview</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">
        {leads?.length ?? 0} lead{leads?.length === 1 ? '' : 's'} in your pool
      </p>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !leads?.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            Your pool is empty right now — new leads are assigned automatically.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="eyebrow bg-surface">
              <tr>
                <th className="px-5 py-3">Facility</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Next</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-line font-sans text-sm hover:bg-surface">
                  <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                  <td className="px-5 py-4 text-fg-secondary">{lead.contact_name || '—'}</td>
                  <td className="px-5 py-4 text-fg-secondary">{lead.phone || '—'}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-5 py-4 text-fg-secondary">
                    {lead.status === 'follow_up' ? fmt(lead.follow_up_at) : '—'}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => setCallLead(lead)}>
                      <Phone size={13} /> Log call
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {callLead && <LogCallModal lead={callLead} onClose={() => setCallLead(null)} />}
    </div>
  )
}

function CloserOverview({ profile }) {
  const { data: leads, isLoading } = useMyBooked(profile.id)

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Overview</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">{leads?.length ?? 0} upcoming</p>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <p className="font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !leads?.length ? (
          <div className="rounded-card border border-line bg-elevated p-8 text-center">
            <p className="font-sans text-sm text-fg-secondary">No Strategy Calls assigned to you yet.</p>
          </div>
        ) : (
          leads.map((lead) => (
            <div key={lead.id} className="rounded-card border border-line bg-elevated p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-lg font-medium text-fg-primary">{lead.facility_name}</h3>
                  <p className="mt-1 font-sans text-sm text-fg-secondary">
                    {lead.contact_name || 'No contact name'} · {lead.phone || 'No phone'}
                  </p>
                  {lead.notes && (
                    <p className="mt-2 max-w-xl font-sans text-sm text-fg-secondary">{lead.notes}</p>
                  )}
                </div>
                <span className="eyebrow rounded-full bg-[#dcf3e6] px-3 py-1.5 !text-success">
                  {fmt(lead.strategy_call_at)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function AdminOverview() {
  const { data: leads, isLoading: leadsLoading } = useAllLeadsForStats()
  const { data: reps } = useReps()
  const { data: health, isLoading: healthLoading } = usePipelineHealth()

  const rollup = useMemo(() => {
    if (!leads) return null
    const setters = (reps || []).filter((r) => r.role === 'setter')
    const closers = (reps || []).filter((r) => r.role === 'closer')
    return {
      setters: setters.map((s) => ({ ...s, ...statsForUser(leads, s.id) })),
      closers: closers.map((c) => ({ ...c, ...statsForCloser(leads, c.id) })),
    }
  }, [leads, reps])

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Overview</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">Team performance and pipeline health</p>

      <h2 className="mt-6 font-display text-lg font-medium text-fg-primary">Pipeline health</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Unassigned Pool" value={healthLoading ? '—' : health.unassignedPool} />
        <Tile label="No-Answer Cooldown" value={healthLoading ? '—' : health.noAnswerCooldown} />
        <Tile label="Follow-ups Due Today" value={healthLoading ? '—' : health.followUpsDueToday} />
      </div>

      {leadsLoading || !rollup ? (
        <p className="mt-8 font-sans text-sm text-fg-secondary">Loading…</p>
      ) : (
        <div className="mt-8 space-y-6">
          <div>
            <h2 className="font-display text-lg font-medium text-fg-primary">Setters</h2>
            <div className="mt-3 overflow-hidden rounded-card border border-line bg-elevated">
              <table className="w-full text-left">
                <thead className="eyebrow bg-surface">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Calls Logged</th>
                    <th className="px-5 py-3">Calls Booked</th>
                    <th className="px-5 py-3">Booking Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rollup.setters.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center font-sans text-sm text-fg-secondary">
                        No setters yet.
                      </td>
                    </tr>
                  ) : (
                    rollup.setters.map((s) => (
                      <tr key={s.id} className="border-t border-line font-sans text-sm">
                        <td className="px-5 py-4 font-medium text-fg-primary">{s.full_name}</td>
                        <td className="px-5 py-4 text-fg-secondary">{s.logged}</td>
                        <td className="px-5 py-4 text-fg-secondary">{s.booked}</td>
                        <td className="px-5 py-4 text-fg-secondary">{s.bookingPct}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg font-medium text-fg-primary">Closers</h2>
            <div className="mt-3 overflow-hidden rounded-card border border-line bg-elevated">
              <table className="w-full text-left">
                <thead className="eyebrow bg-surface">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Strategy Calls Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {rollup.closers.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-5 py-6 text-center font-sans text-sm text-fg-secondary">
                        No closers yet.
                      </td>
                    </tr>
                  ) : (
                    rollup.closers.map((c) => (
                      <tr key={c.id} className="border-t border-line font-sans text-sm">
                        <td className="px-5 py-4 font-medium text-fg-primary">{c.full_name}</td>
                        <td className="px-5 py-4 text-fg-secondary">{c.assigned}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Overview() {
  const { profile } = useAuth()

  if (profile?.role === 'setter') return <SetterOverview profile={profile} />
  if (profile?.role === 'closer') return <CloserOverview profile={profile} />
  return <AdminOverview />
}
