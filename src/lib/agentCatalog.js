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

import { PhoneCall, PhoneMissed, ShieldCheck, Repeat, BedDouble, CalendarClock, PieChart } from 'lucide-react'
import { RESULTS_CONTENT } from './survey'

export const FRONT_RUNNER_KEYS = ['intake_triage', 'missed_call_recovery']
export const SUB_AGENT_KEYS = ['insurance', 'follow_up', 'bed_sync', 'reminders', 'referral_reporting']

// `navLabel` (Prompt 565) — short, client-facing sidebar tab name, distinct
// from the fuller internal `label` (still used by RESULTS_CONTENT/survey and
// the Overview card headings). Sidebar-only; naming handed to Eagle per the
// prompt.
// Prompt 567 — revises Prompt 565's navLabel wording and adds
// `navCategory`/`navIcon`. Prompt 565 gave every agent its own sidebar tab
// but left them all still inside one flat TODAY list — this prompt groups
// them into small categories (Inbound, Insurance, Follow-Ups, Scheduling,
// Calendar, Reporting) the way COMMUNICATION/ACCOUNT already read as their
// own sections, and tightens a couple of navLabel values that still read
// as internal jargon rather than something a client recognizes (e.g.
// "Intake & Triage" → "Phone Calls").
export const AGENT_CATALOG = {
  intake_triage: {
    kind: 'front_runner',
    label: 'Inbound Intake & Triage',
    navLabel: 'Phone Calls',
    navCategory: 'Inbound',
    navIcon: PhoneCall,
    status: 'placeholder', // 'placeholder' | 'live'
    needsConnect: ['phone_number'],
  },
  missed_call_recovery: {
    kind: 'front_runner',
    label: 'Missed-Call Recovery',
    navLabel: 'Missed Calls',
    navCategory: 'Inbound',
    navIcon: PhoneMissed,
    status: 'placeholder',
    needsConnect: ['phone_number'],
  },
  insurance: {
    kind: 'sub_agent',
    label: 'Insurance / payer verification',
    navLabel: 'Insurance',
    navCategory: 'Insurance',
    navIcon: ShieldCheck,
    status: 'placeholder',
    needsConnect: [],
  },
  follow_up: {
    kind: 'sub_agent',
    label: 'Follow-up & nurture',
    navLabel: 'Follow-Ups',
    navCategory: 'Follow-Ups',
    navIcon: Repeat,
    status: 'placeholder',
    needsConnect: [],
  },
  bed_sync: {
    kind: 'sub_agent',
    label: 'Bed/program availability sync',
    navLabel: 'Bed Availability',
    navCategory: 'Scheduling',
    navIcon: BedDouble,
    status: 'placeholder',
    needsConnect: [],
  },
  reminders: {
    kind: 'sub_agent',
    label: 'Appointment Reminder & No-Show Prevention',
    navLabel: 'Appointment Reminders',
    navCategory: 'Calendar',
    navIcon: CalendarClock,
    status: 'placeholder',
    needsConnect: [],
  },
  referral_reporting: {
    kind: 'sub_agent',
    label: 'Referral-source reporting',
    navLabel: 'Referral Reports',
    navCategory: 'Reporting',
    navIcon: PieChart,
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
