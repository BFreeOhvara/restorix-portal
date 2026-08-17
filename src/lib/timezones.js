// Prompt 458 — timezone helpers, ported/adapted from ohvara-dashboard's
// lib/timezones.js (its own comment: "dependency-free timezone helpers").
// Restorix has no appointment-booking input, so only the display/list
// helpers are ported — not the datetime-local <-> UTC conversion helpers
// Ohvara's booking flow needs.

export const DEFAULT_TIMEZONE = 'America/Chicago'

const TZ_LABELS = {
  'America/New_York': 'Eastern',
  'America/Chicago': 'Central',
  'America/Denver': 'Mountain',
  'America/Phoenix': 'Mountain (AZ, no DST)',
  'America/Los_Angeles': 'Pacific',
  'America/Anchorage': 'Alaska',
  'Pacific/Honolulu': 'Hawaii',
}

export const SELECTABLE_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Phoenix', label: 'Mountain (AZ, no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
]

export function timezoneLabel(tz) {
  return TZ_LABELS[tz] || tz || DEFAULT_TIMEZONE
}

// Formats a UTC ISO timestamp in `timeZone` for display.
export function formatInTimezone(iso, timeZone, opts = {}) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleString('en-US', { timeZone: timeZone || DEFAULT_TIMEZONE, ...opts })
}
