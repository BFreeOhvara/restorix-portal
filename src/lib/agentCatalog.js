// Prompt 546 — the shared component catalog (Brayden's "build each agent
// once" model). Every front-runner and sub-agent Restorix can sell is one
// entry here; a client's dashboard is this catalog filtered to what their
// own deal actually bought (`deals.front_runner` + `deals.sub_agents`).
//
// `status` flips to 'live' per entry as each module is really built —
// until then a purchased agent still renders, as an honest "Coming soon"
// card, never hidden. "Incremental" per North Star means this catalog
// grows one 'live' entry at a time, not that each client's dashboard is
// built out separately.
//
// Client-facing copy is NOT duplicated here — it's pulled from
// RESULTS_CONTENT in survey.js, keyed identically to these keys, so the
// Closer Survey and the client dashboard can never drift.

import { RESULTS_CONTENT } from './survey'

export const FRONT_RUNNER_KEYS = ['intake_triage', 'missed_call_recovery']
export const SUB_AGENT_KEYS = ['insurance', 'follow_up', 'bed_sync', 'reminders', 'referral_reporting']

// `navLabel` (Prompt 565) — short, client-facing sidebar tab name, distinct
// from the fuller internal `label` (still used by RESULTS_CONTENT/survey and
// the Overview card headings). Sidebar-only; naming handed to Eagle per the
// prompt.
export const AGENT_CATALOG = {
  intake_triage: {
    kind: 'front_runner',
    label: 'Inbound Intake & Triage',
    navLabel: 'Intake & Triage',
    status: 'placeholder', // 'placeholder' | 'live'
    needsConnect: ['phone_number'],
  },
  missed_call_recovery: {
    kind: 'front_runner',
    label: 'Missed-Call Recovery',
    navLabel: 'Missed-Call Recovery',
    status: 'placeholder',
    needsConnect: ['phone_number'],
  },
  insurance: {
    kind: 'sub_agent',
    label: 'Insurance / payer verification',
    navLabel: 'Insurance Verification',
    status: 'placeholder',
    needsConnect: [],
  },
  follow_up: {
    kind: 'sub_agent',
    label: 'Follow-up & nurture',
    navLabel: 'Follow-Up',
    status: 'placeholder',
    needsConnect: [],
  },
  bed_sync: {
    kind: 'sub_agent',
    label: 'Bed/program availability sync',
    navLabel: 'Bed Availability',
    status: 'placeholder',
    needsConnect: [],
  },
  reminders: {
    kind: 'sub_agent',
    label: 'Appointment Reminder & No-Show Prevention',
    navLabel: 'Appointment Reminders',
    status: 'placeholder',
    needsConnect: [],
  },
  referral_reporting: {
    kind: 'sub_agent',
    label: 'Referral-source reporting',
    navLabel: 'Referral Reporting',
    status: 'placeholder',
    needsConnect: [],
  },
}

export const CONNECT_LABELS = {
  phone_number: 'phone number',
}

// Returns the catalog entry for a key merged with its client-facing copy,
// or null for an unknown key (defensive — a stale `deals.sub_agents` value
// that's no longer in the catalog just doesn't render rather than throwing).
export function catalogEntry(key) {
  const entry = AGENT_CATALOG[key]
  if (!entry) return null
  return { key, ...entry, copy: RESULTS_CONTENT[key] || null }
}
