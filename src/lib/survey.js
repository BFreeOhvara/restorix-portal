// Prompt 469 — adaptive Stack-qualification survey, content sourced
// directly from the "Restorix Closer Survey" vault note (Brayden's own
// question tree, not invented here). Stateless per Brayden's own call —
// this file is pure data/logic, no persistence.
//
// Q0 decides which front-runner applies (never both). Section 1 only
// applies on the Missed-Call Recovery path — everything else (2-7) is
// always asked, per the doc's own "always ask" language on each root
// question, regardless of which front-runner Q0 selected.

export const FRONT_RUNNERS = {
  intake_triage: 'Inbound Intake & Triage',
  missed_call_recovery: 'Missed-Call Recovery',
}

export function initialSurveyState() {
  return {
    q0: null,
    // Section 1 — missed calls (Missed-Call Recovery path only)
    weeklyCallVolume: '',
    missedVolume: null, // 'hardly_any' | 'some_a_lot'
    missedCallbackSpeed: null, // 'within_hour' | 'sometimes_not_at_all'
    missedCallsPerWeek: '',
    responseTimeGap: '',
    lostToCompetitor: '',
    // Section 2 — after-hours coverage
    afterHours: null, // 'voicemail' | 'on_call_staff'
    onCallReachedQuickly: null, // 'yes' | 'no'
    // Section 3 — insurance verification
    insuranceCheck: null, // 'on_the_spot' | 'check_callback'
    insuranceCallbackTime: '',
    // Section 4 — lead follow-through
    followUp: null, // 'real_process' | 'falls_through'
    monthlyColdInquiries: '',
    // Section 5 — bed/program availability
    bedAvailability: null, // 'instant' | 'manual'
    bedDelayLosesInquiry: '',
    // Section 6 — appointment follow-through
    reminders: null, // 'solid' | 'hope_they_show'
    noShowRate: '',
    // Section 7 — referral-source reporting
    referralTracking: null, // 'yes_track' | 'no_guess'
    referralPriority: '',
  }
}

// Ordered wizard steps. `showIf` filters Section 1 out entirely on the
// Intake & Triage path ("nothing will be missed, so missed-call recovery
// doesn't apply" — the doc's own words).
export const STEPS = [
  { key: 'q0', title: 'Automation readiness' },
  { key: 'section1', title: 'Missed calls', showIf: (s) => s.q0 === 'missed_call_recovery' },
  { key: 'section2', title: 'After-hours coverage' },
  { key: 'section3', title: 'Insurance verification' },
  { key: 'section4', title: 'Lead follow-through' },
  { key: 'section5', title: 'Bed/program availability' },
  { key: 'section6', title: 'Appointment follow-through' },
  { key: 'section7', title: 'Referral-source reporting' },
  { key: 'summary', title: 'Summary' },
]

export function visibleSteps(state) {
  return STEPS.filter((step) => !step.showIf || step.showIf(state))
}

// Whether the current step's root question(s) have been answered enough
// to advance — pricing-input free text/number fields stay optional
// throughout (per the doc's own "they may not know — that's fine" note),
// only the branching root answers are required.
export function canAdvance(stepKey, state) {
  switch (stepKey) {
    case 'q0':
      return !!state.q0
    case 'section1':
      if (!state.missedVolume) return false
      if (state.missedVolume === 'some_a_lot' && !state.missedCallbackSpeed) return false
      return true
    case 'section2':
      if (!state.afterHours) return false
      if (state.afterHours === 'on_call_staff' && !state.onCallReachedQuickly) return false
      return true
    case 'section3':
      return !!state.insuranceCheck
    case 'section4':
      return !!state.followUp
    case 'section5':
      return !!state.bedAvailability
    case 'section6':
      return !!state.reminders
    case 'section7':
      return !!state.referralTracking
    default:
      return true
  }
}

// Prompt 469's own "Output at the end" spec: single front-runner, whether
// crisis-routing applies (automatic on the Intake & Triage path, not a
// separate qualifying question), which sub-agents scored a real signal
// (strong-signal branches only, not "was asked about"), and every
// captured pricing input.
export function computeSurveyResults(state) {
  const frontRunner = state.q0 ? FRONT_RUNNERS[state.q0] : null

  const missedCallStrongSignal =
    state.q0 === 'missed_call_recovery' &&
    state.missedVolume === 'some_a_lot' &&
    state.missedCallbackSpeed === 'sometimes_not_at_all'

  const subAgents = [
    {
      key: 'insurance',
      label: 'Insurance / payer verification',
      fit: state.insuranceCheck === 'check_callback',
    },
    {
      key: 'follow_up',
      label: 'Follow-up & nurture',
      fit: state.followUp === 'falls_through',
    },
    {
      key: 'bed_sync',
      label: 'Bed/program availability sync',
      fit: state.bedAvailability === 'manual',
    },
    {
      key: 'reminders',
      label: 'Appointment Reminder & No-Show Prevention',
      fit: state.reminders === 'hope_they_show',
    },
    {
      key: 'referral_reporting',
      label: 'Referral-source reporting',
      fit: state.referralTracking === 'no_guess',
      // Doc's own framing: more nice-to-have than pain point, gauge via
      // Q7.1a rather than qualifying it as strongly as the others.
      lowerPriority: true,
    },
  ].filter((a) => a.fit)

  const pricingInputs = [
    { label: 'Weekly inquiry call volume', value: state.weeklyCallVolume },
    { label: 'Missed calls per week', value: state.missedCallsPerWeek },
    { label: 'Response-time gap on missed calls', value: state.responseTimeGap },
    { label: 'Insurance callback time', value: state.insuranceCallbackTime },
    { label: 'Monthly inquiries that go cold', value: state.monthlyColdInquiries },
    { label: 'Current no-show rate', value: state.noShowRate },
  ].filter((p) => p.value !== '' && p.value != null)

  return {
    frontRunner,
    crisisRoutingIncluded: state.q0 === 'intake_triage',
    missedCallStrongSignal,
    subAgents,
    pricingInputs,
  }
}
