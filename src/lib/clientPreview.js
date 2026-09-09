// Prompt 578 — sample data for the client CRM pages (Overview / Pipeline /
// Appointments / Reports). Shown ONLY to the seeded test account,
// identified server-side off the authenticated session email
// (`test_client@restorix.internal` — never a URL param, never
// client-editable). Every real client sees honest empty / "Coming soon"
// states instead.
//
// Ported from the old `MyAgent.jsx` PREVIEW object (Prompts 568–575) and
// reshaped to the CRM mockup (artifact 7b35a2e4). `AGENT_CATALOG` entries
// are all still `status: 'placeholder'` — nothing here claims an
// automation went live; this is a nav/IA/page-shape reframe only.

export const TEST_CLIENT_EMAIL = 'test_client@restorix.internal'

// `test_client` logs in as the username `test_client`, which useAuth maps
// to `<username>@restorix.internal`. This is the authenticated session
// email, so it can't be spoofed from the client.
export function isTestClient(session) {
  return session?.user?.email === TEST_CLIENT_EMAIL
}

// A client's purchased agents: front-runner first, then sub-agents, same
// order every page uses. Stale/empty values filtered out.
export function ownedAgents(deal) {
  if (!deal) return []
  return [deal.front_runner, ...(deal.sub_agents || [])].filter(Boolean)
}

export const FRONT_RUNNER_KEYS = ['intake_triage', 'missed_call_recovery']

// ── Overview ────────────────────────────────────────────────────────────

// Headline sentence (mockup): bounded, this-week framing.
export const PREVIEW_HEADLINE =
  'This week Restorix answered 24 calls and booked 9 consults — a 38% booking rate, up from 31% last week.'

// Stat tiles for the test account (mockup). The bed tile is only rendered
// when `bed_sync` is in the client's stack (see Overview.jsx).
export const PREVIEW_STATS = {
  activeProspects: '6',
  bookedThisWeek: '2',
  bookingRate: '38%',
  avgResponse: 'Instant',
  bedsOpen: '14',
  bedsTotal: '20',
}

// Same-day-only activity feed. Agent-name prefixes are already stripped —
// a client sees that a consult was booked, not which agent booked it.
export const PREVIEW_ACTIVITY = [
  { text: 'Priya Park booked a consult', time: '4m ago' },
  { text: "Marcus Webb's Aetna coverage confirmed", time: '21m ago' },
  { text: 'James Alvarez inquired, routed to admissions', time: '39m ago' },
  { text: 'Dana Feld replied, still deciding', time: '1h ago' },
]

// ── Pipeline (/prospects) ───────────────────────────────────────────────

// `status` keys into STATUS_TINT / STATUS_SOLID (StatusBadge.jsx) so pills
// reuse the app's existing status colours — no new colours:
//   appointment_booked → green   "Booked"
//   new                → blue    "Routed to staff"
//   not_interested     → red     "Escalated"
//   no_answer          → grey    "In progress"
// `timeline[].dot`: accent | success | faint.
export const PREVIEW_CONTACTS = [
  {
    id: 'priya-park',
    name: 'Priya Park',
    phone: '(415) 555-0182',
    status: 'appointment_booked',
    pill: 'Booked',
    time: '4m ago',
    insurance: 'Verified — Blue Cross, in network',
    followUp: 'None needed — consult booked',
    timeline: [
      { dot: 'accent', text: 'Answered instantly. Asked about residential treatment for her father.', time: '8:56 AM' },
      { dot: 'accent', text: 'Insurance confirmed live — Blue Cross, in network.', time: '8:57 AM' },
      { dot: 'success', text: 'Consult booked for tomorrow, 9:00 AM.', time: '9:01 AM' },
      { dot: 'faint', text: 'Confirmation text sent.', time: '9:02 AM' },
    ],
  },
  {
    id: 'marcus-webb',
    name: 'Marcus Webb',
    phone: '(415) 555-0143',
    status: 'new',
    pill: 'Routed to staff',
    time: '21m ago',
    insurance: 'Verified — Aetna, in network',
    followUp: 'Staff to call back today',
    timeline: [
      { dot: 'accent', text: 'Answered instantly. Asked about detox options.', time: '9:12 AM' },
      { dot: 'accent', text: 'Aetna coverage confirmed live, in network.', time: '9:14 AM' },
      { dot: 'faint', text: 'Routed to admissions — clinical question for a nurse.', time: '9:15 AM' },
    ],
  },
  {
    id: 'james-alvarez',
    name: 'James Alvarez',
    phone: '(628) 555-0117',
    status: 'new',
    pill: 'Routed to staff',
    time: '39m ago',
    insurance: 'Not yet checked',
    followUp: 'Staff to follow up',
    timeline: [
      { dot: 'accent', text: 'Family called asking about detox for an adult son.', time: '8:40 AM' },
      { dot: 'faint', text: 'Routed to admissions.', time: '8:44 AM' },
    ],
  },
  {
    id: 'dana-feld',
    name: 'Dana Feld',
    phone: '(510) 555-0169',
    status: 'no_answer',
    pill: 'In progress',
    time: '1h ago',
    attention: 'callback',
    attentionReason: 'Asked for a callback — not yet returned',
    insurance: 'Out-of-network benefits only — staff to confirm rate',
    followUp: 'Nurture sequence — day 1 of 4',
    timeline: [
      { dot: 'accent', text: 'Answered instantly. Comparing a few facilities.', time: '8:05 AM' },
      { dot: 'faint', text: 'Follow-up sequence started.', time: '8:09 AM' },
      { dot: 'faint', text: 'Replied — still deciding, wants to talk to her spouse.', time: '11:20 AM' },
    ],
  },
  {
    id: 'sarah-kim',
    name: 'Sarah Kim',
    phone: '(925) 555-0134',
    status: 'not_interested',
    pill: 'Escalated',
    time: '2h ago',
    attention: 'urgent',
    attentionReason: 'Crisis language detected after hours — clinician paged, confirm follow-up',
    insurance: 'Not checked — call escalated',
    followUp: 'On hold — clinician follow-up first',
    timeline: [
      { dot: 'accent', text: 'After-hours call. Crisis language detected in the first minute.', time: '11:48 PM' },
      { dot: 'faint', text: 'Handed to a live on-call clinician immediately.', time: '11:49 PM' },
      { dot: 'faint', text: 'Clinician paged for follow-up this morning.', time: '7:30 AM' },
    ],
  },
  {
    id: 'robert-nunez',
    name: 'Robert Nunez',
    phone: '(707) 555-0150',
    status: 'no_answer',
    pill: 'In progress',
    time: '3h ago',
    insurance: 'Verified — Cigna, in network',
    followUp: 'Nurture sequence — day 2 of 4',
    timeline: [
      { dot: 'accent', text: 'Answered instantly. Gathering information for a family member.', time: '6:40 AM' },
      { dot: 'accent', text: 'Cigna coverage confirmed live, in network.', time: '6:43 AM' },
      { dot: 'faint', text: 'Follow-up sequence started.', time: '6:45 AM' },
    ],
  },
]

// "Needs your attention" (Overview) is derived from the contacts that
// carry an `attention` flag — urgent (red dot) or callback (amber dot).
export const PREVIEW_ATTENTION = PREVIEW_CONTACTS.filter((c) => c.attention)

// ── Appointments (/appointments) ────────────────────────────────────────

// The facility's own patient/consult appointments — a data model that
// doesn't exist in the schema yet (downstream of intake_triage /
// missed_call_recovery + the `reminders` sub-agent, all placeholder). So
// this is test-account-only sample content, and it lives on "today"
// (`daysAgo: 0`); every other browsed day renders the honest empty state.
//   pill status: appointment_booked → "Confirmed", new → "Reminder sent",
//   no_answer → "Not yet confirmed".
export const PREVIEW_APPOINTMENTS = [
  { id: 'priya-park', name: 'Priya Park', detail: '9:00 AM consult · phone intake', status: 'appointment_booked', pill: 'Confirmed', daysAgo: 0 },
  { id: 'marcus-webb', name: 'Marcus Webb', detail: '11:30 AM consult · phone intake', status: 'new', pill: 'Reminder sent', daysAgo: 0 },
  { id: 'dana-feld', name: 'Dana Feld', detail: '2:00 PM consult · phone intake', status: 'no_answer', pill: 'Not yet confirmed', daysAgo: 0 },
]

// Initials for the round avatar chips (mockup).
export function initials(name) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
