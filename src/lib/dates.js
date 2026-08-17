// Prompt 451 — pure date-math shared by the Activity/My Calls day
// paginator (components/ui/DayPaginator.jsx) and their data-fetching
// hooks. Split out so hooks don't import from components/ui. UTC
// calendar days throughout, same convention already used everywhere else
// in this app for "today" (Overview's TodayStrip, My Goals' daily target,
// the badge system's Perfect Day grouping).
function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

export function todayUTCStr() {
  return toDateStr(new Date())
}

export function shiftDay(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return toDateStr(d)
}

export function dayRange(dateStr) {
  return { start: `${dateStr}T00:00:00.000Z`, end: `${shiftDay(dateStr, 1)}T00:00:00.000Z` }
}
