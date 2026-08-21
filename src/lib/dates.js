// Prompt 451 — pure date-math shared by the Activity/My Calls day
// paginator (components/ui/DayPaginator.jsx) and their data-fetching
// hooks. Split out so hooks don't import from components/ui.
//
// Prompt 458: this file used to be UTC-only throughout (todayUTCStr/
// dayRange, removed — every call site now goes through the zoned*
// functions below instead). shiftDay/mondayOf/shiftWeek stay UTC-flavored
// internally (new Date(`${str}T00:00:00Z`)) but that's fine — they're pure
// calendar-string arithmetic (add N days, find Monday) that doesn't
// actually care what wall-clock zone the string came from, as long as the
// STRING itself was computed correctly for the right zone to begin with.
// That's what the zoned* functions below are for: zonedDateStr answers
// "what calendar day is it right now, in this user's zone" (the "today"
// entry point), and zonedDayRange answers "what real UTC instants bound
// that calendar day in that zone" (for DB query .gte()/.lt() bounds).
function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

export function shiftDay(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return toDateStr(d)
}

// Prompt 450 — generalized out of MyGoals.jsx's old page-local
// `mondayOfThisWeek()` (which only ever computed "Monday of today") so
// Stats' new week-navigable line chart can ask for the Monday of *any*
// selected week, not just the current one. MyGoals now calls this too
// with today's date, rather than keeping two copies of the same offset math.
export function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  const day = d.getUTCDay() // 0=Sun..6=Sat
  const offset = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + offset)
  return toDateStr(d)
}

export function shiftWeek(mondayStr, deltaWeeks) {
  return shiftDay(mondayStr, deltaWeeks * 7)
}

// Prompt 516 — whether a calendar date string falls on a weekday (Mon–Fri).
// Same UTC calendar-string-arithmetic flavor as shiftDay/mondayOf above —
// doesn't care what zone the string came from, only that it was computed
// correctly for the right zone to begin with.
export function isWeekday(dateStr) {
  const day = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()
  return day !== 0 && day !== 6
}

// The last `count` business days ending on (and including, if itself a
// weekday) `dateStr`, ascending order — Stats' "Last 21 Days" heatmap
// means 21 business days, not 21 calendar days (dialers aren't expected
// to work weekends under the current model), so a Monday's cell no longer
// sits three real days after the preceding Friday's on the calendar axis
// while a Sat/Sun cell that never had any activity to show gets skipped
// entirely instead of padding the grid with two guaranteed-empty squares.
export function lastNBusinessDays(dateStr, count) {
  const days = []
  let cursor = dateStr
  while (days.length < count) {
    if (isWeekday(cursor)) days.unshift(cursor)
    cursor = shiftDay(cursor, -1)
  }
  return days
}

// The UTC offset (minutes) of `timeZone` at the instant `date` represents.
// Ported from ohvara-dashboard's lib/timezones.js.
function getTimezoneOffsetMinutes(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc }, {})
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return (asUTC - date.getTime()) / 60000
}

// Interprets a "YYYY-MM-DDTHH:mm" wall-clock string AS IF it were local
// time in `timeZone`, returning the equivalent UTC ISO instant. Two-pass
// DST correction (ported from Ohvara) — converges in one pass outside the
// literal hour of a transition, the second pass catches that edge case.
export function zonedTimeToUtcIso(dateTimeLocalStr, timeZone) {
  const [datePart, timePart] = dateTimeLocalStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = (timePart || '00:00').split(':').map(Number)

  let guess = Date.UTC(year, month - 1, day, hour, minute)
  for (let i = 0; i < 2; i++) {
    const offset = getTimezoneOffsetMinutes(timeZone, new Date(guess))
    guess = Date.UTC(year, month - 1, day, hour, minute) - offset * 60000
  }
  return new Date(guess).toISOString()
}

// The calendar day (YYYY-MM-DD) that `nowMs` falls on from the perspective
// of `timeZone` — a user's own local day, not the UTC day. en-CA locale
// formats dates as YYYY-MM-DD natively, so no manual part-assembly needed.
export function zonedDateStr(nowMs, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC' }).format(new Date(nowMs))
}

// zonedDayRange's answer to "what real UTC instants bound this calendar
// day in this zone" — the timezone-aware counterpart to dayRange(), which
// assumes the date string is a UTC day. Use this (not dayRange) for any
// query filtering by a specific user's "today"/"that day".
export function zonedDayRange(dateStr, timeZone) {
  return {
    start: zonedTimeToUtcIso(`${dateStr}T00:00`, timeZone),
    end: zonedTimeToUtcIso(`${shiftDay(dateStr, 1)}T00:00`, timeZone),
  }
}
