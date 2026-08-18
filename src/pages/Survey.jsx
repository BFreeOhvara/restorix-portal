import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { RotateCcw, ChevronDown } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'
import { initialSurveyState, visibleSteps, canAdvance, computeSurveyResults, RESULTS_CONTENT } from '../lib/survey'

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
export default function Survey() {
  const [state, setState] = useState(initialSurveyState())
  const [stepKey, setStepKey] = useState('q0')
  const [expandedCards, setExpandedCards] = useState(() => new Set())

  const steps = useMemo(() => visibleSteps(state), [state])
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
    setState(initialSurveyState())
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
  const results = isSummary ? computeSurveyResults(state) : null
  const advanceOk = canAdvance(step.key, state)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">Closer Survey</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">
            Stack qualification — talk track for a live call, nothing saved.
          </p>
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
          <Question label="If we could have AI answer every single inquiry call live, 24/7, book-capable — is that something you'd want, or would you rather keep your own staff answering live and have AI catch what they miss?">
            <ChoiceButtons
              value={state.q0}
              onChange={set('q0')}
              options={[
                { value: 'intake_triage', label: "We'd want AI answering live" },
                { value: 'missed_call_recovery', label: "We'd rather keep our staff primary" },
              ]}
            />
          </Question>
        )}

        {step.key === 'section1' && (
          <div className="space-y-8">
            <TextField
              label="About how many admission inquiry calls does your front desk get in a typical week?"
              type="number"
              value={state.weeklyCallVolume}
              onChange={set('weeklyCallVolume')}
              placeholder="e.g. 40"
            />
            <Question label="Of those, roughly how many go unanswered — after hours, line's busy, weekends?">
              <ChoiceButtons
                value={state.missedVolume}
                onChange={set('missedVolume')}
                options={[
                  { value: 'hardly_any', label: 'Hardly any, we catch almost everything' },
                  { value: 'some_a_lot', label: 'Some / a lot' },
                ]}
              />
            </Question>
            {state.missedVolume === 'some_a_lot' && (
              <>
                <Question label="What happens to those calls right now — does anyone call them back, and how fast?">
                  <ChoiceButtons
                    value={state.missedCallbackSpeed}
                    onChange={set('missedCallbackSpeed')}
                    options={[
                      { value: 'within_hour', label: "We're usually back to them within the hour" },
                      { value: 'sometimes_not_at_all', label: 'Sometimes next day, sometimes not at all' },
                    ]}
                  />
                </Question>
                {state.missedCallbackSpeed === 'sometimes_not_at_all' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Missed calls per week"
                      type="number"
                      value={state.missedCallsPerWeek}
                      onChange={set('missedCallsPerWeek')}
                      placeholder="If they know"
                    />
                    <TextField
                      label="Response-time gap"
                      value={state.responseTimeGap}
                      onChange={set('responseTimeGap')}
                      placeholder="e.g. next day, 3+ days"
                    />
                  </div>
                )}
                <TextField
                  label="Any sense of how many of those missed calls end up going to another facility instead?"
                  value={state.lostToCompetitor}
                  onChange={set('lostToCompetitor')}
                  placeholder="They may not know — that's fine"
                />
              </>
            )}
          </div>
        )}

        {step.key === 'section2' && (
          <div className="space-y-8">
            {state.q0 === 'intake_triage' && (
              <p className="rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-secondary">
                Crisis-language routing is already included with Intake &amp; Triage — this just confirms the gap it closes, not something to qualify separately.
              </p>
            )}
            <Question label="Is anyone answering calls after hours or weekends right now?">
              <ChoiceButtons
                value={state.afterHours}
                onChange={set('afterHours')}
                options={[
                  { value: 'voicemail', label: 'No, goes to voicemail' },
                  { value: 'on_call_staff', label: 'Yes, on-call staff' },
                ]}
              />
            </Question>
            {state.afterHours === 'on_call_staff' && (
              <Question label="How often does that on-call person actually get reached quickly?">
                <ChoiceButtons
                  value={state.onCallReachedQuickly}
                  onChange={set('onCallReachedQuickly')}
                  options={[
                    { value: 'yes', label: 'Reliably, most of the time' },
                    { value: 'no', label: "Slow / unreliable" },
                  ]}
                />
              </Question>
            )}
          </div>
        )}

        {step.key === 'section3' && (
          <div className="space-y-8">
            <p className="rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-secondary">
              Intake &amp; Triage already includes a quick conversational pre-screen ("what insurance do you have?"). This qualifies for the deeper add-on — a real-time eligibility/benefits check with the actual payer.
            </p>
            <Question label="When someone calls asking if you take their insurance, how does that get answered — on the spot, or do you have to check and call back?">
              <ChoiceButtons
                value={state.insuranceCheck}
                onChange={set('insuranceCheck')}
                options={[
                  { value: 'on_the_spot', label: 'On the spot, we have someone dedicated' },
                  { value: 'check_callback', label: 'We usually have to check and call back' },
                ]}
              />
            </Question>
            {state.insuranceCheck === 'check_callback' && (
              <TextField
                label="How long does that callback usually take?"
                value={state.insuranceCallbackTime}
                onChange={set('insuranceCallbackTime')}
                placeholder="Minutes, hours, days…"
              />
            )}
          </div>
        )}

        {step.key === 'section4' && (
          <div className="space-y-8">
            <Question label="For people who call but don't book same-day, what's the process for following up with them?">
              <ChoiceButtons
                value={state.followUp}
                onChange={set('followUp')}
                options={[
                  { value: 'real_process', label: 'We have a real nurture process, we stay on it' },
                  { value: 'falls_through', label: 'Not really, it kind of falls through the cracks' },
                ]}
              />
            </Question>
            {state.followUp === 'falls_through' && (
              <TextField
                label="Any rough sense of how many inquiries a month don't convert same-day?"
                type="number"
                value={state.monthlyColdInquiries}
                onChange={set('monthlyColdInquiries')}
                placeholder="If they know"
              />
            )}
          </div>
        )}

        {step.key === 'section5' && (
          <div className="space-y-8">
            <Question label="When intake is checking whether there's an open bed or program slot, is that instant, or does someone have to check with clinical/ops first?">
              <ChoiceButtons
                value={state.bedAvailability}
                onChange={set('bedAvailability')}
                options={[
                  { value: 'instant', label: "Instant, we already have that automated" },
                  { value: 'manual', label: 'Manual, has to check' },
                ]}
              />
            </Question>
            {state.bedAvailability === 'manual' && (
              <TextField
                label="How often does that delay end up losing the inquiry?"
                value={state.bedDelayLosesInquiry}
                onChange={set('bedDelayLosesInquiry')}
                placeholder="e.g. sometimes, rarely, often"
              />
            )}
          </div>
        )}

        {step.key === 'section6' && (
          <div className="space-y-8">
            <Question label="Once someone's actually booked an intake appointment, what happens to make sure they show up — any reminders, confirmations?">
              <ChoiceButtons
                value={state.reminders}
                onChange={set('reminders')}
                options={[
                  { value: 'solid', label: 'Yes, we have a solid reminder process' },
                  { value: 'hope_they_show', label: 'Not really, we just hope they show' },
                ]}
              />
            </Question>
            {state.reminders === 'hope_they_show' && (
              <TextField
                label="Any sense of your current no-show rate for booked intakes?"
                value={state.noShowRate}
                onChange={set('noShowRate')}
                placeholder="e.g. 20%"
              />
            )}
          </div>
        )}

        {step.key === 'section7' && (
          <div className="space-y-8">
            <Question label="Do you currently know which marketing channels or referral sources are actually turning into real admissions?">
              <ChoiceButtons
                value={state.referralTracking}
                onChange={set('referralTracking')}
                options={[
                  { value: 'yes_track', label: 'Yes, we track that well' },
                  { value: 'no_guess', label: "No / not really, it's a guess" },
                ]}
              />
            </Question>
            {state.referralTracking === 'no_guess' && (
              <TextField
                label="Is that something ownership/BD cares about, or is intake speed the bigger priority right now?"
                value={state.referralPriority}
                onChange={set('referralPriority')}
                placeholder="Gauges whether this is worth including"
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
                    After-hours crisis-language routing included automatically — not a separate line item.
                  </p>
                )}
                {results.missedCallStrongSignal && (
                  <p className="mt-1 font-sans text-sm text-success">
                    Strong signal for Missed-Call Recovery — missed calls often go a day or more without a callback.
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
