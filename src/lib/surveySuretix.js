// Prompt 551 — Suretix (surety / bail bond agencies) variant of the closer
// Stack-qualification survey. Content sourced verbatim from the "Suretix
// Closer Survey" vault note (Brayden's own question tree, rebuilt for surety
// bonds — not a find-and-replace of the behavioral-health version).
//
// Mirrors `survey.js`'s exact export shape so Survey.jsx can render either
// module interchangeably based on useBrand()'s resolved niche. The wizard's
// state field names are kept identical to survey.js on purpose — only the
// displayed copy, the Stack keys, and the scoring differ, so the branching
// JSX in Survey.jsx stays a single shared implementation.
//
// Q0 decides the single front-runner (never both). Section 1 only applies on
// the Missed-Call Recovery path; sections 2–7 are always asked.
//
// Deliberately NOT mirrored 1:1: Section 6 (court-date & check-in compliance)
// is a genuine rebuild of behavioral health's appointment-reminder section —
// a skipped court date is a forfeited bond, a materially bigger risk than a
// no-show, so its question and results copy are their own thing.

export const FRONT_RUNNERS = {
  intake_dispatch: 'Inbound Intake & Dispatch',
  missed_call_recovery: 'Missed-Call Recovery',
}

// The two q0 outcomes, named so Survey.jsx's shared branching code stays
// niche-agnostic (survey.js's intake path is 'intake_triage').
export const INTAKE_KEY = 'intake_dispatch'
export const MISSED_CALL_KEY = 'missed_call_recovery'

// Results-screen copy, pulled verbatim from the "Suretix Closer Survey" vault
// note's "Content for the results screen" section. Keyed to match `state.q0`
// (front-runners) and each sub-agent's own `key` in computeSurveyResults.
export const RESULTS_CONTENT = {
  intake_dispatch: {
    whatItIs:
      "An AI agent that answers every call the moment it comes in — 24/7, no wait, no voicemail. It talks to the caller like a real dispatcher would: gets the charge, the jail or county, the bond amount, and what collateral or co-signer they have, then either dispatches an agent directly or routes them to a live person. Careful handling of a scared or upset caller is built in automatically — if the conversation shows real distress, it immediately hands off to a live person instead of continuing on autopilot.",
    whatItDoes:
      "Almost every bail inquiry starts as a phone call, often in the middle of the night, often from someone who's never done this before — and the agency that answers first is usually the one that gets the bond. This closes that gap completely: nothing goes to voicemail, nothing waits until morning, and the agency stops needing someone physically by the phone around the clock just to catch every call.",
  },
  missed_call_recovery: {
    whatItIs:
      "A lighter safety net for an agency that wants to keep its own staff answering calls live, but doesn't want anything missed to just disappear. The moment a call goes unanswered — after hours, line's busy, mid-transport — it automatically fires off a text and a callback within minutes, no one has to remember to do it.",
    whatItDoes:
      'Staff stays the primary point of contact, nothing changes about how the agency operates day to day — but every call that used to just vanish into a missed-call log now gets a real shot at coming back before it goes to the next bondsman.',
  },
  collateral_verification: {
    whatItIs:
      "Real-time verification of collateral documentation and co-signer/indemnitor eligibility, not just asking the question — confirmed while the caller's still engaged, instead of someone having to call back later.",
    whatItDoes:
      'Collateral and co-signer uncertainty is one of the most common points a bail inquiry goes cold — someone calls, gets told "we\'ll check and call you back," and by the time anyone does, they\'ve already called the next name on the list. Verifying it live keeps the conversation moving instead of creating a gap for them to lose interest.',
  },
  follow_up: {
    whatItIs:
      "An automated sequence that keeps reaching out to anyone who called in but didn't commit to a bondsman the same call — texts, calls, spaced out over the following hours and days.",
    whatItDoes:
      "Family members calling around often aren't deciding on the first call — they're comparing a few bondsmen, or waiting on more information from the jail. Without a real process, those inquiries just fall through the cracks. This keeps every one of them warm until they actually decide, without relying on staff remembering to circle back.",
  },
  jail_sync: {
    whatItIs:
      "Keeps the AI's view of which jails and counties the agency actually covers in sync with reality, so it's never promising a dispatch somewhere the agency can't actually go, or making someone wait while staff manually checks.",
    whatItDoes:
      'A delay here is a common reason an inquiry gets lost — by the time someone gets back to the caller with an answer, they\'ve already called someone else. Instant, accurate coverage keeps the call moving toward a dispatched agent instead of creating a hold-and-lose moment.',
  },
  court_compliance: {
    whatItIs:
      "Automated reminders in the lead-up to every court date, plus tracking for any required check-ins while someone's out on bond — with re-engagement if a check-in gets missed.",
    whatItDoes:
      "A defendant skipping court isn't just a missed appointment — it's a forfeited bond, real money the agency is on the hook for. Most agencies don't have a real reminder or check-in process in place today. This closes that gap without adding staff workload, and catches skip risk early instead of finding out the hard way on the court date.",
  },
  referral_reporting: {
    whatItIs:
      'Tracking that shows which channels — attorney referrals, past clients, online search — are actually turning into bonds written, not just inquiries.',
    whatItDoes:
      "Most agencies are guessing which channels are worth the spend. This gives ownership a clear, accurate picture of what's actually working, so marketing dollars go toward what's proven instead of what feels like it's working.",
  },
}

// Every niche-specific string the wizard renders — same shape as survey.js's
// COPY. Verbatim from the "Suretix Closer Survey" vault note's question tree.
export const COPY = {
  header: {
    title: 'Closer Survey',
    subtitle: 'Stack qualification — talk track for a live call, nothing saved.',
  },
  q0: {
    question:
      "If we could have AI answer every single bail inquiry call live, 24/7, dispatch-capable — is that something you'd want, or would you rather keep your own staff answering live and have AI catch what they miss?",
    options: [
      { value: 'intake_dispatch', label: "We'd want AI answering live" },
      { value: 'missed_call_recovery', label: "We'd rather keep our staff primary" },
    ],
  },
  section1: {
    weeklyCallVolumeLabel: 'About how many bail inquiry calls does your agency get in a typical week?',
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
      'Any sense of how many of those missed calls end up going to another bondsman instead?',
    lostToCompetitorPlaceholder: "They may not know — that's fine",
  },
  section2: {
    includedNote:
      'High-emotion-caller handling is already included with Intake & Dispatch — this just confirms the after-hours gap it closes, not something to qualify separately.',
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
      'On the Intake & Dispatch path, callers already get a quick conversational pre-screen built in. This qualifies for the deeper add-on — real-time verification of collateral documentation and co-signer eligibility, not just asking the question.',
    checkQuestion:
      "When someone calls asking what collateral or co-signer they'll need to post bond, how does that get answered — on the spot, or do you have to check and call back?",
    checkOptions: [
      { value: 'on_the_spot', label: 'On the spot, we have someone dedicated' },
      { value: 'check_callback', label: 'We usually have to check and call back' },
    ],
    callbackTimeLabel: 'How long does that callback usually take?',
    callbackTimePlaceholder: 'Minutes, hours, days…',
  },
  section4: {
    followUpQuestion:
      "For people who call but don't commit to a bondsman same-call, what's the process for following up with them?",
    followUpOptions: [
      { value: 'real_process', label: 'We have a real follow-up process, we stay on it' },
      { value: 'falls_through', label: 'Not really, it kind of falls through the cracks' },
    ],
    coldInquiriesLabel: "Any rough sense of how many inquiries a week don't convert same-call?",
    coldInquiriesPlaceholder: 'If they know',
  },
  section5: {
    availabilityQuestion:
      "When someone's checking whether you can post bond at a specific jail or county, is that instant, or does someone have to check first?",
    availabilityOptions: [
      { value: 'instant', label: 'Instant, we already know our coverage cold' },
      { value: 'manual', label: 'Manual, has to check' },
    ],
    delayLabel:
      "How often does that delay end up losing the inquiry — they've already called somewhere else by the time you get back to them?",
    delayPlaceholder: 'e.g. sometimes, rarely, often',
  },
  section6: {
    remindersQuestion:
      "Once someone's out on bond, what happens to make sure they show up to court and complete any required check-ins?",
    remindersOptions: [
      { value: 'solid', label: 'Yes, we have a solid reminder/check-in process' },
      { value: 'hope_they_show', label: 'Not really, we just hope they show' },
    ],
    rateLabel: 'Any sense of your current skip or forfeiture rate?',
    ratePlaceholder: 'e.g. 5%',
  },
  section7: {
    trackingQuestion:
      'Do you currently know which channels — attorneys, past clients, online search — are actually turning into bonds written?',
    trackingOptions: [
      { value: 'yes_track', label: 'Yes, we track that well' },
      { value: 'no_guess', label: "No / not really, it's a guess" },
    ],
    priorityLabel: 'Is that something ownership cares about, or is call speed the bigger priority right now?',
    priorityPlaceholder: 'Gauges whether this is worth including',
  },
  summary: {
    frontRunnerIncludedNote:
      'High-emotion-caller handling included automatically with Intake & Dispatch — not a separate line item.',
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
    // Section 3 — collateral & co-signer verification
    insuranceCheck: null, // 'on_the_spot' | 'check_callback'
    insuranceCallbackTime: '',
    // Section 4 — lead follow-through
    followUp: null, // 'real_process' | 'falls_through'
    monthlyColdInquiries: '',
    // Section 5 — jail & jurisdiction coverage
    bedAvailability: null, // 'instant' | 'manual'
    bedDelayLosesInquiry: '',
    // Section 6 — court-date & check-in compliance
    reminders: null, // 'solid' | 'hope_they_show'
    noShowRate: '',
    // Section 7 — referral-source reporting
    referralTracking: null, // 'yes_track' | 'no_guess'
    referralPriority: '',
  }
}

// Section 1 is filtered out entirely on the Intake & Dispatch path (nothing
// gets missed there, so missed-call recovery doesn't apply) — mirrors
// survey.js's showIf. The "keep staff primary" q0 value is still
// 'missed_call_recovery', unchanged from the behavioral-health module.
export const STEPS = [
  { key: 'q0', title: 'Automation readiness' },
  { key: 'section1', title: 'Missed calls', showIf: (s) => s.q0 === 'missed_call_recovery' },
  { key: 'section2', title: 'After-hours coverage' },
  { key: 'section3', title: 'Collateral & co-signer' },
  { key: 'section4', title: 'Lead follow-through' },
  { key: 'section5', title: 'Jail & jurisdiction coverage' },
  { key: 'section6', title: 'Court-date & check-in compliance' },
  { key: 'section7', title: 'Referral-source reporting' },
  { key: 'summary', title: 'Summary' },
]

export function visibleSteps(state) {
  return STEPS.filter((step) => !step.showIf || step.showIf(state))
}

// Only the branching root answers gate advancing — pricing-input free
// text/number fields stay optional throughout. Identical to survey.js.
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

// "Output at the end" per the Suretix vault note: single front-runner,
// whether high-emotion-caller handling applies (automatic on the Intake &
// Dispatch path, not a separate qualifying question — carried as
// `crisisRoutingIncluded` so Survey.jsx's shared summary code stays generic),
// which sub-agents scored a real signal (strong-signal branches only), and
// every captured pricing input.
export function computeSurveyResults(state) {
  const frontRunner = state.q0 ? FRONT_RUNNERS[state.q0] : null

  const missedCallStrongSignal =
    state.q0 === 'missed_call_recovery' &&
    state.missedVolume === 'some_a_lot' &&
    state.missedCallbackSpeed === 'sometimes_not_at_all'

  const subAgents = [
    {
      key: 'collateral_verification',
      label: 'Collateral & co-signer verification',
      fit: state.insuranceCheck === 'check_callback',
    },
    {
      key: 'follow_up',
      label: 'Follow-up & nurture',
      fit: state.followUp === 'falls_through',
    },
    {
      key: 'jail_sync',
      label: 'Jail & jurisdiction coverage sync',
      fit: state.bedAvailability === 'manual',
    },
    {
      key: 'court_compliance',
      label: 'Court-date & check-in compliance',
      fit: state.reminders === 'hope_they_show',
    },
    {
      key: 'referral_reporting',
      label: 'Referral-source reporting',
      fit: state.referralTracking === 'no_guess',
      // Vault note's own framing: more nice-to-have than pain point.
      lowerPriority: true,
    },
  ].filter((a) => a.fit)

  const pricingInputs = [
    { label: 'Weekly bail inquiry call volume', value: state.weeklyCallVolume },
    { label: 'Missed calls per week', value: state.missedCallsPerWeek },
    { label: 'Response-time gap on missed calls', value: state.responseTimeGap },
    { label: 'Collateral / co-signer callback time', value: state.insuranceCallbackTime },
    { label: "Weekly inquiries that don't convert same-call", value: state.monthlyColdInquiries },
    { label: 'Current skip / forfeiture rate', value: state.noShowRate },
  ].filter((p) => p.value !== '' && p.value != null)

  return {
    frontRunner,
    frontRunnerKey: state.q0,
    crisisRoutingIncluded: state.q0 === 'intake_dispatch',
    missedCallStrongSignal,
    subAgents,
    pricingInputs,
  }
}
