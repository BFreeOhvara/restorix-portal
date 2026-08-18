import { useState } from 'react'
import clsx from 'clsx'
import Modal from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { OUTCOME_LABELS, OUTCOME_SOLID, OUTCOME_TINT } from './ui/OutcomeBadge'
import { useLogCloserOutcome } from '../hooks/useLeads'

const OUTCOMES = ['pending', 'needs_reschedule', 'lost', 'closed']

// Prompt 464 — same interaction shape as setters' LogCallModal (pick an
// outcome, optional notes, Save), for the deal-outcome tracking closers
// didn't have before. No call-placing UI here — this logs what happened
// with an already-booked deal, not a dial attempt.
export default function LogOutcomeModal({ lead, onClose }) {
  const [outcome, setOutcome] = useState(lead.closer_outcome || 'pending')
  const [notes, setNotes] = useState(lead.closer_notes || '')
  const logOutcome = useLogCloserOutcome()

  async function handleSubmit(e) {
    e.preventDefault()
    await logOutcome.mutateAsync({ id: lead.id, closer_outcome: outcome, closer_notes: notes })
    onClose()
  }

  return (
    <Modal title={`Log outcome — ${lead.facility_name}`} onClose={onClose} width="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Outcome">
          <div className="grid grid-cols-2 gap-2">
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
          <Button type="submit" disabled={logOutcome.isPending}>
            {logOutcome.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
