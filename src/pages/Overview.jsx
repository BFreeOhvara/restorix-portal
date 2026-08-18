import { useMemo, useState } from 'react'
import { Phone, Search, ClipboardEdit } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useMyPool, useMyBooked, usePipelineHealth } from '../hooks/useLeads'
import { useAllLeadsForStats, useReps, statsForUser, statsForCloser, followUpsDueToday } from '../hooks/useStats'
import StatusBadge, { STATUS_LABELS, STATUS_SOLID, STATUS_TINT } from '../components/ui/StatusBadge'
import OutcomeBadge from '../components/ui/OutcomeBadge'
import { LiveClock } from '../components/ui/LiveClock'
import { Button } from '../components/ui/Button'
import LogCallModal from '../components/LogCallModal'
import LogOutcomeModal from '../components/LogOutcomeModal'
import { zonedDateStr, zonedDayRange } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'

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

// Prompt 462: date sits to the left of the time, one row, aligned with the
// page title's own header row (was stacked date-above-time, floating below
// the title with a visible gap — Prompt 460). Parent components now place
// this directly beside the "Overview" h1 instead of above the stat grid.
function DateClockRow({ timezone }) {
  const dateLabel = new Date().toLocaleDateString('en-US', {
    timeZone: timezone, weekday: 'long', month: 'short', day: 'numeric',
  })
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-sm text-fg-faint [font-variant-numeric:tabular-nums]">{dateLabel}</span>
      <LiveClock timezone={timezone} />
    </div>
  )
}

// Right now — not the historical/date-range numbers on the Stats page.
// Prompt 458: "today" now follows the viewing user's own saved timezone
// (defaulting to DEFAULT_TIMEZONE for accounts that predate this column)
// instead of the UTC calendar day — both the label above and the actual
// query boundaries feeding statsForUser/followUpsDueToday.
function TodayStrip({ profile }) {
  const { data: leads, isLoading } = useAllLeadsForStats()
  const tz = profile.timezone || DEFAULT_TIMEZONE
  const { start, end } = useMemo(() => zonedDayRange(zonedDateStr(Date.now(), tz), tz), [tz])
  const today = useMemo(() => {
    if (!leads) return { logged: 0, booked: 0, bookingPct: 0, followUpsDue: 0 }
    return {
      ...statsForUser(leads, profile.id, start, end),
      followUpsDue: followUpsDueToday(leads, profile.id, start, end),
    }
  }, [leads, profile.id, start, end])

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="Calls Made Today" value={isLoading ? '—' : today.logged} />
      <Tile label="Booked Today" value={isLoading ? '—' : today.booked} />
      <Tile label="Today's Booking Rate" value={isLoading ? '—' : `${today.bookingPct}%`} />
      <Tile label="Follow-ups Due Today" value={isLoading ? '—' : today.followUpsDue} />
    </div>
  )
}

const STATUS_TABS = ['new', 'no_answer', 'follow_up', 'not_interested', 'appointment_booked']

function SetterOverview({ profile }) {
  const { data: leads, isLoading } = useMyPool(profile.id)
  const [callLead, setCallLead] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('new')
  const tz = profile.timezone || DEFAULT_TIMEZONE

  const filtered = useMemo(() => {
    if (!leads) return []
    const q = search.trim().toLowerCase()
    return leads.filter((lead) => {
      if (lead.status !== statusFilter) return false
      if (!q) return true
      return (
        lead.facility_name?.toLowerCase().includes(q) ||
        lead.contact_name?.toLowerCase().includes(q) ||
        lead.phone?.toLowerCase().includes(q)
      )
    })
  }, [leads, search, statusFilter])

  const counts = useMemo(() => {
    const c = {}
    for (const status of STATUS_TABS) c[status] = 0
    for (const lead of leads || []) c[lead.status] = (c[lead.status] || 0) + 1
    return c
  }, [leads])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">Overview</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">
            {leads?.length ?? 0} lead{leads?.length === 1 ? '' : 's'} in your pool
          </p>
        </div>
        <DateClockRow timezone={tz} />
      </div>

      <TodayStrip profile={profile} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search facility, contact, or phone…"
            className="w-full rounded-lg border-2 border-line bg-elevated py-2 pl-9 pr-3 font-sans text-sm text-fg-primary shadow-sm outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {STATUS_TABS.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={clsx(
              'eyebrow rounded-full px-3.5 py-2 transition-colors hover:opacity-85',
              statusFilter === status ? STATUS_SOLID[status] : STATUS_TINT[status]
            )}
          >
            {STATUS_LABELS[status]} ({counts[status] || 0})
          </button>
        ))}
      </div>

      {/* Own scroll region for the row list, bounded height so the strip/
          search/filters above stay pinned while scrolling a 150-lead pool
          (Prompt 440) — sticky thead so column headers travel with it. */}
      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !filtered.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            {leads?.length
              ? 'No leads match this filter.'
              : 'Your pool is empty right now — new leads are assigned automatically.'}
          </p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="eyebrow sticky top-0 z-10 bg-surface">
                <tr>
                  <th className="px-5 py-3">Business</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setCallLead(lead)}
                    className="cursor-pointer border-t border-line font-sans text-sm hover:bg-surface"
                  >
                    <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                    <td className="px-5 py-4 text-fg-secondary">{lead.phone || '—'}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); setCallLead(lead) }}
                        className={clsx(
                          'inline-flex items-center gap-2 rounded-full px-4 py-2 font-sans text-sm font-semibold transition-colors hover:opacity-90',
                          STATUS_SOLID[lead.status] || STATUS_SOLID.new
                        )}
                      >
                        <Phone size={15} /> Call
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {callLead && <LogCallModal lead={callLead} onClose={() => setCallLead(null)} />}
    </div>
  )
}

function CloserOverview({ profile }) {
  const { data: leads, isLoading } = useMyBooked(profile.id)
  const [outcomeLead, setOutcomeLead] = useState(null)

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
                  <div className="mt-3 flex items-center gap-2">
                    <OutcomeBadge outcome={lead.closer_outcome} />
                    <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => setOutcomeLead(lead)}>
                      <ClipboardEdit size={13} /> Log outcome
                    </Button>
                  </div>
                </div>
                <span className="eyebrow rounded-full bg-[#dcf3e6] px-3 py-1.5 !text-success">
                  {fmt(lead.strategy_call_at)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {outcomeLead && <LogOutcomeModal lead={outcomeLead} onClose={() => setOutcomeLead(null)} />}
    </div>
  )
}

function AdminOverview({ profile }) {
  const { data: leads, isLoading: leadsLoading } = useAllLeadsForStats()
  const { data: reps } = useReps()
  const { data: health, isLoading: healthLoading } = usePipelineHealth()
  const tz = profile.timezone || DEFAULT_TIMEZONE

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">Overview</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">Team performance and pipeline health</p>
        </div>
        <DateClockRow timezone={tz} />
      </div>

      <h2 className="mt-6 font-display text-lg font-medium text-fg-primary">Pipeline health</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
  return <AdminOverview profile={profile} />
}
