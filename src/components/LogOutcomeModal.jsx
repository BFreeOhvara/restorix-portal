import { useState } from 'react'
import clsx from 'clsx'
import Modal from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { OUTCOME_LABELS, OUTCOME_SOLID, OUTCOME_TINT } from './ui/OutcomeBadge'
import { useLogCloserOutcome } from '../hooks/useLeads'

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
// duplicating the outcome-picker/deal-value logic. `LogOutcomeModal`
// itself is unchanged for its existing standalone callers (Pipeline.jsx,
// the admin Closer tab) — same props, same behavior.
export function LogOutcomeForm({ lead, onClose }) {
  const [outcome, setOutcome] = useState(lead.closer_outcome || 'pending')
  const [notes, setNotes] = useState(lead.closer_notes || '')
  const [setupFee, setSetupFee] = useState(lead.deal_setup_fee ?? '')
  const [firstMonthFee, setFirstMonthFee] = useState(lead.deal_first_month_fee ?? '')
  const logOutcome = useLogCloserOutcome()

  const isClosed = outcome === 'closed'
  const setupFeeValid = setupFee !== '' && Number(setupFee) >= 0
  const firstMonthFeeValid = firstMonthFee !== '' && Number(firstMonthFee) >= 0
  const canSubmit = !isClosed || (setupFeeValid && firstMonthFeeValid)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    await logOutcome.mutateAsync({
      id: lead.id,
      closer_outcome: outcome,
      closer_notes: notes,
      deal_setup_fee: isClosed ? Number(setupFee) : undefined,
      deal_first_month_fee: isClosed ? Number(firstMonthFee) : undefined,
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
        <div className="grid grid-cols-2 gap-4">
          <Field label="Setup fee ($)">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass()}
              value={setupFee}
              onChange={(e) => setSetupFee(e.target.value)}
              required
            />
          </Field>
          <Field label="First month fee ($)">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass()}
              value={firstMonthFee}
              onChange={(e) => setFirstMonthFee(e.target.value)}
              required
            />
          </Field>
        </div>
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

export default function LogOutcomeModal({ lead, onClose }) {
  return (
    <Modal title={`Log outcome — ${lead.facility_name}`} onClose={onClose} width="max-w-xl">
      <LogOutcomeForm lead={lead} onClose={onClose} />
    </Modal>
  )
}
