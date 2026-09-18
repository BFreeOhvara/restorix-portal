import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { CheckCircle2 } from 'lucide-react'
import Modal from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { LogOutcomeForm } from './LogOutcomeModal'
import { AgentPicker } from './AgentPicker'
import { SurveyBody } from '../pages/Survey'
import { useRescheduleLead } from '../hooks/useLeads'
import { useConfirmDeal, useDealForLead } from '../hooks/useDeals'
import { displayOutcome } from '../lib/closerOutcome'
import { AGENT_CATALOG } from '../lib/agentCatalog'

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
// Closed: the closer confirms the exact front-runner + sub-agents the
// client agreed to, plus the client's phone. Submitting writes the
// `deals` row and fires the SMS invite in one action — no manual step,
// per Brayden's own description.
// Prompt 610 — `frontRunner`/`subAgents` (and their setters) are no longer
// local state here: they're lifted to CloserLeadModal and shared with the
// Log Outcome tab's picker (same precedent as `surveyResults`), so picking
// agents once carries over instead of being re-picked per tab. The survey
// prefill effect moved up to CloserLeadModal for the same reason.
function ClientPortalForm({ lead, frontRunner, onFrontRunnerChange, subAgents, onToggleSubAgent }) {
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
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="eyebrow !text-fg-faint">Confirmed Stack</p>
          <p className="mt-2 font-sans text-sm text-fg-primary">
            {AGENT_CATALOG[deal.front_runner]?.label || deal.front_runner}
          </p>
          {(deal.sub_agents || []).length > 0 && (
            <ul className="mt-1 list-disc pl-5 font-sans text-sm text-fg-secondary">
              {deal.sub_agents.map((k) => (
                <li key={k}>{AGENT_CATALOG[k]?.label || k}</li>
              ))}
            </ul>
          )}
        </div>
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

      <AgentPicker
        frontRunner={frontRunner}
        onFrontRunnerChange={onFrontRunnerChange}
        subAgents={subAgents}
        onToggleSubAgent={onToggleSubAgent}
      />

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
// `surveyResults` is lifted here so the Survey tab's recommendation can
// pre-fill the Client Portal form.
// Prompt 610 — `frontRunner`/`subAgents` are also lifted here (same
// pattern) so the Log Outcome tab's picker and the Client Portal tab's
// picker are the same selection, not two independent ones. The survey
// prefill only applies if the closer hasn't already picked a front-runner
// on the Log Outcome tab — "whichever came first" precedence.
export default function CloserLeadModal({ lead, onClose }) {
  const canReschedule = ['pending', 'no_show'].includes(displayOutcome(lead))
  const existingDeal = useDealForLead(lead.id)
  const [surveyResults, setSurveyResults] = useState(null)
  const [tab, setTab] = useState(
    lead.closer_outcome === 'closed' && !existingDeal.data ? 'client_portal' : 'outcome'
  )
  const [frontRunner, setFrontRunner] = useState('')
  const [subAgents, setSubAgents] = useState(() => new Set())
  const [agentsPrefilled, setAgentsPrefilled] = useState(false)

  useEffect(() => {
    if (agentsPrefilled || !surveyResults) return
    if (!frontRunner && surveyResults.frontRunnerKey) setFrontRunner(surveyResults.frontRunnerKey)
    if (subAgents.size === 0 && surveyResults.subAgents?.length) {
      setSubAgents(new Set(surveyResults.subAgents.map((a) => a.key)))
    }
    setAgentsPrefilled(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyResults, agentsPrefilled])

  function toggleSubAgent(key) {
    setSubAgents((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
          <LogOutcomeForm
            lead={lead}
            onClose={onClose}
            frontRunner={frontRunner}
            onFrontRunnerChange={setFrontRunner}
            subAgents={subAgents}
            onToggleSubAgent={toggleSubAgent}
          />
        )}
        {tab === 'survey' && <SurveyBody onResults={setSurveyResults} />}
        {tab === 'reschedule' && <RescheduleForm lead={lead} onClose={onClose} />}
        {tab === 'client_portal' && (
          <ClientPortalForm
            lead={lead}
            frontRunner={frontRunner}
            onFrontRunnerChange={setFrontRunner}
            subAgents={subAgents}
            onToggleSubAgent={toggleSubAgent}
          />
        )}
      </div>
    </Modal>
  )
}
