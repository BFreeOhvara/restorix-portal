import { useCallback, useState } from 'react'
import clsx from 'clsx'
import { CheckCircle2 } from 'lucide-react'
import Modal from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { LogOutcomeForm } from './LogOutcomeModal'
import { ConfirmedStackSummary } from './ConfirmedStackSummary'
import { SurveyBody } from '../pages/Survey'
import { useRescheduleLead, useSaveSurveyStack } from '../hooks/useLeads'
import { useConfirmDeal, useDealForLead } from '../hooks/useDeals'
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

// Prompt 546 — the confirm-the-Stack step. Shown once a deal is logged
// Closed: the closer confirms the client's Stack, plus the client's phone.
// Submitting writes the `deals` row and fires the SMS invite in one action
// — no manual step, per Brayden's own description.
// Prompt 610 — `frontRunner`/`subAgents` are lifted to CloserLeadModal and
// shared with the Log Outcome tab (same precedent as `surveyResults`).
// Prompt 612 — the Stack is no longer picked here (or anywhere): it's
// read-only, sourced entirely from the Closer Survey's persisted result.
function ClientPortalForm({ lead, frontRunner, subAgents }) {
  const existing = useDealForLead(lead.id)
  const confirmDeal = useConfirmDeal()
  const [phone, setPhone] = useState(lead.phone || '')

  if (existing.isLoading) {
    return <p className="font-sans text-sm text-fg-secondary">Loading…</p>
  }

  const deal = existing.data
  if (deal) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3">
          <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-success" />
          <div>
            <p className="font-sans text-sm font-semibold text-success">Client portal provisioned</p>
            <p className="mt-1 font-sans text-xs text-fg-secondary">
              An SMS invite was sent. The client sets up their own login and dashboard from that link.
            </p>
          </div>
        </div>
        <ConfirmedStackSummary frontRunner={deal.front_runner} subAgents={deal.sub_agents || []} />
      </div>
    )
  }

  if (lead.closer_outcome !== 'closed') {
    return (
      <p className="font-sans text-sm text-fg-secondary">
        Log this deal as <span className="font-medium text-fg-primary">Closed</span> on the Log Outcome tab
        first, then confirm the client's Stack here to provision their portal.
      </p>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await confirmDeal.mutateAsync({
      leadId: lead.id,
      frontRunner,
      subAgents: [...subAgents],
      clientPhone: phone,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="font-sans text-xs text-fg-secondary">
        Confirm exactly what this client bought. This provisions their portal and texts them a setup link —
        it can't be undone from here.
      </p>

      <ConfirmedStackSummary frontRunner={frontRunner} subAgents={subAgents} />

      <Field label="Client phone (for the SMS invite)">
        <input
          type="tel"
          className={inputClass()}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          required
        />
      </Field>

      {confirmDeal.isError && (
        <p className="font-sans text-sm text-danger">
          {confirmDeal.error?.message || 'Something went wrong. Try again.'}
        </p>
      )}

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={!frontRunner || confirmDeal.isPending}>
          {confirmDeal.isPending ? 'Provisioning…' : 'Confirm & send client invite'}
        </Button>
      </div>
    </form>
  )
}

// Prompt 487 — Closer Overview's lead rows open this single modal instead
// of going straight to LogOutcomeModal, so a closer can also run the
// Closer Survey for this specific lead without leaving the popup mid-call.
// Both tabs render the exact components the standalone LogOutcomeModal /
// Survey page already use (`LogOutcomeForm`, `SurveyBody`) — no duplicated
// logic, so behavior/content can't drift.
// Prompt 540 — Reschedule tab only on a Pending/No Show lead.
// Prompt 546 — Client Portal tab: always present, but its body is gated on
// the lead being Closed (or a deal already existing). Defaults to that tab
// when the lead is already Closed with no deal yet, so a closer who just
// logged the close and reopened lands straight on the provisioning step.
// Prompt 612 — a deal's Stack is now sourced ONLY from the Closer Survey,
// never from a manual pick — `frontRunner`/`subAgents` seed from the lead's
// own persisted `survey_front_runner`/`survey_sub_agents` (the survey's most
// recently completed run for this lead, from a prior session or reopening
// this same modal), not from empty. There's no longer a competing manual
// pick to arbitrate against, so the old "whichever came first" prefill
// precedence is gone entirely: reaching the survey's summary step (this
// session or a past one) is the only way this Stack is ever set, and it
// simply overwrites whatever was there before.
export default function CloserLeadModal({ lead, onClose }) {
  const canReschedule = ['pending', 'no_show'].includes(displayOutcome(lead))
  const existingDeal = useDealForLead(lead.id)
  const saveSurveyStack = useSaveSurveyStack()
  const [tab, setTab] = useState(
    lead.closer_outcome === 'closed' && !existingDeal.data ? 'client_portal' : 'outcome'
  )
  const [frontRunner, setFrontRunner] = useState(lead.survey_front_runner || '')
  const [subAgents, setSubAgents] = useState(() => new Set(lead.survey_sub_agents || []))

  const handleSurveyResults = useCallback(
    (results) => {
      const subKeys = results.subAgents?.map((a) => a.key) || []
      setFrontRunner(results.frontRunnerKey || '')
      setSubAgents(new Set(subKeys))
      if (results.frontRunnerKey) {
        saveSurveyStack.mutate({ id: lead.id, frontRunner: results.frontRunnerKey, subAgents: subKeys })
      }
    },
    [lead.id, saveSurveyStack]
  )

  const tabs = [
    ...BASE_TABS,
    ...(canReschedule ? [{ key: 'reschedule', label: 'Reschedule' }] : []),
    { key: 'client_portal', label: 'Client Portal' },
  ]

  return (
    <Modal title={lead.facility_name} onClose={onClose} width="max-w-2xl">
      <div className="flex flex-wrap gap-2 border-b border-line pb-4">
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
        {tab === 'outcome' && (
          <LogOutcomeForm lead={lead} onClose={onClose} frontRunner={frontRunner} subAgents={subAgents} />
        )}
        {tab === 'survey' && <SurveyBody onResults={handleSurveyResults} />}
        {tab === 'reschedule' && <RescheduleForm lead={lead} onClose={onClose} />}
        {tab === 'client_portal' && (
          <ClientPortalForm lead={lead} frontRunner={frontRunner} subAgents={subAgents} />
        )}
      </div>
    </Modal>
  )
}
