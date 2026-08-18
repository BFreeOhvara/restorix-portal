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

// Prompt 470 — results-screen copy, pulled verbatim from the "Restorix
// Closer Survey" vault note's own "Content for the results screen"
// section rather than summarized/rewritten here. Keyed to match
// `state.q0` (front-runners) and each sub-agent's own `key` in
// computeSurveyResults below, so the UI can look this up directly.
export const RESULTS_CONTENT = {
  intake_triage: {
    whatItIs:
      "An AI agent that answers every call, form, and text the moment it comes in — 24/7, no wait, no voicemail. It talks to the caller like a real intake coordinator would: asks what's going on, does a quick level-of-care read and insurance pre-screen, and either books the consult directly or routes them to a live person. After-hours crisis-language detection is built in automatically — if the conversation shows real risk language, it immediately hands off to a live human or on-call clinician instead of continuing on autopilot.",
    whatItDoes:
      'Most admission inquiries come in by phone, and centers that respond within 5 minutes convert 9 to 21 times more often than ones that take 30+ minutes to call back — most facilities are losing beds they already paid to fill just because someone couldn\'t pick up in time. This closes that gap completely: nothing goes to voicemail, nothing waits until morning, and the facility stops needing to staff around the clock just to catch every inquiry.',
  },
  missed_call_recovery: {
    whatItIs:
      "A lighter safety net for a facility that wants to keep its own staff answering calls live, but doesn't want anything missed to just disappear. The moment a call goes unanswered — after hours, line's busy, a slow morning — it automatically fires off a text and a callback within minutes, no human has to remember to do it.",
    whatItDoes:
      'Their staff stays the primary point of contact, nothing changes about how they operate day to day — but every call that used to just vanish into a missed-call log now gets a real shot at coming back. Given how much faster response speed drives conversion, this alone recovers admissions that were previously lost the moment the phone rang out.',
  },
  insurance: {
    whatItIs:
      'A real-time eligibility and benefits check with the actual payer, not just asking "what insurance do you have" — coverage gets confirmed while the person\'s still engaged, instead of someone having to call back later.',
    whatItDoes:
      "Payer-status uncertainty is one of the most common points an inquiry goes cold — someone calls, gets told \"we'll check and call you back,\" and by the time anyone does, they've already called somewhere else. Verifying it live keeps the conversation moving instead of creating a gap for them to lose interest.",
  },
  follow_up: {
    whatItIs:
      "An automated sequence that keeps reaching out to anyone who called in but didn't book the same day — texts, emails, calls, spaced out over the following days.",
    whatItDoes:
      "Decisions to enter treatment often aren't made on the first call, especially when it's a worried family member calling instead of the patient. Without a real process, those inquiries just fall through the cracks. This keeps every one of them warm until they actually book, without relying on staff remembering to circle back.",
  },
  bed_sync: {
    whatItIs:
      "Keeps the AI's view of open beds and program slots in sync with what's actually available, so intake isn't promising something that isn't there or making someone wait while staff manually checks with clinical/ops.",
    whatItDoes:
      "A delay here is a common reason an inquiry gets lost — by the time someone gets back to the caller with an answer, they've already called another facility. Instant, accurate availability keeps the booking moving in the same conversation instead of creating a hold-and-lose moment.",
  },
  reminders: {
    whatItIs:
      "Automated reminders in the lead-up to a booked intake appointment, with re-engagement if the person doesn't confirm they're still coming.",
    whatItDoes:
      "A booked appointment is only worth what actually walks through the door — no-shows are a well-known leak point in this industry, and most facilities don't have a real reminder process in place. This closes that gap without adding staff workload.",
  },
  referral_reporting: {
    whatItIs:
      'Tracking that shows which marketing channels or referral sources are actually turning into real admissions, not just inquiries.',
    whatItDoes:
      "Most facilities are guessing which channels are worth the spend. This gives ownership/BD a clear, accurate picture of what's actually working, so marketing dollars go toward what's proven instead of what feels like it's working.",
  },
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
    frontRunnerKey: state.q0,
    crisisRoutingIncluded: state.q0 === 'intake_triage',
    missedCallStrongSignal,
    subAgents,
    pricingInputs,
  }
}
