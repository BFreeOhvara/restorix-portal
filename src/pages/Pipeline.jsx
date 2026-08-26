import { useEffect, useMemo, useState } from 'react'
import { Plus, Upload, Search } from 'lucide-react'
import clsx from 'clsx'
import {
  usePipelineUnassignedLeads,
  usePipelineSetterLeads,
  usePipelineSetterStatusCounts,
  usePipelineCloserLeads,
  usePipelineNotInterestedLeads,
  usePipelineFollowUpLeads,
} from '../hooks/useLeads'
import { useReps } from '../hooks/useStats'
import { Button } from '../components/ui/Button'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'
import StatusBadge, { STATUS_LABELS, STATUS_SOLID, STATUS_TINT } from '../components/ui/StatusBadge'
import OutcomeBadge, { OUTCOME_LABELS, OUTCOME_SOLID, OUTCOME_TINT } from '../components/ui/OutcomeBadge'
import AddLeadModal from '../components/AddLeadModal'
import CsvImportModal from '../components/CsvImportModal'

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Prompt 535 reopen — shared client-side search for every lead table on
// this page. Facility + phone only (Contact was removed from these tables
// this same round, so there's no contact name left to search).
function filterLeads(leads, query) {
  const q = query.trim().toLowerCase()
  if (!q) return leads || []
  return (leads || []).filter((lead) =>
    lead.facility_name?.toLowerCase().includes(q) ||
    lead.phone?.toLowerCase().includes(q)
  )
}

// Prompt 535 reopen — full-width search bar, reused across every tab/sub-tab
// on this page rather than four near-identical copies. Matches Overview's
// own search input styling (SetterOverview) so the pattern reads the same
// everywhere in the app.
function SearchBar({ value, onChange, placeholder = 'Search facility or phone…' }) {
  return (
    <div className="relative mt-4">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border-2 border-line bg-elevated py-2 pl-9 pr-3 font-sans text-sm text-fg-primary shadow-sm outline-none focus:border-accent"
      />
    </div>
  )
}

// Prompt 535 reopen — live countdown to a Follow-up lead's scheduled
// callback, ticking every second (same interval pattern as LiveClock)
// rather than a static "in X hours" computed once at render and left to
// go stale while the row sits on screen.
function timeRemainingLabel(diffMs) {
  const totalSeconds = Math.floor(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m ${seconds}s`
}

function FollowUpCountdown({ target }) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!target) return <span className="text-fg-secondary">—</span>

  const diffMs = new Date(target).getTime() - nowMs
  if (diffMs <= 0) {
    return (
      <span className="font-mono text-xs font-semibold text-danger [font-variant-numeric:tabular-nums]">
        Due now
      </span>
    )
  }

  return (
    <span className="font-mono text-xs text-fg-primary [font-variant-numeric:tabular-nums]">
      {timeRemainingLabel(diffMs)}
    </span>
  )
}

const OUTCOME_FILTERS = ['pending', 'needs_reschedule', 'lost', 'closed']

// Prompt 465 — the raw backlog still sitting in the pool before day-end
// distributes it into an actual setter/closer's working queue
// (assigned_setter IS NULL, status = 'new'). Add Lead/Import CSV live here
// now, not on the Setter tab — that's where newly created leads actually
// land until day-end/on-demand request picks them up.
// Prompt 535 — badge now reads "Unassigned" via StatusBadge's new `label`
// override, not the raw status's own "New" text — every row here is
// status='new' by construction (usePipelineUnassignedLeads' own query
// filter), so this is a fixed, not per-row, label.
// Prompt 535 reopen — Contact column dropped (was always "—"), search bar
// added under the count/actions row (no sub-tab row beneath this one), and
// the row list moved into a bounded scrollable box matching Overview's own
// pattern instead of a full-page table.
function UnassignedTab() {
  const { data: leads, isLoading } = usePipelineUnassignedLeads()
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => filterLeads(leads, search), [leads, search])

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="font-sans text-sm text-fg-secondary">
          {leads?.length ?? 0} unassigned lead{leads?.length === 1 ? '' : 's'}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <Upload size={15} /> Import CSV
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add Lead
          </Button>
        </div>
      </div>

      <SearchBar value={search} onChange={setSearch} />

      <div className="mt-4 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !filtered.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            {leads?.length ? 'No leads match this search.' : 'No unassigned leads — the pool is empty or everything has been distributed.'}
          </p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="eyebrow sticky top-0 z-10 bg-surface">
                <tr>
                  <th className="px-5 py-3">Facility</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Added</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr key={lead.id} className="border-t border-line font-sans text-sm hover:bg-surface">
                    <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                    <td className="px-5 py-4 text-fg-secondary">{lead.phone || '—'}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={lead.status} label="Unassigned" />
                    </td>
                    <td className="px-5 py-4 text-fg-secondary">{fmt(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} />}
      {showImport && <CsvImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}

// Prompt 535 — New/No Answer sub-tabs of Setter, unchanged in shape from
// the old top-level Setter tab (assigned_setter-scoped) — these two
// statuses are the only ones where assigned_setter stays set, so this is
// the only pair that can use this query shape at all.
// Prompt 535 reopen — Contact column dropped, Log Call action removed
// entirely (admin views this list read-only now — logging happens on the
// setter's own Overview page, not from here), row list moved into the
// shared scrollable box, and `search` (owned by the parent SetterTab, one
// input above whichever sub-tab is active) now filters this table's own
// fetch result.
function AssignedSetterLeadsTable({ statusFilter, setterNames, search }) {
  const { data: leads, isLoading } = usePipelineSetterLeads(statusFilter)
  const filtered = useMemo(() => filterLeads(leads, search), [leads, search])

  return (
    <div className="mt-4 overflow-hidden rounded-card border border-line bg-elevated">
      {isLoading ? (
        <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
      ) : !filtered.length ? (
        <p className="p-8 text-center font-sans text-sm text-fg-secondary">
          {leads?.length
            ? 'No leads match this search.'
            : `No ${STATUS_LABELS[statusFilter]?.toLowerCase()} leads right now.`}
        </p>
      ) : (
        <div className="max-h-[65vh] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="eyebrow sticky top-0 z-10 bg-surface">
              <tr>
                <th className="px-5 py-3">Facility</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Assigned Setter</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.id} className="border-t border-line font-sans text-sm hover:bg-surface">
                  <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                  <td className="px-5 py-4 text-fg-secondary">{lead.phone || '—'}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-5 py-4 text-fg-secondary">
                    {lead.assigned_setter ? setterNames.get(lead.assigned_setter) || '—' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Prompt 535 — shared table shape for the Not Interested and Follow-up
// sub-tabs: both are scoped by last_action_by (assigned_setter is null for
// both by design, per handle_lead_pipeline), informational only, no
// per-row action — matches the pre-existing Not Interested tab's own
// convention rather than inventing a new interactive pattern.
// Prompt 535 reopen — Contact column dropped, row list moved into the
// shared scrollable box, and an optional live countdown column (Follow-up
// sub-tab only, via `showCountdown`) added alongside the existing due-date
// column rather than replacing it — the date is still useful context next
// to "how long until then."
function LastActionLeadsTable({ leads, isLoading, emptyText, dateHeader, dateValue, setterNames, showCountdown }) {
  return (
    <div className="mt-4 overflow-hidden rounded-card border border-line bg-elevated">
      {isLoading ? (
        <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
      ) : !leads?.length ? (
        <p className="p-8 text-center font-sans text-sm text-fg-secondary">{emptyText}</p>
      ) : (
        <div className="max-h-[65vh] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="eyebrow sticky top-0 z-10 bg-surface">
              <tr>
                <th className="px-5 py-3">Facility</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Logged By</th>
                <th className="px-5 py-3">{dateHeader}</th>
                {showCountdown && <th className="px-5 py-3">Time Left</th>}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-line font-sans text-sm">
                  <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                  <td className="px-5 py-4 text-fg-secondary">{lead.phone || '—'}</td>
                  <td className="px-5 py-4 text-fg-secondary">
                    {lead.last_action_by ? setterNames.get(lead.last_action_by) || '—' : '—'}
                  </td>
                  <td className="px-5 py-4 text-fg-secondary">{fmt(dateValue(lead))}</td>
                  {showCountdown && (
                    <td className="px-5 py-4">
                      <FollowUpCountdown target={lead.follow_up_at} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Prompt 465 — Brayden's explicit ordering for the Setter-tab sub-tab
// chips (originally 'all' first, removed Prompt 535 — see SUB_TABS below).
// Prompt 535 — restructured into exactly 4 sub-tabs (New, No Answer, Not
// Interested, Follow-up), no "All". Not Interested relocated here from its
// own top-level Pipeline tab; Follow-up switched from the broken
// assigned_setter-scoped query to the same last_action_by-scoped shape
// Not Interested already used, since it had the identical structural bug
// (assigned_setter null by design) — confirmed live before fixing, not
// assumed.
const SUB_TABS = [
  { key: 'new', label: 'New' },
  { key: 'no_answer', label: 'No Answer' },
  { key: 'not_interested', label: 'Not Interested' },
  { key: 'follow_up', label: 'Follow-up' },
]

// Prompt 535 reopen — one search input, positioned under the sub-tab chip
// row, filters whichever sub-tab is currently active (client-side for
// Not Interested/Follow-up since those two are already fully fetched here;
// server-fetched-then-filtered for New/No Answer inside
// AssignedSetterLeadsTable itself, same `search` value passed straight
// through).
function SetterTab() {
  const [subTab, setSubTab] = useState('new')
  const [search, setSearch] = useState('')
  const { data: counts } = usePipelineSetterStatusCounts()
  const { data: notInterested, isLoading: notInterestedLoading } = usePipelineNotInterestedLeads()
  const { data: followUps, isLoading: followUpsLoading } = usePipelineFollowUpLeads()
  const { data: reps } = useReps()

  const setterNames = useMemo(() => {
    const map = new Map()
    ;(reps || []).forEach((r) => map.set(r.id, r.full_name))
    return map
  }, [reps])

  const filteredNotInterested = useMemo(() => filterLeads(notInterested, search), [notInterested, search])
  const filteredFollowUps = useMemo(() => filterLeads(followUps, search), [followUps, search])

  const subCounts = {
    new: counts?.new ?? 0,
    no_answer: counts?.no_answer ?? 0,
    not_interested: notInterested?.length ?? 0,
    follow_up: followUps?.length ?? 0,
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={clsx(
              'eyebrow rounded-full px-3.5 py-2 transition-colors hover:opacity-85',
              subTab === t.key ? STATUS_SOLID[t.key] : STATUS_TINT[t.key]
            )}
          >
            {t.label} ({subCounts[t.key]})
          </button>
        ))}
      </div>

      <SearchBar value={search} onChange={setSearch} />

      {subTab === 'new' && <AssignedSetterLeadsTable statusFilter="new" setterNames={setterNames} search={search} />}
      {subTab === 'no_answer' && <AssignedSetterLeadsTable statusFilter="no_answer" setterNames={setterNames} search={search} />}
      {subTab === 'not_interested' && (
        <LastActionLeadsTable
          leads={filteredNotInterested}
          isLoading={notInterestedLoading}
          emptyText={notInterested?.length ? 'No leads match this search.' : 'No not-interested leads yet.'}
          dateHeader="Date"
          dateValue={(lead) => lead.last_action_at}
          setterNames={setterNames}
        />
      )}
      {subTab === 'follow_up' && (
        <LastActionLeadsTable
          leads={filteredFollowUps}
          isLoading={followUpsLoading}
          emptyText={followUps?.length ? 'No leads match this search.' : 'No follow-ups scheduled.'}
          dateHeader="Follow-up Date"
          dateValue={(lead) => lead.follow_up_at}
          setterNames={setterNames}
          showCountdown
        />
      )}
    </div>
  )
}

// Prompt 535 reopen — "All" outcome filter dropped (same removal as
// Setter's own "All" sub-tab in the original Prompt 535 build), default
// filter now the first remaining chip (Pending) instead of All. Contact
// column dropped, Log Outcome action removed entirely (admin views this
// list read-only — outcomes are logged by the closer on their own My
// Leads/Overview page, not from here), row list moved into the shared
// scrollable box, and a search bar added under the outcome filter row.
function CloserTab() {
  const { data: leads, isLoading } = usePipelineCloserLeads()
  const { data: reps } = useReps()
  const [outcomeFilter, setOutcomeFilter] = useState('pending')
  const [search, setSearch] = useState('')

  const closerNames = useMemo(() => {
    const map = new Map()
    ;(reps || []).forEach((r) => map.set(r.id, r.full_name))
    return map
  }, [reps])

  const counts = useMemo(() => {
    const c = { pending: 0, needs_reschedule: 0, lost: 0, closed: 0 }
    for (const lead of leads || []) {
      const key = lead.closer_outcome || 'pending'
      c[key] = (c[key] || 0) + 1
    }
    return c
  }, [leads])

  const outcomeFiltered = useMemo(() => {
    if (!leads) return []
    return leads.filter((l) => (l.closer_outcome || 'pending') === outcomeFilter)
  }, [leads, outcomeFilter])

  const filtered = useMemo(() => filterLeads(outcomeFiltered, search), [outcomeFiltered, search])

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="font-sans text-sm text-fg-secondary">
          {leads?.length ?? 0} booked lead{leads?.length === 1 ? '' : 's'} across all closers
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {OUTCOME_FILTERS.map((key) => (
          <button
            key={key}
            onClick={() => setOutcomeFilter(key)}
            className={clsx(
              'eyebrow rounded-full px-3.5 py-2 transition-colors hover:opacity-85',
              outcomeFilter === key ? OUTCOME_SOLID[key] : OUTCOME_TINT[key]
            )}
          >
            {OUTCOME_LABELS[key]} ({counts[key] || 0})
          </button>
        ))}
      </div>

      <SearchBar value={search} onChange={setSearch} />

      <div className="mt-4 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !filtered.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            {outcomeFiltered.length ? 'No leads match this search.' : leads?.length ? 'No booked leads match this filter.' : 'No booked leads yet.'}
          </p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="eyebrow sticky top-0 z-10 bg-surface">
                <tr>
                  <th className="px-5 py-3">Facility</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Assigned Closer</th>
                  <th className="px-5 py-3">Outcome</th>
                  <th className="px-5 py-3">Next Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr key={lead.id} className="border-t border-line font-sans text-sm hover:bg-surface">
                    <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                    <td className="px-5 py-4 text-fg-secondary">{lead.phone || '—'}</td>
                    <td className="px-5 py-4 text-fg-secondary">
                      {lead.assigned_closer ? closerNames.get(lead.assigned_closer) || '—' : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <OutcomeBadge outcome={lead.closer_outcome} />
                    </td>
                    <td className="px-5 py-4 text-fg-secondary">{fmt(lead.strategy_call_at)}</td>
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

// Prompt 465 — Unassigned/Setter/Closer, Brayden's explicit ordering.
// Prompt 515 Part 3 added a 4th top-level "Not Interested" tab.
// Prompt 535 — Not Interested moved back OUT of top-level, into a Setter
// sub-tab instead (Brayden's explicit call) — back to exactly 3 top-level
// tabs.
// Prompt 535 reopen round 3 — restyled to the shared SegmentedTabs
// component (Training page's rectangular/slightly-rounded look) instead
// of the full-pill treatment, per Brayden's explicit ask. The New/No
// Answer/Not Interested/Follow-up sub-tab row below (SUB_TABS, inside
// SetterTab) is untouched — still the pill-shaped STATUS_TINT/SOLID
// treatment, deliberately not part of this restyle.
const TABS = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'setter', label: 'Setter' },
  { key: 'closer', label: 'Closer' },
]

export default function Pipeline() {
  const [tab, setTab] = useState('setter')

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Pipeline</h1>

      <div className="mt-4">
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div className="mt-6">
        {tab === 'unassigned' ? <UnassignedTab />
          : tab === 'setter' ? <SetterTab />
          : <CloserTab />}
      </div>
    </div>
  )
}
