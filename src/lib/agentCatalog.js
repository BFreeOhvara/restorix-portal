// Prompt 546 — the shared component catalog (Brayden's "build each agent
// once" model). Every front-runner and sub-agent Restorix can sell is one
// entry here; a client's dashboard is this catalog filtered to what their
// own deal actually bought (`deals.front_runner` + `deals.sub_agents`).
//
// `status` flips to 'live' per entry as each module is really built —
// until then a purchased agent shows up as an honest "Coming soon" state
// on the CRM pages, never as a live claim. "Incremental" per North Star
// means this catalog grows one 'live' entry at a time, not that each
// client's dashboard is built out separately.
//
// Prompt 578 — the per-agent sidebar tabs (Prompt 565/567's `navLabel` /
// `navCategory` / `navIcon`) are gone. The client portal is a fixed
// CRM-shaped app now (Overview / Pipeline / Appointments / Reports /
// Settings); a purchased agent shows up as data on those pages, not as
// its own tab. Only `kind` / `label` / `status` / `needsConnect` remain.
//
// Client-facing copy is NOT duplicated here — it's pulled from
// RESULTS_CONTENT in survey.js, keyed identically to these keys, so the
// Closer Survey and the client dashboard can never drift.
//
// Prompt 610 — every entry also carries `price: { setupFee, monthlyFee }`
// so a closer's agent picks can compute a suggested deal price instead of
// being typed in from nothing. THESE ARE PLACEHOLDER NUMBERS, not
// Brayden's real pricing — front-runners priced higher than sub-agents
// since they're the core product, but flag clearly for Brayden to tune
// once he sees them live against real deals.

import { RESULTS_CONTENT } from './survey'

export const FRONT_RUNNER_KEYS = ['intake_triage', 'missed_call_recovery']
export const SUB_AGENT_KEYS = ['insurance', 'follow_up', 'bed_sync', 'reminders', 'referral_reporting']

export const AGENT_CATALOG = {
  intake_triage: {
    kind: 'front_runner',
    label: 'Inbound Intake & Triage',
    status: 'placeholder', // 'placeholder' | 'live'
    needsConnect: ['phone_number'],
    price: { setupFee: 297, monthlyFee: 599 },
  },
  missed_call_recovery: {
    kind: 'front_runner',
    label: 'Missed-Call Recovery',
    status: 'placeholder',
    needsConnect: ['phone_number'],
    price: { setupFee: 297, monthlyFee: 549 },
  },
  insurance: {
    kind: 'sub_agent',
    label: 'Insurance / payer verification',
    status: 'placeholder',
    needsConnect: [],
    price: { setupFee: 0, monthlyFee: 199 },
  },
  follow_up: {
    kind: 'sub_agent',
    label: 'Follow-up & nurture',
    status: 'placeholder',
    needsConnect: [],
    price: { setupFee: 0, monthlyFee: 149 },
  },
  bed_sync: {
    kind: 'sub_agent',
    label: 'Bed/program availability sync',
    status: 'placeholder',
    needsConnect: [],
    price: { setupFee: 0, monthlyFee: 179 },
  },
  reminders: {
    kind: 'sub_agent',
    label: 'Appointment Reminder & No-Show Prevention',
    status: 'placeholder',
    needsConnect: [],
    price: { setupFee: 0, monthlyFee: 129 },
  },
  referral_reporting: {
    kind: 'sub_agent',
    label: 'Referral-source reporting',
    status: 'placeholder',
    needsConnect: [],
    price: { setupFee: 0, monthlyFee: 149 },
  },
}

// Prompt 610 — sums a front-runner + its selected sub-agents into one
// suggested price. Safe to call with an empty/unknown front-runner key
// (returns zeros) so callers can compute this before a pick is made.
export function priceForSelection(frontRunnerKey, subAgentKeys = []) {
  const front = AGENT_CATALOG[frontRunnerKey]?.price
  const total = { setupFee: front?.setupFee ?? 0, monthlyFee: front?.monthlyFee ?? 0 }
  for (const key of subAgentKeys) {
    const price = AGENT_CATALOG[key]?.price
    if (!price) continue
    total.setupFee += price.setupFee
    total.monthlyFee += price.monthlyFee
  }
  return total
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
