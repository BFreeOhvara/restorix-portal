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

// Prompt 551 — the two q0 outcomes, named so Survey.jsx's shared branching
// code doesn't hardcode a niche-specific key (surveySuretix.js uses
// 'intake_dispatch' for the intake path; the missed-call key is the same).
export const INTAKE_KEY = 'intake_triage'
export const MISSED_CALL_KEY = 'missed_call_recovery'

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

// Prompt 551 — every niche-specific string the wizard renders lives here
// (was hardcoded in Survey.jsx). `surveySuretix.js` exports a COPY object of
// the same shape; Survey.jsx renders from whichever module useBrand() picks,
// so the branching/state-machine JSX stays a single shared implementation.
export const COPY = {
  header: {
    title: 'Closer Survey',
    subtitle: 'Stack qualification — talk track for a live call, nothing saved.',
  },
  q0: {
    question:
      "If we could have AI answer every single inquiry call live, 24/7, book-capable — is that something you'd want, or would you rather keep your own staff answering live and have AI catch what they miss?",
    options: [
      { value: 'intake_triage', label: "We'd want AI answering live" },
      { value: 'missed_call_recovery', label: "We'd rather keep our staff primary" },
    ],
  },
  section1: {
    weeklyCallVolumeLabel: 'About how many admission inquiry calls does your front desk get in a typical week?',
    weeklyCallVolumePlaceholder: 'e.g. 40',
    missedVolumeQuestion: "Of those, roughly how many go unanswered — after hours, line's busy, weekends?",
    missedVolumeOptions: [
      { value: 'hardly_any', label: 'Hardly any, we catch almost everything' },
      { value: 'some_a_lot', label: 'Some / a lot' },
    ],
    missedCallbackSpeedQuestion: 'What happens to those calls right now — does anyone call them back, and how fast?',
    missedCallbackSpeedOptions: [
      { value: 'within_hour', label: "We're usually back to them within the hour" },
      { value: 'sometimes_not_at_all', label: 'Sometimes next day, sometimes not at all' },
    ],
    missedCallsPerWeekLabel: 'Missed calls per week',
    missedCallsPerWeekPlaceholder: 'If they know',
    responseTimeGapLabel: 'Response-time gap',
    responseTimeGapPlaceholder: 'e.g. next day, 3+ days',
    lostToCompetitorLabel:
      'Any sense of how many of those missed calls end up going to another facility instead?',
    lostToCompetitorPlaceholder: "They may not know — that's fine",
  },
  section2: {
    includedNote:
      'Crisis-language routing is already included with Intake & Triage — this just confirms the gap it closes, not something to qualify separately.',
    afterHoursQuestion: 'Is anyone answering calls after hours or weekends right now?',
    afterHoursOptions: [
      { value: 'voicemail', label: 'No, goes to voicemail' },
      { value: 'on_call_staff', label: 'Yes, on-call staff' },
    ],
    onCallReachedQuestion: 'How often does that on-call person actually get reached quickly?',
    onCallReachedOptions: [
      { value: 'yes', label: 'Reliably, most of the time' },
      { value: 'no', label: 'Slow / unreliable' },
    ],
  },
  section3: {
    note:
      'Intake & Triage already includes a quick conversational pre-screen ("what insurance do you have?"). This qualifies for the deeper add-on — a real-time eligibility/benefits check with the actual payer.',
    checkQuestion:
      'When someone calls asking if you take their insurance, how does that get answered — on the spot, or do you have to check and call back?',
    checkOptions: [
      { value: 'on_the_spot', label: 'On the spot, we have someone dedicated' },
      { value: 'check_callback', label: 'We usually have to check and call back' },
    ],
    callbackTimeLabel: 'How long does that callback usually take?',
    callbackTimePlaceholder: 'Minutes, hours, days…',
  },
  section4: {
    followUpQuestion: "For people who call but don't book same-day, what's the process for following up with them?",
    followUpOptions: [
      { value: 'real_process', label: 'We have a real nurture process, we stay on it' },
      { value: 'falls_through', label: 'Not really, it kind of falls through the cracks' },
    ],
    coldInquiriesLabel: "Any rough sense of how many inquiries a month don't convert same-day?",
    coldInquiriesPlaceholder: 'If they know',
  },
  section5: {
    availabilityQuestion:
      "When intake is checking whether there's an open bed or program slot, is that instant, or does someone have to check with clinical/ops first?",
    availabilityOptions: [
      { value: 'instant', label: 'Instant, we already have that automated' },
      { value: 'manual', label: 'Manual, has to check' },
    ],
    delayLabel: 'How often does that delay end up losing the inquiry?',
    delayPlaceholder: 'e.g. sometimes, rarely, often',
  },
  section6: {
    remindersQuestion:
      "Once someone's actually booked an intake appointment, what happens to make sure they show up — any reminders, confirmations?",
    remindersOptions: [
      { value: 'solid', label: 'Yes, we have a solid reminder process' },
      { value: 'hope_they_show', label: 'Not really, we just hope they show' },
    ],
    rateLabel: 'Any sense of your current no-show rate for booked intakes?',
    ratePlaceholder: 'e.g. 20%',
  },
  section7: {
    trackingQuestion:
      'Do you currently know which marketing channels or referral sources are actually turning into real admissions?',
    trackingOptions: [
      { value: 'yes_track', label: 'Yes, we track that well' },
      { value: 'no_guess', label: "No / not really, it's a guess" },
    ],
    priorityLabel: 'Is that something ownership/BD cares about, or is intake speed the bigger priority right now?',
    priorityPlaceholder: 'Gauges whether this is worth including',
  },
  summary: {
    frontRunnerIncludedNote: 'After-hours crisis-language routing included automatically — not a separate line item.',
    missedCallStrongSignalNote:
      'Strong signal for Missed-Call Recovery — missed calls often go a day or more without a callback.',
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
