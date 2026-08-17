import { useMemo, useState } from 'react'
import { Plus, Upload, Phone } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { useReps } from '../hooks/useStats'
import { Button } from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
import AddLeadModal from '../components/AddLeadModal'
import CsvImportModal from '../components/CsvImportModal'
import LogCallModal from '../components/LogCallModal'

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function Queue() {
  const { data: leads, isLoading } = useLeads()
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
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">Queue</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">
            {leads?.length ?? 0} lead{leads?.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <Upload size={15} /> Import CSV
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add Lead
          </Button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
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
                    {lead.status === 'appointment_booked'
                      ? fmt(lead.strategy_call_at)
                      : lead.status === 'follow_up'
                      ? fmt(lead.follow_up_at)
                      : '—'}
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
