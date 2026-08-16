import { useState } from 'react'
import Modal from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { useLogCall } from '../hooks/useLeads'
import { useClosers } from '../hooks/useClosers'

const OUTCOMES = [
  { value: 'no_answer', label: 'No Answer' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'callback', label: 'Callback Later' },
  { value: 'booked', label: 'Booked' },
]

function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function LogCallModal({ lead, onClose }) {
  const [outcome, setOutcome] = useState('')
  const [notes, setNotes] = useState(lead.notes || '')
  const [when, setWhen] = useState(toLocalInputValue(new Date()))
  const [closerId, setCloserId] = useState('')
  const logCall = useLogCall()
  const { data: closers } = useClosers()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!outcome) return

    const patch = { status: outcome, notes }
    if (outcome === 'callback') patch.callback_at = new Date(when).toISOString()
    if (outcome === 'booked') {
      patch.strategy_call_at = new Date(when).toISOString()
      if (closerId) patch.assigned_closer = closerId
    }

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

        {outcome === 'callback' && (
          <Field label="Callback date & time">
            <input
              type="datetime-local"
              className={inputClass()}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </Field>
        )}

        {outcome === 'booked' && (
          <>
            <Field label="Strategy call date & time">
              <input
                type="datetime-local"
                className={inputClass()}
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                required
              />
            </Field>
            <Field label="Hand off to closer (optional)">
              <select className={inputClass()} value={closerId} onChange={(e) => setCloserId(e.target.value)}>
                <option value="">Unassigned</option>
                {closers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </Field>
          </>
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
