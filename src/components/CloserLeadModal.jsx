import { useState } from 'react'
import clsx from 'clsx'
import Modal from './ui/Modal'
import { LogOutcomeForm } from './LogOutcomeModal'
import { SurveyBody } from '../pages/Survey'

const TABS = [
  { key: 'outcome', label: 'Log Outcome' },
  { key: 'survey', label: 'Closer Survey' },
]

// Prompt 487 — Closer Overview's lead rows now open this single modal
// instead of going straight to LogOutcomeModal, so a closer can also run
// the Closer Survey for this specific lead without leaving the popup
// mid-call. Both tabs render the exact same components the standalone
// LogOutcomeModal/Survey page already use (`LogOutcomeForm`,
// `SurveyBody`) — no duplicated form/question-tree logic, so behavior
// and content can never drift between the in-context and standalone
// versions. The standalone `/survey` nav page and `LogOutcomeModal`
// itself (still used by Pipeline.jsx) are both unchanged.
export default function CloserLeadModal({ lead, onClose }) {
  const [tab, setTab] = useState('outcome')

  return (
    <Modal title={lead.facility_name} onClose={onClose} width="max-w-2xl">
      <div className="flex gap-2 border-b border-line pb-4">
        {TABS.map((t) => (
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
        {tab === 'outcome' ? <LogOutcomeForm lead={lead} onClose={onClose} /> : <SurveyBody />}
      </div>
    </Modal>
  )
}
