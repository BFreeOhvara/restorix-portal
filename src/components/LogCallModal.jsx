import { useState } from 'react'
import Modal from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { useLogCall } from '../hooks/useLeads'

const OUTCOMES = [
  { value: 'no_answer', label: 'No Answer' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'appointment_booked', label: 'Appointment Booked' },
]

function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function LogCallModal({ lead, onClose }) {
  const [outcome, setOutcome] = useState('')
  const [notes, setNotes] = useState(lead.notes || '')
  const [when, setWhen] = useState(toLocalInputValue(new Date()))
  const logCall = useLogCall()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!outcome) return

    const patch = { status: outcome, notes }
    if (outcome === 'follow_up') patch.follow_up_at = new Date(when).toISOString()
    if (outcome === 'appointment_booked') patch.strategy_call_at = new Date(when).toISOString()

    await logCall.mutateAsync({ id: lead.id, ...patch })
    onClose()
  }

  return (
    <Modal title={`Log call — ${lead.facility_name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Outcome">
          <div className="grid grid-cols-2 gap-2">
            {OUTCOMES.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => setOutcome(o.value)}
                className={`rounded-lg border px-3 py-2 font-sans text-sm transition-colors ${
                  outcome === o.value
                    ? 'border-accent bg-accent text-white'
                    : 'border-line bg-base text-fg-secondary hover:border-fg-primary/40'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        {outcome === 'follow_up' && (
          <Field label="Follow-up date & time">
            <input
              type="datetime-local"
              className={inputClass()}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </Field>
        )}

        {outcome === 'appointment_booked' && (
          <Field label="Strategy call date & time">
            <input
              type="datetime-local"
              className={inputClass()}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </Field>
        )}

        <Field label="Notes">
          <textarea
            className={inputClass()}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened on the call…"
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!outcome || logCall.isPending}>
            {logCall.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
