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
// Prompt 614 — deal pricing no longer sums per-agent catalog fees at all.
// The Stack (front-runner + sub-agents) now only decides what's included;
// the monthly price scales with a rough estimate of what the facility is
// losing to missed calls, from the Closer Survey's own value-pricing
// answers (`survey_missed_calls_per_week`/`survey_admission_value`) — see
// `priceForSurveyValue` below. `AGENT_CATALOG` entries keep no `price`
// field anymore; there is exactly one pricing path.

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
  },
  missed_call_recovery: {
    kind: 'front_runner',
    label: 'Missed-Call Recovery',
    status: 'placeholder',
    needsConnect: ['phone_number'],
  },
  insurance: {
    kind: 'sub_agent',
    label: 'Insurance / payer verification',
    status: 'placeholder',
    needsConnect: [],
  },
  follow_up: {
    kind: 'sub_agent',
    label: 'Follow-up & nurture',
    status: 'placeholder',
    needsConnect: [],
  },
  bed_sync: {
    kind: 'sub_agent',
    label: 'Bed/program availability sync',
    status: 'placeholder',
    needsConnect: [],
  },
  reminders: {
    kind: 'sub_agent',
    label: 'Appointment Reminder & No-Show Prevention',
    status: 'placeholder',
    needsConnect: [],
  },
  referral_reporting: {
    kind: 'sub_agent',
    label: 'Referral-source reporting',
    status: 'placeholder',
    needsConnect: [],
  },
}

// Prompt 614 — turns a pricing-input value into a representative number:
// a plain number string parses as itself; one of Survey.jsx's BracketField
// bracket strings ("Below $X" / "$X–$Y" / "Above $X") resolves to 75%/the
// midpoint/125% of its anchor(s); empty/missing resolves to 0 (never NaN).
function resolveEstimate(value) {
  if (value === '' || value == null) return 0
  const str = String(value).trim()
  if (str === '') return 0

  const num = (s) => Number(s.replace(/[$,%]/g, '').trim())

  const below = str.match(/^below\s+(.+)$/i)
  if (below) return num(below[1]) * 0.75

  const above = str.match(/^above\s+(.+)$/i)
  if (above) return num(above[1]) * 1.25

  if (str.includes('–')) {
    const [low, high] = str.split('–')
    return (num(low) + num(high)) / 2
  }

  return num(str)
}

function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi)
}

// Prompt 614 — placeholder judgment call: the fraction of monthly missed
// calls Restorix actually helps convert into a paying admission. Flag for
// Brayden to tune once real survey-to-quote data exists.
export const CAPTURE_RATE = 0.05

// Prompt 614 — placeholder judgment call: our cut of the monthly value
// estimated recovered for the facility. Flag for Brayden to tune once real
// survey-to-quote data exists.
export const VALUE_PERCENT = 0.02

// Prompt 614 — monthlyFee floor/ceiling, deliberately already charm-99
// numbers so the clamp itself never produces a non-99 monthly fee.
export const FLOOR = 999
export const CEILING = 2499

// Prompt 614 — extracted from the old priceForSelection: charm-rounds a
// monthly fee, derives the setup fee as SETUP_FEE_PERCENT of it, then
// charm-rounds the combined first-month total and backs the setup fee out
// of it — so every dollar figure a client sees ends in 99. Safe to call
// with monthlyFee <= 0 — returns all zeros rather than charm-rounding $0
// into -$1.
export function priceFromMonthlyFee(rawMonthlyFee) {
  if (rawMonthlyFee <= 0) return { setupFee: 0, monthlyFee: 0, firstMonthTotal: 0 }

  const monthlyFee = charm99(rawMonthlyFee)
  const rawSetup = monthlyFee * SETUP_FEE_PERCENT
  const firstMonthTotal = charm99(monthlyFee + rawSetup)
  const setupFee = firstMonthTotal - monthlyFee
  return { setupFee, monthlyFee, firstMonthTotal }
}

// Prompt 614 — a deal's monthly price scales with a rough estimate of what
// the facility is losing to missed calls: weekly missed calls -> monthly,
// times the fraction of those calls we actually help convert (CAPTURE_RATE),
// times what an admission is worth, times our cut of that (VALUE_PERCENT) —
// clamped into Brayden's $1,500-$4,500 first-month target range via
// FLOOR/CEILING, then run through the same charm-99 pipeline Prompt 612
// locked. Missing/blank survey answers resolve to 0 and floor at FLOOR
// (today's baseline, unchanged from before survey-value pricing existed).
export function priceForSurveyValue(missedCallsPerWeek, admissionValue) {
  const recoveredValue =
    resolveEstimate(missedCallsPerWeek) * 4.33 * CAPTURE_RATE * resolveEstimate(admissionValue)
  const rawMonthlyFee = recoveredValue * VALUE_PERCENT
  const monthlyFee = clamp(rawMonthlyFee, FLOOR, CEILING)
  return priceFromMonthlyFee(monthlyFee)
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
