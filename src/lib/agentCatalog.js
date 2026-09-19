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
// Prompt 612 — deal pricing is fully computed and locked: a deal's price is
// derived entirely from the Closer Survey's Stack (front-runner + sub-agents),
// never typed in. `price.setupFee` is no longer stored per entry — only
// `price.monthlyFee` is real per-agent data; the setup fee is always
// SETUP_FEE_PERCENT of the computed monthly total, then both figures are
// charm-rounded to a $X99 price via charm99(). Both front-runners share the
// same $999/mo base per Brayden's own worked example.

import { RESULTS_CONTENT } from './survey'

export const FRONT_RUNNER_KEYS = ['intake_triage', 'missed_call_recovery']
export const SUB_AGENT_KEYS = ['insurance', 'follow_up', 'bed_sync', 'reminders', 'referral_reporting']

export const SETUP_FEE_PERCENT = 0.75

// Rounds up to the nearest hundred, then drops a dollar — the "charm $X99
// price" every client-facing figure gets rounded to (e.g. 1128 -> 1199).
export function charm99(x) {
  return Math.ceil(x / 100) * 100 - 1
}

export const AGENT_CATALOG = {
  intake_triage: {
    kind: 'front_runner',
    label: 'Inbound Intake & Triage',
    status: 'placeholder', // 'placeholder' | 'live'
    needsConnect: ['phone_number'],
    price: { monthlyFee: 999 },
  },
  missed_call_recovery: {
    kind: 'front_runner',
    label: 'Missed-Call Recovery',
    status: 'placeholder',
    needsConnect: ['phone_number'],
    price: { monthlyFee: 999 },
  },
  insurance: {
    kind: 'sub_agent',
    label: 'Insurance / payer verification',
    status: 'placeholder',
    needsConnect: [],
    price: { monthlyFee: 199 },
  },
  follow_up: {
    kind: 'sub_agent',
    label: 'Follow-up & nurture',
    status: 'placeholder',
    needsConnect: [],
    price: { monthlyFee: 149 },
  },
  bed_sync: {
    kind: 'sub_agent',
    label: 'Bed/program availability sync',
    status: 'placeholder',
    needsConnect: [],
    price: { monthlyFee: 179 },
  },
  reminders: {
    kind: 'sub_agent',
    label: 'Appointment Reminder & No-Show Prevention',
    status: 'placeholder',
    needsConnect: [],
    price: { monthlyFee: 129 },
  },
  referral_reporting: {
    kind: 'sub_agent',
    label: 'Referral-source reporting',
    status: 'placeholder',
    needsConnect: [],
    price: { monthlyFee: 149 },
  },
}

// Prompt 612 — sums a front-runner + its selected sub-agents' monthlyFee,
// charm-rounds it, derives the setup fee as SETUP_FEE_PERCENT of that
// monthly total, then charm-rounds the combined first-month total and backs
// the setup fee out of it — so every dollar figure a client sees ends in 99.
// `firstMonthTotal` (setup + monthly) is for display only; callers persist
// `setupFee`/`monthlyFee` (matches deal_setup_fee/deal_first_month_fee).
// Safe to call with no front-runner picked yet — returns all zeros rather
// than charm-rounding a $0 selection into -$1.
export function priceForSelection(frontRunnerKey, subAgentKeys = []) {
  const front = AGENT_CATALOG[frontRunnerKey]?.price
  let rawMonthly = front?.monthlyFee ?? 0
  for (const key of subAgentKeys) {
    rawMonthly += AGENT_CATALOG[key]?.price?.monthlyFee ?? 0
  }
  if (rawMonthly <= 0) return { setupFee: 0, monthlyFee: 0, firstMonthTotal: 0 }

  const monthlyFee = charm99(rawMonthly)
  const rawSetup = monthlyFee * SETUP_FEE_PERCENT
  const firstMonthTotal = charm99(monthlyFee + rawSetup)
  const setupFee = firstMonthTotal - monthlyFee
  return { setupFee, monthlyFee, firstMonthTotal }
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
