import { useState } from 'react'
import clsx from 'clsx'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { ConfirmedStackSummary } from './ConfirmedStackSummary'
import { OUTCOME_LABELS, OUTCOME_SOLID, OUTCOME_TINT } from './ui/OutcomeBadge'
import { useLogCloserOutcome } from '../hooks/useLeads'
import { priceForSurveyValue } from '../lib/agentCatalog'

// Prompt 540 — 'needs_reschedule' retired as a manual pick: No Show is now
// a derived display state (lib/closerOutcome.js) and a real Reschedule
// action (CloserLeadModal's own tab) replaces what this button used to
// stand in for. Was at 0 leads in production at retirement time, so
// nothing to migrate.
const OUTCOMES = ['pending', 'lost', 'closed']

// Prompt 464 — same interaction shape as setters' LogCallModal (pick an
// outcome, optional notes, Save), for the deal-outcome tracking closers
// didn't have before. No call-placing UI here — this logs what happened
// with an already-booked deal, not a dial attempt.
// Prompt 468 — Closed specifically also requires the two deal-value
// inputs commission math is computed from. Restorix has no fixed price
// list (unlike Ohvara), so this is the only moment the dollar value ever
// gets captured — required, not optional, since commission math is
// meaningless without them (also enforced DB-side via a CHECK constraint,
// this is just the friendlier client-side version of the same rule).
//
// Prompt 487 — split into a bare form (`LogOutcomeForm`, no `<Modal>`
// wrapper of its own) plus this thin wrapper, so the new combined
// Closer Overview lead modal can embed the exact same form logic
// alongside the Closer Survey inside one shared `<Modal>` instead of
// duplicating the outcome-picker/deal-value logic.
//
// Prompt 612 — the deal-value inputs are gone. A deal's Stack (and
// therefore its price) comes only from the Closer Survey's most recently
// completed run for this lead — CloserLeadModal always passes
// `frontRunner`/`subAgents` (read-only; there's no picker to edit them
// with anymore). Closed is blocked entirely until a Stack exists.
// Prompt 614 — the price itself no longer sums catalog fees for the Stack;
// it scales with the survey's value-pricing answers (`missedCallsPerWeek`/
// `admissionValue`, also passed down from CloserLeadModal). Closed is still
// gated on a Stack (frontRunner) existing, not on value data existing —
// missing value data just floors the price at the FLOOR baseline.
export function LogOutcomeForm({ lead, onClose, frontRunner, subAgents = new Set(), missedCallsPerWeek, admissionValue }) {
  const [outcome, setOutcome] = useState(lead.closer_outcome || 'pending')
  const [notes, setNotes] = useState(lead.closer_notes || '')
  const logOutcome = useLogCloserOutcome()

  const isClosed = outcome === 'closed'
  const price = priceForSurveyValue(missedCallsPerWeek, admissionValue)
  const canSubmit = !isClosed || !!frontRunner

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    await logOutcome.mutateAsync({
      id: lead.id,
      closer_outcome: outcome,
      closer_notes: notes,
      deal_setup_fee: isClosed ? price.setupFee : undefined,
      deal_first_month_fee: isClosed ? price.monthlyFee : undefined,
    })
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Outcome">
        <div className="grid grid-cols-3 gap-2">
          {OUTCOMES.map((o) => (
            <button
              type="button"
              key={o}
              onClick={() => setOutcome(o)}
              className={clsx(
                'rounded-lg px-3 py-2 font-sans text-sm font-medium transition-colors hover:opacity-85',
                outcome === o ? OUTCOME_SOLID[o] : OUTCOME_TINT[o]
              )}
            >
              {OUTCOME_LABELS[o]}
            </button>
          ))}
        </div>
      </Field>

      {isClosed && (
        <>
          <ConfirmedStackSummary frontRunner={frontRunner} subAgents={subAgents} />
          {frontRunner ? (
            <p className="rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-primary">
              Setup fee: <span className="font-medium">${price.setupFee.toLocaleString()}</span> · First month
              total: <span className="font-medium">${price.firstMonthTotal.toLocaleString()}</span> · Then{' '}
              <span className="font-medium">${price.monthlyFee.toLocaleString()}/mo</span>
            </p>
          ) : (
            <p className="rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-secondary">
              Run the Closer Survey with this client first — Closed needs a Stack and price from it.
            </p>
          )}
        </>
      )}

      <Field label="Notes">
        <textarea
          className={inputClass()}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What's the status of this deal…"
        />
      </Field>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit || logOutcome.isPending}>
          {logOutcome.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
