import { useState } from 'react'
import clsx from 'clsx'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { ConfirmedStackSummary } from './ConfirmedStackSummary'
import { OUTCOME_SOLID, OUTCOME_TINT } from './ui/OutcomeBadge'
import { useCreatePaymentRequest, useLogCloserOutcome } from '../hooks/useLeads'
import { priceForSurveyValue } from '../lib/agentCatalog'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Prompt 540 — 'needs_reschedule' retired as a manual pick: No Show is now
// a derived display state (lib/closerOutcome.js) and a real Reschedule
// action (CloserLeadModal's own tab) replaces what this button used to
// stand in for. Was at 0 leads in production at retirement time, so
// nothing to migrate.
// Prompt 658 — 'pending' dropped too: CloserLeadModal only ever mounts this
// form while the lead's own status is already Pending/No Show, so
// "Pending" isn't a real outcome to pick, it's the status quo.
// Prompt 660 — 'closed' is no longer a free pick either: a lead only ever
// becomes Closed once stripe-payment-webhook confirms a real ACH payment
// landed. This form's second mode sends a Stripe payment request instead
// (moves the lead to 'awaiting_payment', not 'closed') — Lost is still a
// real, immediate, manually-logged outcome (a call happened and the client
// said no, no payment ever in the picture).
const MODES = ['lost', 'payment_request']
const MODE_LABELS = { lost: 'Lost', payment_request: 'Send Payment Request' }
// 'payment_request' reuses the awaiting_payment color — that's the state
// this action is about to put the lead into.
const MODE_TINT = { lost: OUTCOME_TINT.lost, payment_request: OUTCOME_TINT.awaiting_payment }
const MODE_SOLID = { lost: OUTCOME_SOLID.lost, payment_request: OUTCOME_SOLID.awaiting_payment }

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
  const [mode, setMode] = useState('lost')
  const [notes, setNotes] = useState(lead.closer_notes || '')
  const price = priceForSurveyValue(missedCallsPerWeek, admissionValue)
  const [setupFee, setSetupFee] = useState(price.setupFee)
  const [firstMonthFee, setFirstMonthFee] = useState(price.monthlyFee)
  const [contactEmail, setContactEmail] = useState(lead.contact_email || '')
  const logOutcome = useLogCloserOutcome()
  const createPaymentRequest = useCreatePaymentRequest()

  const isPaymentRequest = mode === 'payment_request'
  const emailValid = EMAIL_RE.test(contactEmail.trim())
  const canSubmit = isPaymentRequest
    ? !!frontRunner && emailValid && setupFee >= 0 && firstMonthFee >= 0
    : true
  const isPending = logOutcome.isPending || createPaymentRequest.isPending

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    if (isPaymentRequest) {
      await createPaymentRequest.mutateAsync({
        leadId: lead.id,
        setupFee: Number(setupFee),
        firstMonthFee: Number(firstMonthFee),
        contactEmail: contactEmail.trim(),
      })
    } else {
      await logOutcome.mutateAsync({ id: lead.id, closer_outcome: 'lost', closer_notes: notes })
    }
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Outcome">
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMode(m)}
              className={clsx(
                'rounded-lg px-3 py-2 font-sans text-sm font-medium transition-colors hover:opacity-85',
                mode === m ? MODE_SOLID[m] : MODE_TINT[m]
              )}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </Field>

      {isPaymentRequest && (
        <>
          <ConfirmedStackSummary frontRunner={frontRunner} subAgents={subAgents} />
          {frontRunner ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Setup fee">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass()}
                    value={setupFee}
                    onChange={(e) => setSetupFee(e.target.value)}
                  />
                </Field>
                <Field label="First month fee">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass()}
                    value={firstMonthFee}
                    onChange={(e) => setFirstMonthFee(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Client email (for the Stripe invoice)">
                <input
                  type="email"
                  className={inputClass()}
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="billing@facility.com"
                  required
                />
              </Field>
              <p className="rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-secondary">
                Sends a Stripe invoice for{' '}
                <span className="font-medium text-fg-primary">
                  ${(Number(setupFee) + Number(firstMonthFee)).toLocaleString()}
                </span>{' '}
                (setup + first month), collected via ACH Direct Debit only. The client's bank account also
                becomes the recurring{' '}
                <span className="font-medium text-fg-primary">${Number(firstMonthFee).toLocaleString()}/mo</span>{' '}
                charge, starting the following month — but only once this invoice is actually paid.
              </p>
            </>
          ) : (
            <p className="rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-secondary">
              Run the Closer Survey with this client first — a payment request needs a Stack and price from it.
            </p>
          )}
        </>
      )}

      {!isPaymentRequest && (
        <Field label="Notes">
          <textarea
            className={inputClass()}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What's the status of this deal…"
          />
        </Field>
      )}

      {createPaymentRequest.isError && (
        <p className="font-sans text-sm text-danger">
          {createPaymentRequest.error?.message || 'Something went wrong sending the payment request.'}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit || isPending}>
          {isPending ? 'Saving…' : isPaymentRequest ? 'Send Payment Request' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
