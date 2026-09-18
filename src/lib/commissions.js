// Prompt 609: full rework of the comp model, replacing the old flat
// setter-only 15% one-shot (Prompt 468). Brayden's real structure, in his
// own words:
//   - First month (setup fee + first month's fee, billed together at
//     signing): 15% setter / 35% admin / 50% closer, one-shot.
//   - Every month after that (this is a recurring product): 50% closer /
//     50% admin, no setter share — their job was the initial booking.
export const SETTER_FIRST_MONTH_RATE = 0.15
export const ADMIN_FIRST_MONTH_RATE = 0.35
export const CLOSER_FIRST_MONTH_RATE = 0.5

export const CLOSER_RECURRING_RATE = 0.5
export const ADMIN_RECURRING_RATE = 0.5

function round2(n) {
  return Math.round(n * 100) / 100
}

// The full first-month payout that gets split 15/35/50 — setup fee and
// first month's fee are billed together at signing, so they're one pool.
export function firstMonthRevenue(lead) {
  const setupFee = Number(lead.deal_setup_fee) || 0
  const firstMonthFee = Number(lead.deal_first_month_fee) || 0
  return setupFee + firstMonthFee
}

// Assumed steady recurring rate — same as month 1's fee, no separate
// recurring price exists anywhere in this schema yet.
export function recurringMonthlyRevenue(lead) {
  return Number(lead.deal_first_month_fee) || 0
}

// Whole calendar months elapsed since the deal closed, minus 1 (month 1 is
// the first-month split above, not recurring). 0 or negative means no
// recurring commission has started yet. Real calendar-month diff, not a
// fixed 30-day divide — deliberately NOT using dates.js's UTC
// calendar-string helpers since closer_outcome_at is a full timestamptz,
// not a YYYY-MM-DD string.
//
// Known limitation (flagged, not silently built around): there is no
// churn/cancellation tracking anywhere in this schema, so this assumes the
// client is still active for every elapsed month. Overstates commission for
// a churned client. Real churn tracking is a separate, bigger feature.
export function recurringMonthsElapsed(lead, now = Date.now()) {
  if (!lead.closer_outcome_at) return 0
  const closed = new Date(lead.closer_outcome_at)
  const current = new Date(now)
  let months =
    (current.getUTCFullYear() - closed.getUTCFullYear()) * 12 +
    (current.getUTCMonth() - closed.getUTCMonth())
  if (current.getUTCDate() < closed.getUTCDate()) months -= 1
  return Math.max(0, months - 1)
}

// Setter: one-shot 15% of first-month revenue only. No recurring share by
// design — a setter's job ends at booking.
export function setterCommissionFor(lead) {
  return round2(firstMonthRevenue(lead) * SETTER_FIRST_MONTH_RATE)
}

export function setterTotalCommission(leads) {
  return leads.reduce((sum, lead) => sum + setterCommissionFor(lead), 0)
}

// Kept as the old exported names — MyGoals.jsx's commission-tier progress
// only ever needs the setter's own one-shot total, same shape Prompt 468
// originally shipped.
export const commissionFor = setterCommissionFor
export const totalCommission = setterTotalCommission

// Closer: 50% first-month share (one-shot) + 50% of every recurring month
// elapsed since close (ongoing, growing over time). `now` threaded through
// for testability.
export function closerFirstMonthCommission(lead) {
  return round2(firstMonthRevenue(lead) * CLOSER_FIRST_MONTH_RATE)
}

export function closerRecurringCommission(lead, now = Date.now()) {
  return round2(recurringMonthsElapsed(lead, now) * recurringMonthlyRevenue(lead) * CLOSER_RECURRING_RATE)
}

export function closerTotalCommission(lead, now = Date.now()) {
  return round2(closerFirstMonthCommission(lead) + closerRecurringCommission(lead, now))
}

export function closerTotalCommissionForLeads(leads, now = Date.now()) {
  return leads.reduce((sum, lead) => sum + closerTotalCommission(lead, now), 0)
}

// Admin: 35% first-month share (one-shot) + 50% of every recurring month
// elapsed since close — same two-part shape as the closer, different rates,
// but company-wide rather than scoped to one person.
export function adminFirstMonthCommission(lead) {
  return round2(firstMonthRevenue(lead) * ADMIN_FIRST_MONTH_RATE)
}

export function adminRecurringCommission(lead, now = Date.now()) {
  return round2(recurringMonthsElapsed(lead, now) * recurringMonthlyRevenue(lead) * ADMIN_RECURRING_RATE)
}

export function adminTotalCommission(lead, now = Date.now()) {
  return round2(adminFirstMonthCommission(lead) + adminRecurringCommission(lead, now))
}

export function adminTotalCommissionForLeads(leads, now = Date.now()) {
  return leads.reduce((sum, lead) => sum + adminTotalCommission(lead, now), 0)
}
