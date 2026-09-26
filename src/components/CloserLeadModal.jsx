import { useCallback, useState } from 'react'
import clsx from 'clsx'
import { CheckCircle2 } from 'lucide-react'
import Modal from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { LogOutcomeForm } from './LogOutcomeModal'
import { ConfirmedStackSummary } from './ConfirmedStackSummary'
import { SurveyBody } from '../pages/Survey'
import { useReopenLead, useRescheduleLead, useSaveSurveyStack } from '../hooks/useLeads'
import { useConfirmDeal, useDealForLead } from '../hooks/useDeals'
import { displayOutcome, tabsForStatus } from '../lib/closerOutcome'
import OutcomeBadge from './ui/OutcomeBadge'

function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtDateTime(dt) {
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
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

// Prompt 658 — a Lost lead's dedicated view: no action tabs pretending
// it's still an active deal (Log Outcome/Survey/Reschedule/Client Portal
// all assume the lead is still moving forward), just what happened and one
// deliberate way back in. Reopen always asks for a fresh call time rather
// than being a same-row status flip — the old strategy_call_at is what let
// this lead go stale in the first place, so silently restoring it would
// just recreate the same problem.
function LostHistory({ lead, onClose }) {
  const [reopening, setReopening] = useState(false)
  const [when, setWhen] = useState(() => toLocalInputValue(new Date()))
  const reopenLead = useReopenLead()

  async function handleReopen(e) {
    e.preventDefault()
    await reopenLead.mutateAsync({ id: lead.id, strategy_call_at: new Date(when).toISOString() })
    onClose()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <OutcomeBadge outcome="lost" />
        {lead.closer_outcome_at && (
          <span className="font-sans text-xs text-fg-secondary">
            Marked Lost on {fmtDateTime(lead.closer_outcome_at)}
          </span>
        )}
      </div>

      <Field label="Notes">
        <p className="whitespace-pre-wrap rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-primary">
          {lead.closer_notes || 'No notes were left.'}
        </p>
      </Field>

      {!reopening ? (
        <div className="flex justify-end border-t border-line pt-4">
          <Button type="button" variant="secondary" onClick={() => setReopening(true)}>
            Reopen
          </Button>
        </div>
      ) : (
        <form onSubmit={handleReopen} className="space-y-4 border-t border-line pt-4">
          <Field label="New strategy call date & time">
            <input
              type="datetime-local"
              className={inputClass()}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </Field>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setReopening(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={reopenLead.isPending}>
              {reopenLead.isPending ? 'Reopening…' : 'Reopen lead'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

// Prompt 660 — a lead sitting on a sent Stripe payment request: nothing
// left for the closer to do here but wait for stripe-payment-webhook (a
// real ACH payment landing flips this to Closed) or the grace-period
// timeout (expire-awaiting-payment flips it to Lost). Same "read-only
// history view, no action tabs" shape as LostHistory — see
// tabsForStatus()'s own [] for this status.
function AwaitingPaymentView({ lead }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <OutcomeBadge outcome="awaiting_payment" />
        {lead.awaiting_payment_at && (
          <span className="font-sans text-xs text-fg-secondary">
            Payment request sent {fmtDateTime(lead.awaiting_payment_at)}
          </span>
        )}
      </div>

      <p className="rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-primary">
        Invoice sent to <span className="font-medium">{lead.contact_email || 'the client'}</span> for{' '}
        <span className="font-medium">
          ${((lead.deal_setup_fee || 0) + (lead.deal_first_month_fee || 0)).toLocaleString()}
        </span>{' '}
        (setup + first month) via ACH Direct Debit.
      </p>
      <p className="font-sans text-xs text-fg-secondary">
        This becomes Closed automatically once Stripe confirms the payment. If it goes unpaid too long, it
        flips to Lost on its own — nothing to do here in the meantime.
      </p>

      {lead.payment_failed_at && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3">
          <p className="font-sans text-sm font-semibold text-danger">Payment issue flagged</p>
          <p className="mt-1 font-sans text-xs text-fg-secondary">{lead.payment_failed_note}</p>
        </div>
      )}
    </div>
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
// Prompt 658 — the tab/action set is now gated on the lead's actual status,
// not shown uniformly: Pending/No Show only get Log Outcome + Reschedule
// (Closer Survey and Client Portal both assume a call already happened or
// a deal already closed, neither of which is true yet); Closed only gets
// Closer Survey + Client Portal (there's no more strategy call left to
// reschedule, and Log Outcome's job — deciding Lost vs. Closed — is already
// done); Lost drops every action tab in favor of `LostHistory` (its own
// read-then-Reopen view, not a same-row status flip). Only Pending/No Show
// and Closed still use a real tab bar — Lost renders as one single view.
export default function CloserLeadModal({ lead, onClose }) {
  const status = displayOutcome(lead)
  const isPendingOrNoShow = status === 'pending' || status === 'no_show'
  const isLost = status === 'lost'
  const isAwaitingPayment = status === 'awaiting_payment'
  const isClosedStatus = status === 'closed'
  const saveSurveyStack = useSaveSurveyStack()
  const [tab, setTab] = useState(isClosedStatus ? 'client_portal' : 'outcome')
  const [frontRunner, setFrontRunner] = useState(lead.survey_front_runner || '')
  const [subAgents, setSubAgents] = useState(() => new Set(lead.survey_sub_agents || []))
  // Prompt 614 — same "lift to local state" precedent as frontRunner/
  // subAgents above: `lead` is a snapshot captured when its row was clicked
  // and doesn't refresh mid-session, so the two pricing-input survey answers
  // live here too rather than being read from `lead.survey_*` directly —
  // otherwise completing the survey wouldn't update the price shown on the
  // Log Outcome tab until the modal was closed and reopened.
  const [missedCallsPerWeek, setMissedCallsPerWeek] = useState(lead.survey_missed_calls_per_week || '')
  const [admissionValue, setAdmissionValue] = useState(lead.survey_admission_value || '')

  const handleSurveyResults = useCallback(
    (results) => {
      const subKeys = results.subAgents?.map((a) => a.key) || []
      setFrontRunner(results.frontRunnerKey || '')
      setSubAgents(new Set(subKeys))
      setMissedCallsPerWeek(results.missedCallsPerWeek || '')
      setAdmissionValue(results.admissionValue || '')
      if (results.frontRunnerKey) {
        saveSurveyStack.mutate({
          id: lead.id,
          frontRunner: results.frontRunnerKey,
          subAgents: subKeys,
          missedCallsPerWeek: results.missedCallsPerWeek || '',
          admissionValue: results.admissionValue || '',
        })
      }
    },
    [lead.id, saveSurveyStack]
  )

  const tabs = tabsForStatus(status)

  return (
    <Modal title={lead.facility_name} onClose={onClose} width="max-w-2xl">
      {tabs.length > 0 && (
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
      )}

      <div className={clsx('max-h-[70vh] overflow-y-auto pr-1', tabs.length > 0 && 'mt-5')}>
        {isLost && <LostHistory lead={lead} onClose={onClose} />}
        {isAwaitingPayment && <AwaitingPaymentView lead={lead} />}
        {isClosedStatus && lead.payment_failed_at && (
          <div className="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3">
            <p className="font-sans text-sm font-semibold text-danger">Payment issue flagged</p>
            <p className="mt-1 font-sans text-xs text-fg-secondary">{lead.payment_failed_note}</p>
          </div>
        )}
        {isPendingOrNoShow && tab === 'outcome' && (
          <LogOutcomeForm
            lead={lead}
            onClose={onClose}
            frontRunner={frontRunner}
            subAgents={subAgents}
            missedCallsPerWeek={missedCallsPerWeek}
            admissionValue={admissionValue}
          />
        )}
        {isPendingOrNoShow && tab === 'reschedule' && <RescheduleForm lead={lead} onClose={onClose} />}
        {isClosedStatus && tab === 'survey' && <SurveyBody onResults={handleSurveyResults} />}
        {isClosedStatus && tab === 'client_portal' && (
          <ClientPortalForm lead={lead} frontRunner={frontRunner} subAgents={subAgents} />
        )}
      </div>
    </Modal>
  )
}
