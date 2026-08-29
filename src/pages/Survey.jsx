import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { RotateCcw, ChevronDown } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'
import { useBrand } from '../hooks/useBrand'
import * as surveyBH from '../lib/survey'
import * as surveySuretix from '../lib/surveySuretix'

// Prompt 551 — the wizard's question tree / branching / state-machine is a
// single shared implementation; only the *content module* swaps by niche.
// behavioral_health → survey.js, bail_bonds → surveySuretix.js. Both export
// the same shape (COPY, RESULTS_CONTENT, initialSurveyState, visibleSteps,
// canAdvance, computeSurveyResults, INTAKE_KEY, MISSED_CALL_KEY).
const SURVEY_MODULES = {
  behavioral_health: surveyBH,
  bail_bonds: surveySuretix,
}

// Prompt 470 — click-to-expand in place, no popup, no separate "Show
// more" button: the whole box is the trigger, exactly as Brayden
// described it. `content` is optional (a sub-agent/front-runner with no
// matching RESULTS_CONTENT entry just never shows an expand affordance).
function ExpandableCard({ expanded, onToggle, content, className, children }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={content ? onToggle : undefined}
      onKeyDown={(e) => {
        if (!content) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
      className={clsx(
        'relative rounded-lg border border-line bg-surface transition-colors',
        content && 'cursor-pointer hover:border-accent/40',
        className
      )}
    >
      {children}
      {content && (
        <ChevronDown
          size={16}
          className={clsx(
            'pointer-events-none absolute right-4 top-4 text-fg-faint transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
      )}
      {content && expanded && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div>
            <p className="eyebrow !text-fg-faint">What it is</p>
            <p className="mt-1 font-sans text-sm leading-relaxed text-fg-secondary">{content.whatItIs}</p>
          </div>
          <div>
            <p className="eyebrow !text-fg-faint">What it does for their business</p>
            <p className="mt-1 font-sans text-sm leading-relaxed text-fg-secondary">{content.whatItDoes}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function ChoiceButtons({ options, value, onChange }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={clsx(
            'rounded-lg border px-4 py-3 text-left font-sans text-sm font-medium transition-colors',
            value === opt.value
              ? 'border-accent bg-accent text-white'
              : 'border-line bg-surface text-fg-primary hover:border-fg-primary/40'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Question({ label, children }) {
  return (
    <div>
      <p className="font-display text-lg font-medium leading-snug text-fg-primary">{label}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function TextField({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <Field label={label}>
      <input
        type={type}
        className={inputClass()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  )
}

// Prompt 469 — content sourced from the "Restorix Closer Survey" vault
// note. Stateless per Brayden's own call — no save, no lead association,
// opens fresh every time. The tool's job is qualification/talk-track
// support only, not pricing — actual setup fee/first month still get
// entered manually at close time in LogOutcomeModal (Prompt 468).
//
// Prompt 487 — the wizard itself is extracted into `SurveyBody` (no
// props, fully self-contained state, still stateless/fresh-every-mount
// per its original design) so the new combined Closer Overview lead
// modal can run the exact same survey for one specific lead without
// duplicating the question tree/branching logic. `Survey` (this file's
// default export, the standalone `/survey` nav page) is now a thin
// wrapper — unchanged behavior for that existing route.
// Prompt 546 — optional `onResults`: fired with computeSurveyResults(state)
// whenever the wizard is on the summary step, so CloserLeadModal's Client
// Portal tab can pre-fill its front-runner/sub-agent picks from the live
// recommendation. The standalone `/survey` page passes nothing and is
// unchanged.
// Prompt 551 — optional `niche` selects the content module. Defaults to
// behavioral_health so CloserLeadModal (which doesn't pass it) is unchanged;
// the standalone `/survey` page passes useBrand().niche so it follows the
// portal's brand (verifiable via the ?brand=bail_bonds preview override).
export function SurveyBody({ onResults, niche = 'behavioral_health' }) {
  const M = SURVEY_MODULES[niche] || surveyBH
  const { COPY, RESULTS_CONTENT } = M

  const [state, setState] = useState(() => M.initialSurveyState())
  const [stepKey, setStepKey] = useState('q0')
  const [expandedCards, setExpandedCards] = useState(() => new Set())

  const steps = useMemo(() => M.visibleSteps(state), [M, state])
  const currentIndex = steps.findIndex((s) => s.key === stepKey)
  const step = steps[currentIndex] ?? steps[0]

  function set(key) {
    return (value) => setState((s) => ({ ...s, [key]: value }))
  }

  function next() {
    const nextStep = steps[currentIndex + 1]
    if (nextStep) setStepKey(nextStep.key)
  }
  function back() {
    const prevStep = steps[currentIndex - 1]
    if (prevStep) setStepKey(prevStep.key)
  }
  function restart() {
    setState(M.initialSurveyState())
    setStepKey('q0')
    setExpandedCards(new Set())
  }
  function toggleCard(key) {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isSummary = step.key === 'summary'
  const results = isSummary ? M.computeSurveyResults(state) : null
  const advanceOk = M.canAdvance(step.key, state)

  useEffect(() => {
    if (isSummary && onResults) onResults(M.computeSurveyResults(state))
  }, [isSummary, state, onResults, M])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">{COPY.header.title}</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">{COPY.header.subtitle}</p>
        </div>
        <Button variant="ghost" onClick={restart}>
          <RotateCcw size={14} /> Start over
        </Button>
      </div>

      {!isSummary && (
        <p className="mt-6 eyebrow">
          Step {currentIndex + 1} of {steps.length - 1} — {step.title}
        </p>
      )}

      <div className="mt-4 rounded-card border border-line bg-elevated p-8">
        {step.key === 'q0' && (
          <Question label={COPY.q0.question}>
            <ChoiceButtons value={state.q0} onChange={set('q0')} options={COPY.q0.options} />
          </Question>
        )}

        {step.key === 'section1' && (
          <div className="space-y-8">
            <TextField
              label={COPY.section1.weeklyCallVolumeLabel}
              type="number"
              value={state.weeklyCallVolume}
              onChange={set('weeklyCallVolume')}
              placeholder={COPY.section1.weeklyCallVolumePlaceholder}
            />
            <Question label={COPY.section1.missedVolumeQuestion}>
              <ChoiceButtons
                value={state.missedVolume}
                onChange={set('missedVolume')}
                options={COPY.section1.missedVolumeOptions}
              />
            </Question>
            {state.missedVolume === 'some_a_lot' && (
              <>
                <Question label={COPY.section1.missedCallbackSpeedQuestion}>
                  <ChoiceButtons
                    value={state.missedCallbackSpeed}
                    onChange={set('missedCallbackSpeed')}
                    options={COPY.section1.missedCallbackSpeedOptions}
                  />
                </Question>
                {state.missedCallbackSpeed === 'sometimes_not_at_all' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label={COPY.section1.missedCallsPerWeekLabel}
                      type="number"
                      value={state.missedCallsPerWeek}
                      onChange={set('missedCallsPerWeek')}
                      placeholder={COPY.section1.missedCallsPerWeekPlaceholder}
                    />
                    <TextField
                      label={COPY.section1.responseTimeGapLabel}
                      value={state.responseTimeGap}
                      onChange={set('responseTimeGap')}
                      placeholder={COPY.section1.responseTimeGapPlaceholder}
                    />
                  </div>
                )}
                <TextField
                  label={COPY.section1.lostToCompetitorLabel}
                  value={state.lostToCompetitor}
                  onChange={set('lostToCompetitor')}
                  placeholder={COPY.section1.lostToCompetitorPlaceholder}
                />
              </>
            )}
          </div>
        )}

        {step.key === 'section2' && (
          <div className="space-y-8">
            {state.q0 === M.INTAKE_KEY && (
              <p className="rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-secondary">
                {COPY.section2.includedNote}
              </p>
            )}
            <Question label={COPY.section2.afterHoursQuestion}>
              <ChoiceButtons
                value={state.afterHours}
                onChange={set('afterHours')}
                options={COPY.section2.afterHoursOptions}
              />
            </Question>
            {state.afterHours === 'on_call_staff' && (
              <Question label={COPY.section2.onCallReachedQuestion}>
                <ChoiceButtons
                  value={state.onCallReachedQuickly}
                  onChange={set('onCallReachedQuickly')}
                  options={COPY.section2.onCallReachedOptions}
                />
              </Question>
            )}
          </div>
        )}

        {step.key === 'section3' && (
          <div className="space-y-8">
            <p className="rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-secondary">
              {COPY.section3.note}
            </p>
            <Question label={COPY.section3.checkQuestion}>
              <ChoiceButtons
                value={state.insuranceCheck}
                onChange={set('insuranceCheck')}
                options={COPY.section3.checkOptions}
              />
            </Question>
            {state.insuranceCheck === 'check_callback' && (
              <TextField
                label={COPY.section3.callbackTimeLabel}
                value={state.insuranceCallbackTime}
                onChange={set('insuranceCallbackTime')}
                placeholder={COPY.section3.callbackTimePlaceholder}
              />
            )}
          </div>
        )}

        {step.key === 'section4' && (
          <div className="space-y-8">
            <Question label={COPY.section4.followUpQuestion}>
              <ChoiceButtons
                value={state.followUp}
                onChange={set('followUp')}
                options={COPY.section4.followUpOptions}
              />
            </Question>
            {state.followUp === 'falls_through' && (
              <TextField
                label={COPY.section4.coldInquiriesLabel}
                type="number"
                value={state.monthlyColdInquiries}
                onChange={set('monthlyColdInquiries')}
                placeholder={COPY.section4.coldInquiriesPlaceholder}
              />
            )}
          </div>
        )}

        {step.key === 'section5' && (
          <div className="space-y-8">
            <Question label={COPY.section5.availabilityQuestion}>
              <ChoiceButtons
                value={state.bedAvailability}
                onChange={set('bedAvailability')}
                options={COPY.section5.availabilityOptions}
              />
            </Question>
            {state.bedAvailability === 'manual' && (
              <TextField
                label={COPY.section5.delayLabel}
                value={state.bedDelayLosesInquiry}
                onChange={set('bedDelayLosesInquiry')}
                placeholder={COPY.section5.delayPlaceholder}
              />
            )}
          </div>
        )}

        {step.key === 'section6' && (
          <div className="space-y-8">
            <Question label={COPY.section6.remindersQuestion}>
              <ChoiceButtons
                value={state.reminders}
                onChange={set('reminders')}
                options={COPY.section6.remindersOptions}
              />
            </Question>
            {state.reminders === 'hope_they_show' && (
              <TextField
                label={COPY.section6.rateLabel}
                value={state.noShowRate}
                onChange={set('noShowRate')}
                placeholder={COPY.section6.ratePlaceholder}
              />
            )}
          </div>
        )}

        {step.key === 'section7' && (
          <div className="space-y-8">
            <Question label={COPY.section7.trackingQuestion}>
              <ChoiceButtons
                value={state.referralTracking}
                onChange={set('referralTracking')}
                options={COPY.section7.trackingOptions}
              />
            </Question>
            {state.referralTracking === 'no_guess' && (
              <TextField
                label={COPY.section7.priorityLabel}
                value={state.referralPriority}
                onChange={set('referralPriority')}
                placeholder={COPY.section7.priorityPlaceholder}
              />
            )}
          </div>
        )}

        {isSummary && (
          <div className="space-y-8">
            <div>
              <p className="eyebrow">Front-runner</p>
              <ExpandableCard
                className="mt-2 px-6 py-5"
                content={results.frontRunnerKey ? RESULTS_CONTENT[results.frontRunnerKey] : null}
                expanded={expandedCards.has('front_runner')}
                onToggle={() => toggleCard('front_runner')}
              >
                <p className="pr-8 font-display text-2xl font-medium text-fg-primary">
                  {results.frontRunner || '—'}
                </p>
                {results.crisisRoutingIncluded && (
                  <p className="mt-1 font-sans text-sm text-fg-secondary">
                    {COPY.summary.frontRunnerIncludedNote}
                  </p>
                )}
                {results.missedCallStrongSignal && (
                  <p className="mt-1 font-sans text-sm text-success">
                    {COPY.summary.missedCallStrongSignalNote}
                  </p>
                )}
              </ExpandableCard>
            </div>

            <div>
              <p className="eyebrow">Sub-agents that scored a real fit</p>
              {results.subAgents.length === 0 ? (
                <p className="mt-2 font-sans text-sm text-fg-secondary">
                  No sub-agents scored a strong signal — this deal may be front-runner-only.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {results.subAgents.map((a) => (
                    <ExpandableCard
                      key={a.key}
                      className="px-4 py-3"
                      content={RESULTS_CONTENT[a.key]}
                      expanded={expandedCards.has(a.key)}
                      onToggle={() => toggleCard(a.key)}
                    >
                      <div className="flex items-center justify-between gap-3 pr-6 font-sans text-sm">
                        <span className="text-fg-primary">{a.label}</span>
                        {a.lowerPriority && (
                          <span className="eyebrow !text-fg-faint">Nice-to-have</span>
                        )}
                      </div>
                    </ExpandableCard>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="eyebrow">Captured pricing inputs</p>
              {results.pricingInputs.length === 0 ? (
                <p className="mt-2 font-sans text-sm text-fg-secondary">None captured this pass.</p>
              ) : (
                <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                  {results.pricingInputs.map((p) => (
                    <div key={p.label} className="rounded-lg border border-line bg-surface px-4 py-3">
                      <dt className="eyebrow !text-fg-faint">{p.label}</dt>
                      <dd className="mt-1 font-sans text-sm font-medium text-fg-primary">{p.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            <p className="font-sans text-xs text-fg-faint">
              Talk track and qualification only — the actual setup fee and first month get entered when you
              log this deal as Closed.
            </p>
          </div>
        )}
      </div>

      {!isSummary && (
        <div className="mt-4 flex justify-between">
          <Button variant="ghost" onClick={back} disabled={currentIndex === 0}>
            Back
          </Button>
          <Button onClick={next} disabled={!advanceOk}>
            {steps[currentIndex + 1]?.key === 'summary' ? 'See summary' : 'Next'}
          </Button>
        </div>
      )}

      {isSummary && (
        <div className="mt-4 flex justify-start">
          <Button variant="ghost" onClick={back}>
            Back
          </Button>
        </div>
      )}
    </div>
  )
}

export default function Survey() {
  const brand = useBrand()
  // key forces a clean remount (fresh state from the right module) if the
  // resolved niche changes mid-session, e.g. toggling the ?brand= override.
  return <SurveyBody key={brand.niche} niche={brand.niche} />
}
