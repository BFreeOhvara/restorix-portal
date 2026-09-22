import { useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCommissionLeads } from '../hooks/useLeads'
import { useReps } from '../hooks/useStats'
import {
  setterCommissionFor,
  setterTotalCommission,
  closerFirstMonthCommission,
  closerRecurringCommission,
  closerTotalCommission,
  closerTotalCommissionForLeads,
  adminFirstMonthCommission,
  adminRecurringCommission,
  adminTotalCommissionForLeads,
  recurringMonthsElapsed,
} from '../lib/commissions'
import { usePageHeader } from '../components/Layout'
import { PageLoading } from '../components/ui/PageLoading'

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

// Prompt 468: setter-facing, one-shot 15% of first-month revenue only —
// unchanged in shape by Prompt 609, just repointed at the renamed helpers.
function MyCommissions({ leads }) {
  const total = setterTotalCommission(leads)

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
                  <td className="px-5 py-4 font-medium text-fg-primary">{fmt(setterCommissionFor(lead))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Prompt 609 — replaces the old CLOSER_COPY "not live yet" placeholder now
// that closers have a real comp structure: 50% of first-month revenue
// (one-shot) plus 50% of every recurring month elapsed since close. Two
// tiles + a combined total, and the itemized table breaks each deal into
// its first-month cut and recurring cut separately so it's auditable.
function MyCloserCommissions({ leads }) {
  const firstMonthTotal = leads.reduce((sum, l) => sum + closerFirstMonthCommission(l), 0)
  const recurringTotal = leads.reduce((sum, l) => sum + closerRecurringCommission(l), 0)
  const combinedTotal = closerTotalCommissionForLeads(leads)

  return (
    <div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="First Month" value={fmt(firstMonthTotal)} />
        <Tile label="Recurring" value={fmt(recurringTotal)} />
        <Tile label="Total Commission" value={fmt(combinedTotal)} />
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {!leads.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            No commissions yet — they'll show up here once a deal assigned to you reaches Closed.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="eyebrow bg-surface">
              <tr>
                <th className="px-5 py-3">Facility</th>
                <th className="px-5 py-3">First Month Cut</th>
                <th className="px-5 py-3">Recurring Months</th>
                <th className="px-5 py-3">Recurring Cut</th>
                <th className="px-5 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-line font-sans text-sm">
                  <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                  <td className="px-5 py-4 text-fg-secondary">{fmt(closerFirstMonthCommission(lead))}</td>
                  <td className="px-5 py-4 text-fg-secondary">{recurringMonthsElapsed(lead)}</td>
                  <td className="px-5 py-4 text-fg-secondary">{fmt(closerRecurringCommission(lead))}</td>
                  <td className="px-5 py-4 font-medium text-fg-primary">{fmt(closerTotalCommission(lead))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Prompt 609 — company-wide two-part rollup at admin's own 35%/50% rates,
// alongside the existing per-setter (15% first-month only) and now-added
// per-closer payroll breakdowns.
function AdminCommissionRollup({ leads, reps }) {
  const setters = (reps || []).filter((r) => r.role === 'setter')
  const closers = (reps || []).filter((r) => r.role === 'closer')

  const setterRows = useMemo(() => {
    return setters.map((s) => {
      const theirs = leads.filter((l) => l.last_action_by === s.id)
      return { ...s, deals: theirs.length, total: setterTotalCommission(theirs) }
    })
  }, [setters, leads])

  const closerRows = useMemo(() => {
    return closers.map((c) => {
      const theirs = leads.filter((l) => l.assigned_closer === c.id)
      return { ...c, deals: theirs.length, total: closerTotalCommissionForLeads(theirs) }
    })
  }, [closers, leads])

  const adminFirstMonthTotal = leads.reduce((sum, l) => sum + adminFirstMonthCommission(l), 0)
  const adminRecurringTotal = leads.reduce((sum, l) => sum + adminRecurringCommission(l), 0)
  const adminGrandTotal = adminTotalCommissionForLeads(leads)

  return (
    <div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Admin First Month" value={fmt(adminFirstMonthTotal)} />
        <Tile label="Admin Recurring" value={fmt(adminRecurringTotal)} />
        <Tile label="Admin Total" value={fmt(adminGrandTotal)} />
      </div>

      <p className="mt-6 eyebrow">Setters (15% first month, one-shot)</p>
      <div className="mt-2 overflow-hidden rounded-card border border-line bg-elevated">
        <table className="w-full text-left">
          <thead className="eyebrow bg-surface">
            <tr>
              <th className="px-5 py-3">Setter</th>
              <th className="px-5 py-3">Deals Closed</th>
              <th className="px-5 py-3">Commission Owed</th>
            </tr>
          </thead>
          <tbody>
            {setterRows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center font-sans text-sm text-fg-secondary">
                  No setters yet.
                </td>
              </tr>
            ) : (
              setterRows.map((r) => (
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

      <p className="mt-6 eyebrow">Closers (50% first month + 50% recurring)</p>
      <div className="mt-2 overflow-hidden rounded-card border border-line bg-elevated">
        <table className="w-full text-left">
          <thead className="eyebrow bg-surface">
            <tr>
              <th className="px-5 py-3">Closer</th>
              <th className="px-5 py-3">Deals Closed</th>
              <th className="px-5 py-3">Commission Owed</th>
            </tr>
          </thead>
          <tbody>
            {closerRows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center font-sans text-sm text-fg-secondary">
                  No closers yet.
                </td>
              </tr>
            ) : (
              closerRows.map((r) => (
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

// Prompt 609 — subtitles now state the real three-role structure honestly.
const ADMIN_SUBTITLE = 'First month: 15% setter / 35% admin / 50% closer. Every month after: 50% closer / 50% admin.'
const SETTER_SUBTITLE = "15% of the first month's total (setup fee + first month's fee), paid once when a deal you booked closes."
const CLOSER_SUBTITLE = "50% of the first month, then 50% of every month after that for as long as the client stays active."

export default function Commissions() {
  const { profile } = useAuth()
  const { data: leads, isLoading } = useCommissionLeads()
  const { data: reps } = useReps()

  const isCloser = profile?.role === 'closer'
  const isAdmin = profile?.role === 'admin'
  usePageHeader({
    title: isCloser ? 'My Commissions' : isAdmin ? 'Commissions' : 'My Commissions',
    subtitle: isCloser ? CLOSER_SUBTITLE : isAdmin ? ADMIN_SUBTITLE : SETTER_SUBTITLE,
  })

  if (isLoading) {
    return <PageLoading />
  }

  if (isAdmin) {
    return <AdminCommissionRollup leads={leads || []} reps={reps} />
  }

  if (isCloser) {
    const mine = (leads || []).filter((l) => l.assigned_closer === profile?.id)
    return <MyCloserCommissions leads={mine} />
  }

  const mine = (leads || []).filter((l) => l.last_action_by === profile?.id)
  return <MyCommissions leads={mine} />
}
