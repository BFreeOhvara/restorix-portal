// Prompt 468: Brayden confirmed the exact mechanics directly — setters
// earn 15% of (setup fee + first month's fee) on every deal that reaches
// Closed, a one-time payout, nothing recurring after the first month. No
// indication this rate needs to be configurable, so it's a named constant
// rather than a stored/editable value (default recommended by the prompt
// itself when nothing says otherwise).
export const SETTER_COMMISSION_RATE = 0.15

// Computed, not stored — the simplest correct approach with only one rate
// that has ever existed (no rate-change history to snapshot against).
export function commissionFor(lead) {
  const setupFee = Number(lead.deal_setup_fee) || 0
  const firstMonthFee = Number(lead.deal_first_month_fee) || 0
  return Math.round((setupFee + firstMonthFee) * SETTER_COMMISSION_RATE * 100) / 100
}

export function totalCommission(leads) {
  return leads.reduce((sum, lead) => sum + commissionFor(lead), 0)
}
