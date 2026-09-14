import { useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCommissionLeads } from '../hooks/useLeads'
import { useReps } from '../hooks/useStats'
import { commissionFor, totalCommission } from '../lib/commissions'
import { usePageHeader } from '../components/Layout'

const CLOSER_COPY = {
  title: 'Revenue',
  body: "Revenue tracking isn't live yet — Restorix doesn't have a defined comp structure for closers yet.",
}

function fmt(n) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function Tile({ label, value }) {
  return (
    <div className="rounded-card border border-line bg-elevated p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-3xl font-medium text-fg-primary">{value}</p>
    </div>
  )
}

// Prompt 468: setter-facing, replaces the honest $0 placeholder now that
// a real comp structure exists — every deal this setter gets credit for
// (last_action_by, the frozen booking-attribution stamp, not
// assigned_setter which the pipeline nulls out on booking) that a closer
// has marked Closed.
function MyCommissions({ leads }) {
  const total = totalCommission(leads)

  return (
    <div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Total Commission" value={fmt(total)} />
        <Tile label="Deals Closed" value={leads.length} />
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {!leads.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            No commissions yet — they'll show up here once a deal you booked reaches Closed.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="eyebrow bg-surface">
              <tr>
                <th className="px-5 py-3">Facility</th>
                <th className="px-5 py-3">Setup Fee</th>
                <th className="px-5 py-3">First Month Fee</th>
                <th className="px-5 py-3">Commission</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-line font-sans text-sm">
                  <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                  <td className="px-5 py-4 text-fg-secondary">{fmt(Number(lead.deal_setup_fee) || 0)}</td>
                  <td className="px-5 py-4 text-fg-secondary">{fmt(Number(lead.deal_first_month_fee) || 0)}</td>
                  <td className="px-5 py-4 font-medium text-fg-primary">{fmt(commissionFor(lead))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Prompt 468: admin rollup, inferred (not explicitly asked for, but the
// same pattern Stats.jsx already has for setters/closers) — a per-setter
// total for payroll, not the full itemized list (that's My Commissions'
// job, one per setter).
function AdminCommissionRollup({ leads, reps }) {
  const setters = (reps || []).filter((r) => r.role === 'setter')

  const rows = useMemo(() => {
    return setters.map((s) => {
      const theirs = leads.filter((l) => l.last_action_by === s.id)
      return { ...s, deals: theirs.length, total: totalCommission(theirs) }
    })
  }, [setters, leads])

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0)

  return (
    <div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Total Owed" value={fmt(grandTotal)} />
        <Tile label="Deals Closed" value={leads.length} />
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        <table className="w-full text-left">
          <thead className="eyebrow bg-surface">
            <tr>
              <th className="px-5 py-3">Setter</th>
              <th className="px-5 py-3">Deals Closed</th>
              <th className="px-5 py-3">Commission Owed</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center font-sans text-sm text-fg-secondary">
                  No setters yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-line font-sans text-sm">
                  <td className="px-5 py-4 font-medium text-fg-primary">{r.full_name}</td>
                  <td className="px-5 py-4 text-fg-secondary">{r.deals}</td>
                  <td className="px-5 py-4 text-fg-secondary">{fmt(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Prompt 590 — header title/subtitle now render in Layout's shared header
// bar for all three role variants, computed once here rather than per
// sub-component so it's already showing during the isLoading branch too.
const ADMIN_SUBTITLE = '15% of setup fee + first month, paid once per Closed deal.'
const SETTER_SUBTITLE = '15% of setup fee + first month, paid once a deal you booked reaches Closed.'

export default function Commissions() {
  const { profile } = useAuth()
  const { data: leads, isLoading } = useCommissionLeads()
  const { data: reps } = useReps()

  const isCloser = profile?.role === 'closer'
  const isAdmin = profile?.role === 'admin'
  usePageHeader({
    title: isCloser ? CLOSER_COPY.title : isAdmin ? 'Commissions' : 'My Commissions',
    subtitle: isCloser ? CLOSER_COPY.body : isAdmin ? ADMIN_SUBTITLE : SETTER_SUBTITLE,
  })

  if (isCloser) {
    return (
      <div>
        <div className="mt-6 rounded-card border border-line bg-elevated p-8 text-center">
          <p className="font-sans text-sm text-fg-secondary">
            Nothing to show yet — this page will populate once a commission structure exists.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <p className="font-sans text-sm text-fg-secondary">Loading…</p>
  }

  if (isAdmin) {
    return <AdminCommissionRollup leads={leads || []} reps={reps} />
  }

  const mine = (leads || []).filter((l) => l.last_action_by === profile?.id)
  return <MyCommissions leads={mine} />
}
