import { useState } from 'react'
import clsx from 'clsx'
import Modal from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { LogOutcomeForm } from './LogOutcomeModal'
import { SurveyBody } from '../pages/Survey'
import { useRescheduleLead } from '../hooks/useLeads'
import { displayOutcome } from '../lib/closerOutcome'

const BASE_TABS = [
  { key: 'outcome', label: 'Log Outcome' },
  { key: 'survey', label: 'Closer Survey' },
]

function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Prompt 540 — sets a new strategy_call_at on a Pending/No Show lead. Once
// saved, the timestamp is in the future again so the lead reads back as
// Pending under displayOutcome()'s own rule — no separate "unmark no-show"
// step needed. Only ever rendered when displayOutcome(lead) is 'pending' or
// 'no_show' (see TABS below), so there's never a stored closer_outcome to
// touch here, just the timestamp.
function RescheduleForm({ lead, onClose }) {
  const [when, setWhen] = useState(() => toLocalInputValue(lead.strategy_call_at ? new Date(lead.strategy_call_at) : new Date()))
  const reschedule = useRescheduleLead()

  async function handleSubmit(e) {
    e.preventDefault()
    await reschedule.mutateAsync({ id: lead.id, strategy_call_at: new Date(when).toISOString() })
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="New strategy call date & time">
        <input
          type="datetime-local"
          className={inputClass()}
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          required
        />
      </Field>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={reschedule.isPending}>
          {reschedule.isPending ? 'Saving…' : 'Reschedule'}
        </Button>
      </div>
    </form>
  )
}

// Prompt 487 — Closer Overview's lead rows now open this single modal
// instead of going straight to LogOutcomeModal, so a closer can also run
// the Closer Survey for this specific lead without leaving the popup
// mid-call. Both tabs render the exact same components the standalone
// LogOutcomeModal/Survey page already use (`LogOutcomeForm`,
// `SurveyBody`) — no duplicated form/question-tree logic, so behavior
// and content can never drift between the in-context and standalone
// versions. The standalone `/survey` nav page and `LogOutcomeModal`
// itself (still used by Pipeline.jsx) are both unchanged.
// Prompt 540 — Reschedule tab only offered on a Pending or No Show lead
// (displayOutcome — no_show IS 'pending' underneath, so this one check
// covers both), matching the spec's own scoping: a Lost or Closed deal
// isn't something you reschedule.
export default function CloserLeadModal({ lead, onClose }) {
  const [tab, setTab] = useState('outcome')
  const canReschedule = ['pending', 'no_show'].includes(displayOutcome(lead))
  const tabs = canReschedule ? [...BASE_TABS, { key: 'reschedule', label: 'Reschedule' }] : BASE_TABS

  return (
    <Modal title={lead.facility_name} onClose={onClose} width="max-w-2xl">
      <div className="flex gap-2 border-b border-line pb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={clsx(
              'eyebrow rounded-full px-4 py-2 transition-colors',
              tab === t.key
                ? 'bg-accent !text-white'
                : 'bg-surface !text-fg-secondary hover:!text-fg-primary'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5 max-h-[70vh] overflow-y-auto pr-1">
        {tab === 'outcome' && <LogOutcomeForm lead={lead} onClose={onClose} />}
        {tab === 'survey' && <SurveyBody />}
        {tab === 'reschedule' && <RescheduleForm lead={lead} onClose={onClose} />}
      </div>
    </Modal>
  )
}
