import { useMemo, useState } from 'react'
import { Plus, Upload, Phone, ClipboardEdit } from 'lucide-react'
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
import StatusBadge, { STATUS_LABELS, STATUS_SOLID, STATUS_TINT } from '../components/ui/StatusBadge'
import OutcomeBadge, { OUTCOME_LABELS, OUTCOME_SOLID, OUTCOME_TINT } from '../components/ui/OutcomeBadge'
import AddLeadModal from '../components/AddLeadModal'
import CsvImportModal from '../components/CsvImportModal'
import LogCallModal from '../components/LogCallModal'
import LogOutcomeModal from '../components/LogOutcomeModal'

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const OUTCOME_FILTERS = ['all', 'pending', 'needs_reschedule', 'lost', 'closed']

// Prompt 465 — the raw backlog still sitting in the pool before day-end
// distributes it into an actual setter/closer's working queue
// (assigned_setter IS NULL, status = 'new'). Add Lead/Import CSV live here
// now, not on the Setter tab — that's where newly created leads actually
// land until day-end/on-demand request picks them up.
// Prompt 535 — badge now reads "Unassigned" via StatusBadge's new `label`
// override, not the raw status's own "New" text — every row here is
// status='new' by construction (usePipelineUnassignedLeads' own query
// filter), so this is a fixed, not per-row, label.
function UnassignedTab() {
  const { data: leads, isLoading } = usePipelineUnassignedLeads()
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)

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

      <div className="mt-4 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !leads?.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            No unassigned leads — the pool is empty or everything has been distributed.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="eyebrow bg-surface">
              <tr>
                <th className="px-5 py-3">Facility</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Added</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-line font-sans text-sm hover:bg-surface">
                  <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                  <td className="px-5 py-4 text-fg-secondary">{lead.contact_name || '—'}</td>
                  <td className="px-5 py-4 text-fg-secondary">{lead.phone || '—'}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={lead.status} label="Unassigned" />
                  </td>
                  <td className="px-5 py-4 text-fg-secondary">{fmt(lead.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} />}
      {showImport && <CsvImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}

// Prompt 535 — New/No Answer sub-tabs of Setter, unchanged in shape from
// the old top-level Setter tab (assigned_setter-scoped, Log Call action) —
// these two statuses are the only ones where assigned_setter stays set,
// so this is the only pair that can use this query shape at all.
function AssignedSetterLeadsTable({ statusFilter, setterNames }) {
  const { data: leads, isLoading } = usePipelineSetterLeads(statusFilter)
  const [callLead, setCallLead] = useState(null)

  return (
    <>
      <div className="mt-4 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !leads?.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            No {STATUS_LABELS[statusFilter]?.toLowerCase()} leads right now.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="eyebrow bg-surface">
              <tr>
                <th className="px-5 py-3">Facility</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Assigned Setter</th>
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
                    {lead.assigned_setter ? setterNames.get(lead.assigned_setter) || '—' : '—'}
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
    </>
  )
}

// Prompt 535 — shared table shape for the Not Interested and Follow-up
// sub-tabs: both are scoped by last_action_by (assigned_setter is null for
// both by design, per handle_lead_pipeline), informational only, no
// per-row action — matches the pre-existing Not Interested tab's own
// convention rather than inventing a new interactive pattern.
function LastActionLeadsTable({ leads, isLoading, emptyText, dateHeader, dateValue, setterNames }) {
  return (
    <div className="mt-4 overflow-hidden rounded-card border border-line bg-elevated">
      {isLoading ? (
        <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
      ) : !leads?.length ? (
        <p className="p-8 text-center font-sans text-sm text-fg-secondary">{emptyText}</p>
      ) : (
        <table className="w-full text-left">
          <thead className="eyebrow bg-surface">
            <tr>
              <th className="px-5 py-3">Facility</th>
              <th className="px-5 py-3">Contact</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3">Logged By</th>
              <th className="px-5 py-3">{dateHeader}</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-line font-sans text-sm">
                <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                <td className="px-5 py-4 text-fg-secondary">{lead.contact_name || '—'}</td>
                <td className="px-5 py-4 text-fg-secondary">{lead.phone || '—'}</td>
                <td className="px-5 py-4 text-fg-secondary">
                  {lead.last_action_by ? setterNames.get(lead.last_action_by) || '—' : '—'}
                </td>
                <td className="px-5 py-4 text-fg-secondary">{fmt(dateValue(lead))}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

function SetterTab() {
  const [subTab, setSubTab] = useState('new')
  const { data: counts } = usePipelineSetterStatusCounts()
  const { data: notInterested, isLoading: notInterestedLoading } = usePipelineNotInterestedLeads()
  const { data: followUps, isLoading: followUpsLoading } = usePipelineFollowUpLeads()
  const { data: reps } = useReps()

  const setterNames = useMemo(() => {
    const map = new Map()
    ;(reps || []).forEach((r) => map.set(r.id, r.full_name))
    return map
  }, [reps])

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

      {subTab === 'new' && <AssignedSetterLeadsTable statusFilter="new" setterNames={setterNames} />}
      {subTab === 'no_answer' && <AssignedSetterLeadsTable statusFilter="no_answer" setterNames={setterNames} />}
      {subTab === 'not_interested' && (
        <LastActionLeadsTable
          leads={notInterested}
          isLoading={notInterestedLoading}
          emptyText="No not-interested leads yet."
          dateHeader="Date"
          dateValue={(lead) => lead.last_action_at}
          setterNames={setterNames}
        />
      )}
      {subTab === 'follow_up' && (
        <LastActionLeadsTable
          leads={followUps}
          isLoading={followUpsLoading}
          emptyText="No follow-ups scheduled."
          dateHeader="Follow-up Date"
          dateValue={(lead) => lead.follow_up_at}
          setterNames={setterNames}
        />
      )}
    </div>
  )
}

function CloserTab() {
  const { data: leads, isLoading } = usePipelineCloserLeads()
  const { data: reps } = useReps()
  const [outcomeFilter, setOutcomeFilter] = useState('all')
  const [outcomeLead, setOutcomeLead] = useState(null)

  const closerNames = useMemo(() => {
    const map = new Map()
    ;(reps || []).forEach((r) => map.set(r.id, r.full_name))
    return map
  }, [reps])

  const counts = useMemo(() => {
    const c = { all: leads?.length ?? 0, pending: 0, needs_reschedule: 0, lost: 0, closed: 0 }
    for (const lead of leads || []) {
      const key = lead.closer_outcome || 'pending'
      c[key] = (c[key] || 0) + 1
    }
    return c
  }, [leads])

  const filtered = useMemo(() => {
    if (!leads) return []
    if (outcomeFilter === 'all') return leads
    return leads.filter((l) => (l.closer_outcome || 'pending') === outcomeFilter)
  }, [leads, outcomeFilter])

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
              outcomeFilter === key
                ? key === 'all' ? 'bg-accent !text-white' : OUTCOME_SOLID[key]
                : key === 'all' ? 'bg-muted !text-fg-secondary' : OUTCOME_TINT[key]
            )}
          >
            {key === 'all' ? 'All' : OUTCOME_LABELS[key]} ({counts[key] || 0})
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !filtered.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            {leads?.length ? 'No booked leads match this filter.' : 'No booked leads yet.'}
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="eyebrow bg-surface">
              <tr>
                <th className="px-5 py-3">Facility</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Assigned Closer</th>
                <th className="px-5 py-3">Outcome</th>
                <th className="px-5 py-3">Next Action</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.id} className="border-t border-line font-sans text-sm hover:bg-surface">
                  <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                  <td className="px-5 py-4 text-fg-secondary">{lead.contact_name || '—'}</td>
                  <td className="px-5 py-4 text-fg-secondary">{lead.phone || '—'}</td>
                  <td className="px-5 py-4 text-fg-secondary">
                    {lead.assigned_closer ? closerNames.get(lead.assigned_closer) || '—' : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <OutcomeBadge outcome={lead.closer_outcome} />
                  </td>
                  <td className="px-5 py-4 text-fg-secondary">{fmt(lead.strategy_call_at)}</td>
                  <td className="px-5 py-4 text-right">
                    <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => setOutcomeLead(lead)}>
                      <ClipboardEdit size={13} /> Log outcome
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {outcomeLead && <LogOutcomeModal lead={outcomeLead} onClose={() => setOutcomeLead(null)} />}
    </div>
  )
}

// Prompt 465 — Unassigned/Setter/Closer, Brayden's explicit ordering.
// Prompt 515 Part 3 added a 4th top-level "Not Interested" tab.
// Prompt 535 — Not Interested moved back OUT of top-level, into a Setter
// sub-tab instead (Brayden's explicit call) — back to exactly 3 top-level
// tabs. Closer tab is completely untouched by this prompt, per Brayden's
// own explicit "leave it exactly as-is" instruction.
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

      <div className="mt-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'eyebrow rounded-full px-4 py-2 transition-colors',
              tab === t.key ? 'bg-accent !text-white' : 'bg-muted !text-fg-secondary hover:opacity-85'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'unassigned' ? <UnassignedTab />
          : tab === 'setter' ? <SetterTab />
          : <CloserTab />}
      </div>
    </div>
  )
}
