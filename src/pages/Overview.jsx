import { useEffect, useMemo, useState } from 'react'
import { Phone, Search, ClipboardEdit, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useMyPool, useMyBooked, useMyFollowUps, useMyNotInterested, useFinishDay, usePipelineHealth } from '../hooks/useLeads'
import { useAllLeadsForStats, useReps, statsForUser, statsForCloser, followUpsDueToday } from '../hooks/useStats'
import StatusBadge, { STATUS_SOLID, STATUS_TINT } from '../components/ui/StatusBadge'
import OutcomeBadge, { OUTCOME_LABELS } from '../components/ui/OutcomeBadge'
import { LiveClock } from '../components/ui/LiveClock'
import { Button } from '../components/ui/Button'
import { formatPhone } from '../lib/phone'
import LogCallModal from '../components/LogCallModal'
import CloserLeadModal from '../components/CloserLeadModal'
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

// Prompt 515 Part 3 — New → Follow-Up Due → No Answer → Follow-up →
// Not Interested → Appointment Booked, Brayden's own explicit tab order.
// `key` is what drives state/counts/data-source lookup below; `styleKey`
// is which STATUS_TINT/STATUS_SOLID entry to render with —
// Follow-Up Due has no real `lead_status` enum value of its own (see the
// design doc: it's a live date-comparison over ordinary 'follow_up' rows,
// not a stored state), so it deliberately borrows 'follow_up''s existing
// yellow styling rather than inventing a new color for what's really the
// same underlying status viewed two different ways.
const STATUS_TABS = [
  { key: 'new', label: 'New', styleKey: 'new' },
  { key: 'follow_up_due', label: 'Follow-Up Due', styleKey: 'follow_up' },
  { key: 'no_answer', label: 'No Answer', styleKey: 'no_answer' },
  { key: 'follow_up', label: 'Follow-up', styleKey: 'follow_up' },
  { key: 'not_interested', label: 'Not Interested', styleKey: 'not_interested' },
  { key: 'appointment_booked', label: 'Appointment Booked', styleKey: 'appointment_booked' },
]

// Prompt 515 Part 3 — the "Finish Day" action, shown once the New tab
// hits zero (lets a fast setter skip waiting for local midnight; see the
// design doc for why this and the passive cron produce identical state).
// Prompt 535 — the "moved to 24h hold" copy below still describes the
// CURRENT live behavior (no_answer_queue + redistribute_no_answers).
// Prompt 535's own migration (_rotate_no_answer_to_pool, replacing that
// two-stage handoff with an immediate return to the unassigned pool) is
// blocked by this session's DDL classifier — see [[Restorix LIVE_STATE]]
// for the ready-to-run SQL. Update this copy to "returned to the
// unassigned pool" in the SAME change that ships that SQL, not before —
// shipping the text ahead of the behavior would describe a mechanism
// that isn't live yet.
function FinishDayCard() {
  const finishDay = useFinishDay()
  const [result, setResult] = useState(null)

  async function handleClick() {
    setResult(null)
    const res = await finishDay.mutateAsync()
    setResult(res)
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-success/30 bg-success/10 px-4 py-3">
      <CheckCircle2 size={18} className="text-success" />
      <p className="flex-1 font-sans text-sm font-medium text-success">
        New leads all worked — finish today's day now instead of waiting for midnight.
      </p>
      <Button type="button" onClick={handleClick} disabled={finishDay.isPending}>
        {finishDay.isPending ? 'Finishing…' : 'Finish Day'}
      </Button>
      {result && (
        <span className="w-full font-sans text-xs text-fg-secondary">
          {result.no_answer_rolled} no-answer{result.no_answer_rolled === 1 ? '' : 's'} moved to 24h hold ·{' '}
          {result.refilled} new lead{result.refilled === 1 ? '' : 's'} pulled in for tomorrow.
        </span>
      )}
    </div>
  )
}

// Prompt 509: exported so MyLeads.jsx (closer self-dial) can reuse this
// exact component rather than duplicating it — `useMyPool(profile.id)`
// is already generic on `assigned_setter`, so this works verbatim for a
// closer's own id, no changes needed here at all.
// Prompt 515 Part 3: a closer never sees Follow-Up Due/Follow-up/Not
// Interested rows in practice (a closer's own leads never pass through
// setter-side follow-up/not-interested logging), so merging the three
// data sources here doesn't add anything closer-facing MyPipeline.jsx
// needs to special-case — useMyFollowUps/useMyNotInterested just return
// empty for a closer id and those tabs never show a nonzero count.
export function SetterOverview({ profile, title = 'Overview' }) {
  const { data: pool, isLoading: poolLoading } = useMyPool(profile.id)
  const tz = profile.timezone || DEFAULT_TIMEZONE
  const { data: followUps, isLoading: followUpsLoading } = useMyFollowUps(profile.id, tz)
  const { data: notInterested, isLoading: notInterestedLoading } = useMyNotInterested(profile.id)
  const [callLead, setCallLead] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('new')
  const isLoading = poolLoading || followUpsLoading || notInterestedLoading

  const leadsByTab = useMemo(() => ({
    new: (pool || []).filter((l) => l.status === 'new'),
    no_answer: (pool || []).filter((l) => l.status === 'no_answer'),
    appointment_booked: (pool || []).filter((l) => l.status === 'appointment_booked'),
    follow_up_due: followUps?.due || [],
    follow_up: followUps?.future || [],
    not_interested: notInterested || [],
  }), [pool, followUps, notInterested])

  const counts = useMemo(() => {
    const c = {}
    for (const tab of STATUS_TABS) c[tab.key] = leadsByTab[tab.key]?.length || 0
    return c
  }, [leadsByTab])

  // Follow-Up Due only appears in the tab row on a day there's at least
  // one due — if the tab is currently open and its last row just got
  // worked down to zero, fall back to New rather than leaving the view
  // stuck on a tab that's about to disappear.
  useEffect(() => {
    if (statusFilter === 'follow_up_due' && counts.follow_up_due === 0) setStatusFilter('new')
  }, [statusFilter, counts.follow_up_due])

  const visibleTabs = STATUS_TABS.filter((tab) => tab.key !== 'follow_up_due' || counts.follow_up_due > 0)

  // Prompt 520 — only New and Follow-Up Due are actionable from this
  // table; the other four are informational (No Answer's own re-dial
  // happens on its own schedule via day-end + redistribution, not a
  // setter-initiated re-call here; Follow-up isn't due yet; Not
  // Interested/Appointment Booked are terminal from the setter's side).
  // Gates both the visible Call button AND the row's own click-to-open —
  // hiding just the button while leaving the whole row clickable would
  // still open LogCallModal and let a setter re-log an outcome from a
  // tab that's supposed to be call-free.
  const canCallFromTab = statusFilter === 'new' || statusFilter === 'follow_up_due'

  const filtered = useMemo(() => {
    const active = leadsByTab[statusFilter] || []
    const q = search.trim().toLowerCase()
    if (!q) return active
    return active.filter((lead) =>
      lead.facility_name?.toLowerCase().includes(q) ||
      lead.contact_name?.toLowerCase().includes(q) ||
      lead.phone?.toLowerCase().includes(q)
    )
  }, [leadsByTab, search, statusFilter])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">{title}</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">
            {pool?.length ?? 0} lead{pool?.length === 1 ? '' : 's'} in your pool
          </p>
        </div>
        <DateClockRow timezone={tz} />
      </div>

      <TodayStrip profile={profile} />

      {!isLoading && counts.new === 0 && <FinishDayCard />}

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
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={clsx(
              'eyebrow rounded-full px-3.5 py-2 transition-colors hover:opacity-85',
              statusFilter === tab.key ? STATUS_SOLID[tab.styleKey] : STATUS_TINT[tab.styleKey]
            )}
          >
            {tab.label} ({counts[tab.key] || 0})
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
            {leadsByTab[statusFilter]?.length
              ? 'No leads match this filter.'
              : 'Nothing here right now.'}
          </p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="eyebrow sticky top-0 z-10 bg-surface">
                <tr>
                  <th className="px-5 py-3">Business</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Status</th>
                  {(statusFilter === 'follow_up_due' || statusFilter === 'follow_up') && (
                    <th className="px-5 py-3">Callback</th>
                  )}
                  {canCallFromTab && <th className="px-5 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={canCallFromTab ? () => setCallLead(lead) : undefined}
                    className={clsx(
                      'border-t border-line font-sans text-sm',
                      canCallFromTab && 'cursor-pointer hover:bg-surface'
                    )}
                  >
                    <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                    <td className="px-5 py-4 text-fg-secondary">{formatPhone(lead.phone) || '—'}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={lead.status} />
                    </td>
                    {(statusFilter === 'follow_up_due' || statusFilter === 'follow_up') && (
                      <td className="px-5 py-4 text-fg-secondary">{fmt(lead.follow_up_at)}</td>
                    )}
                    {canCallFromTab && (
                      <td className="px-5 py-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); setCallLead(lead) }}
                          className={clsx(
                            'inline-flex items-center gap-2 rounded-full px-4 py-2 font-sans text-sm font-semibold transition-colors hover:opacity-90',
                            STATUS_SOLID.new
                          )}
                        >
                          <Phone size={15} /> Call
                        </button>
                      </td>
                    )}
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

const CLOSER_OUTCOME_TILES = ['pending', 'needs_reschedule', 'lost', 'closed']

// Prompt 487 — restructured to match Setter Overview's own established
// pattern (stat tiles, then a bordered box holding the lead list with a
// real empty state, rows clickable to open a modal) instead of a flat
// stack of individually-actioned cards. Tiles are scoped to this
// closer's own leads only (`useMyBooked` already filters on
// `assigned_closer = auth.uid()`) — the all-closers rollup is the admin
// Pipeline Closer tab's job, not this page's. `useMyBooked` returns
// every lead ever booked to this closer regardless of `closer_outcome`
// (that field never gates the query — see Prompt 468's own note that
// logging an outcome doesn't touch `status`), so counting by
// `closer_outcome` (defaulting missing/null to 'pending', matching
// LogOutcomeForm's own default) covers the closer's full working set,
// not just unresolved ones.
// Prompt 509: exported so MyPipeline.jsx can reuse this exact component
// as its own page content — Brayden's own call (asked directly rather
// than guessed) was that "My Pipeline" is a separate additional tab with
// the same content shape as Overview already has for closers, not a
// replacement or relocation of Overview itself. Overview stays completely
// unchanged; MyPipeline.jsx is a thin wrapper mounting this same component.
export function CloserOverview({ profile, title = 'Overview' }) {
  const { data: leads, isLoading } = useMyBooked(profile.id)
  const [activeLead, setActiveLead] = useState(null)
  const tz = profile.timezone || DEFAULT_TIMEZONE

  const counts = useMemo(() => {
    const c = {}
    for (const key of CLOSER_OUTCOME_TILES) c[key] = 0
    for (const lead of leads || []) {
      const outcome = lead.closer_outcome || 'pending'
      c[outcome] = (c[outcome] || 0) + 1
    }
    return c
  }, [leads])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">{title}</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">{leads?.length ?? 0} booked leads</p>
        </div>
        <DateClockRow timezone={tz} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CLOSER_OUTCOME_TILES.map((key) => (
          <Tile key={key} label={OUTCOME_LABELS[key]} value={isLoading ? '—' : counts[key]} />
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !leads?.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            No booked leads yet — Strategy Calls are assigned to you automatically.
          </p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="eyebrow sticky top-0 z-10 bg-surface">
                <tr>
                  <th className="px-5 py-3">Business</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Strategy Call</th>
                  <th className="px-5 py-3">Outcome</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setActiveLead(lead)}
                    className="cursor-pointer border-t border-line font-sans text-sm hover:bg-surface"
                  >
                    <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                    <td className="px-5 py-4 text-fg-secondary">
                      {lead.contact_name || 'No contact name'} · {formatPhone(lead.phone) || 'No phone'}
                    </td>
                    <td className="px-5 py-4 text-fg-secondary">{fmt(lead.strategy_call_at)}</td>
                    <td className="px-5 py-4">
                      <OutcomeBadge outcome={lead.closer_outcome} />
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveLead(lead) }}
                        className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 font-sans text-sm font-semibold text-fg-primary transition-colors hover:border-fg-primary/40"
                      >
                        <ClipboardEdit size={15} /> Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeLead && <CloserLeadModal lead={activeLead} onClose={() => setActiveLead(null)} />}
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
