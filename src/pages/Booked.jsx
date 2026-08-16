import { useLeads } from '../hooks/useLeads'

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function Booked() {
  const { data: leads, isLoading } = useLeads('booked')

  const sorted = [...(leads || [])].sort(
    (a, b) => new Date(a.strategy_call_at || 0) - new Date(b.strategy_call_at || 0)
  )

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Booked Strategy Calls</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">
        {sorted.length} upcoming
      </p>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <p className="font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !sorted.length ? (
          <div className="rounded-card border border-line bg-elevated p-8 text-center">
            <p className="font-sans text-sm text-fg-secondary">No Strategy Calls booked yet.</p>
          </div>
        ) : (
          sorted.map((lead) => (
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
