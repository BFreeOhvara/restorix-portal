import { useMemo, useState } from 'react'
import { Plus, Upload, Phone, ClipboardEdit } from 'lucide-react'
import clsx from 'clsx'
import { usePipelineSetterLeads, usePipelineCloserLeads } from '../hooks/useLeads'
import { useReps } from '../hooks/useStats'
import { Button } from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
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

// Prompt 464 — Queue renamed to Pipeline, split into a Setter tab (the old
// Queue table, minus Appointment Booked — Brayden's explicit call that a
// booked lead is no longer a setter concern) and a new Closer tab (a
// read-only rollup of every closer's booked leads, grouped/filterable by
// the new closer_outcome states).
function SetterTab() {
  const { data: leads, isLoading } = usePipelineSetterLeads()
  const { data: reps } = useReps()
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [callLead, setCallLead] = useState(null)

  const setterNames = useMemo(() => {
    const map = new Map()
    ;(reps || []).forEach((r) => map.set(r.id, r.full_name))
    return map
  }, [reps])

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="font-sans text-sm text-fg-secondary">
          {leads?.length ?? 0} lead{leads?.length === 1 ? '' : 's'}
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
            No leads yet — add one or import a CSV to get started.
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
                    {lead.assigned_setter ? setterNames.get(lead.assigned_setter) || '—' : '—'}
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

      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} />}
      {showImport && <CsvImportModal onClose={() => setShowImport(false)} />}
      {callLead && <LogCallModal lead={callLead} onClose={() => setCallLead(null)} />}
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

export default function Pipeline() {
  const [tab, setTab] = useState('setter')

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Pipeline</h1>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setTab('setter')}
          className={clsx(
            'eyebrow rounded-full px-4 py-2 transition-colors',
            tab === 'setter' ? 'bg-accent !text-white' : 'bg-muted !text-fg-secondary hover:opacity-85'
          )}
        >
          Setter
        </button>
        <button
          onClick={() => setTab('closer')}
          className={clsx(
            'eyebrow rounded-full px-4 py-2 transition-colors',
            tab === 'closer' ? 'bg-accent !text-white' : 'bg-muted !text-fg-secondary hover:opacity-85'
          )}
        >
          Closer
        </button>
      </div>

      <div className="mt-6">
        {tab === 'setter' ? <SetterTab /> : <CloserTab />}
      </div>
    </div>
  )
}
