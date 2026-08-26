import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useAllLeadsForStats, useReps, statsForUser, statsForCloser } from '../hooks/useStats'
import { useMyAllCalls, groupCallsByDay, isPerfectDay } from '../hooks/useBadges'
import { WeekPaginator } from '../components/ui/WeekPaginator'
import { DayPaginator } from '../components/ui/DayPaginator'
import { MonthPaginator } from '../components/ui/MonthPaginator'
import { DateRangeCalendar } from '../components/ui/DateRangeCalendar'
import { PillToggle } from '../components/ui/PillToggle'
import {
  zonedDateStr, zonedDayRange, mondayOf, shiftDay, lastNBusinessDays,
  monthOf, firstOfMonth, lastOfMonth,
} from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-card border border-line bg-elevated p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-3xl font-medium text-fg-primary">{value}</p>
      {sub && <p className="mt-1 font-sans text-xs text-fg-faint">{sub}</p>}
    </div>
  )
}

// Prompt 536 — replaced the old two-native-input FROM/TO range with this
// three-way toggle. "All Time" doesn't mean unbounded-all-data despite the
// label — Brayden's own words were "all time just turns into custom date":
// selecting it reveals a custom date-range calendar (DateRangeCalendar)
// in the same navigator slot Daily/Monthly use for their day/month
// paginators, and the three stat cards below filter to whatever's picked.
const PERIOD_TABS = [
  { key: 'daily', label: 'Daily' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'allTime', label: 'All Time' },
]

function formatRangeLabel(range) {
  const short = (d) => new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
  return range.start === range.end ? short(range.start) : `${short(range.start)} – ${short(range.end)}`
}

function weekdayLabel(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
}

// Prompt 506 — "0-10"/"0-2" in the caption text was the only scale
// information this chart ever gave; there was no way to read an actual
// data point's value off the chart itself. `niceTicks` picks round,
// human-readable tick values (1/2/2.5/5 × a power of ten, the standard
// axis-tick heuristic) rather than dividing the raw max into N equal
// slices, which would produce ugly ticks like "0, 3.67, 7.33, 11".
//
// Prompt 519 — two real bugs Brayden caught live, fixed here:
// (1) the old loop condition (`v <= max + step * 0.001`) stopped as soon
// as it stepped PAST max, without guaranteeing the last tick actually
// covered it — for max=155/step=100 that produced ticks [0, 100], an
// axis that tops out below the real data max, silently clipping any bar
// taller than 100 at the chart's top edge. Now walks forward while
// v < max and always pushes one final tick >= max, so the axis can never
// top out below the real data. (2) `count = 4` only ever produced 2-3
// ticks total (one implicit interval), reading as "just the two
// endpoints" — bumped the target to 6 intervals and added 2.5 as a nice-
// multiplier candidate so a ~150 max lands on 0/25/50/75/100/125/150
// instead of a single coarse 0/100/200 jump.
function niceTicks(max, targetIntervals = 6) {
  if (max <= 0) return [0]
  const rawStep = max / targetIntervals
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  const step = niceNorm * mag
  const ticks = [0]
  let v = 0
  while (v < max) {
    v += step
    ticks.push(Math.round(v))
  }
  return [...new Set(ticks)]
}

// Prompt 516 — grouped bar chart, one shared Y-axis for both series (was
// two independent-scale lines, Prompt 450).
//
// Prompt 526 — shared axis (Dials 100-150, Bookings 0-3) made Bookings
// visually unreadable, not a `niceTicks` bug (Prompt 519 already verified
// that math) — the wrong encoding for two series this far apart in
// magnitude. Moved Bookings to its own right/secondary axis, rendered as
// a line+dots since a line doesn't need real pixel height to register.
//
// Prompt 527 — Brayden confirmed the dual-axis fix itself (Bookings
// finally has real visible height) but preferred bars back over the
// line, visually. NOT a revert to Prompt 519's shared-axis version —
// Bookings bars now render against the Prompt 526 right axis, same scale
// the line used, just a different mark. Right axis is now a FIXED 0-6
// range (not `niceTicks`-derived) per Brayden's explicit ask, giving
// headroom above the real ~2-3 max the same way the left axis already
// has headroom above its real ~140 max. Axis labels now carry their
// series' own color (left=accent/blue, right=success/green) with a
// small tick-mark dash connecting each label to its gridline, and more
// breathing room between labels and the plot area on both sides.
function WeeklyBarChart({ days }) {
  const W = 600
  const H = 200
  const padXLeft = 44
  const padXRight = 40
  const padY = 24
  const tickLen = 4
  const maxDials = Math.max(1, ...days.map((d) => d.dials))
  const dialsTicks = niceTicks(maxDials)
  const dialsAxisMax = dialsTicks[dialsTicks.length - 1] || 1
  const yForDials = (v) => H - padY - (v / dialsAxisMax) * (H - padY * 2)
  const bookingsTicks = [0, 1, 2, 3, 4, 5, 6]
  const bookingsAxisMax = 6
  const yForBookings = (v) => H - padY - (v / bookingsAxisMax) * (H - padY * 2)
  const groupWidth = days.length > 0 ? (W - padXLeft - padXRight) / days.length : 0
  const groupPad = groupWidth * 0.18
  const barGap = 3
  const barWidth = Math.max(1, (groupWidth - groupPad * 2 - barGap) / 2)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        {/* Left axis (Dials) drives the full-width gridlines — a second
            set from the right axis would draw non-aligned lines and read
            as noise. Right axis gets its own tick-mark dashes only. */}
        {dialsTicks.map((t) => (
          <g key={`dials-tick-${t}`}>
            <line x1={padXLeft} y1={yForDials(t)} x2={W - padXRight} y2={yForDials(t)} className="stroke-line" strokeWidth="1" opacity={t === 0 ? 1 : 0.5} />
            <line x1={padXLeft - tickLen} y1={yForDials(t)} x2={padXLeft} y2={yForDials(t)} className="stroke-accent" strokeWidth="1" />
            <text x={padXLeft - tickLen - 4} y={yForDials(t)} dy="3.5" textAnchor="end" fontSize="10" className="fill-accent">{t}</text>
          </g>
        ))}
        {bookingsTicks.map((t) => (
          <g key={`bookings-tick-${t}`}>
            <line x1={W - padXRight} y1={yForBookings(t)} x2={W - padXRight + tickLen} y2={yForBookings(t)} className="stroke-success" strokeWidth="1" />
            <text x={W - padXRight + tickLen + 4} y={yForBookings(t)} dy="3.5" textAnchor="start" fontSize="10" className="fill-success">{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const groupX = padXLeft + i * groupWidth
          const dialsX = groupX + groupPad
          const bookingsX = dialsX + barWidth + barGap
          return (
            <g key={d.date}>
              <rect x={dialsX} y={yForDials(d.dials)} width={barWidth} height={Math.max(0, H - padY - yForDials(d.dials))} rx="2" className="fill-accent">
                <title>{d.label}: {d.dials} dials</title>
              </rect>
              <rect x={bookingsX} y={yForBookings(d.bookings)} width={barWidth} height={Math.max(0, H - padY - yForBookings(d.bookings))} rx="2" className="fill-success">
                <title>{d.label}: {d.bookings} bookings</title>
              </rect>
              <text x={groupX + groupWidth / 2} y={H - 6} textAnchor="middle" fontSize="11" className="fill-fg-faint">{d.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 font-sans text-xs text-fg-faint">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" /> Dials — 0–{dialsAxisMax.toLocaleString()} (left)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> Bookings — 0–{bookingsAxisMax.toLocaleString()} (right)</span>
      </div>
    </div>
  )
}

// Prompt 519 — pale blue (low) to deep blue (high), fixed direction in
// BOTH themes, and normalized to the real visible min-max rather than a
// fixed /150 denominator. Two real bugs from the Prompt 475/502 version:
// (1) that version anchored "0 dials" to whatever `--bg-elevated` current
// is (white in light mode, near-black in dark mode) so a 0-dial cell
// always blended into the card — but that inherently means "low" is the
// theme's own darkest color in dark mode, i.e. darker-means-fewer,
// lighter-means-more — backwards from the standard heatmap convention
// (GitHub's contribution graph, etc.) and exactly what Brayden flagged
// live. Fixed by dropping the per-theme/blend-into-card anchor entirely
// in favor of a fixed light-to-dark blue scale, identical in both themes
// — reuses two colors already established elsewhere in this app (the
// pale blue is STATUS_TINT.new's `#e3e9ff`, the deep end is
// `--accent-deep`'s light-mode value `#24469e`), not new arbitrary hexes.
// (2) the old fixed `dials / PERFECT_DAY_DIALS` (150) denominator meant
// a realistic day's range (say 70-159) only ever occupied the TOP half of
// the color scale, compressing real variation into a narrow band and
// making adjacent values look more similar than the data actually
// warrants. Normalizing to the real min/max across the visible days
// spreads whatever range is actually present across the FULL gradient,
// so two genuinely different dial counts get genuinely distinguishable
// colors regardless of where they sit in the absolute 0-150 scale.
function dialColor(dials, minDials, maxDials) {
  const span = maxDials - minDials
  const pct = span > 0 ? Math.min(1, Math.max(0, (dials - minDials) / span)) : (dials > 0 ? 1 : 0)
  const start = [227, 233, 255] // pale blue — STATUS_TINT.new's #e3e9ff
  const end = [36, 70, 158] // deep blue — --accent-deep's light value #24469e
  const rgb = start.map((s, i) => Math.round(s + (end[i] - s) * pct))
  return `rgb(${rgb.join(',')})`
}

function ActivityHeatmap({ days }) {
  const { minDials, maxDials } = useMemo(() => {
    const values = days.map((d) => d.dials)
    if (!values.length) return { minDials: 0, maxDials: 0 }
    return { minDials: Math.min(...values), maxDials: Math.max(...values) }
  }, [days])

  return (
    <div>
      {/* Prompt 519: back to 7 columns per Brayden's explicit call — the
          underlying date logic (21 real business days, weekends skipped,
          Prompt 516) is unchanged, this is purely a grid layout choice. */}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const perfect = isPerfectDay(d)
          return (
            <div
              key={d.date}
              title={`${d.date} — ${d.dials} dials, ${d.bookings} bookings${perfect ? ' · Perfect Day' : ''}`}
              className="aspect-square rounded-md border border-line"
              style={{ background: perfect ? 'var(--success)' : dialColor(d.dials, minDials, maxDials) }}
            />
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 font-sans text-xs text-fg-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-success" /> Perfect Day (150 dials + 2 bookings)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-line" style={{ background: dialColor(maxDials, minDials, maxDials) }} /> Dial volume
        </span>
      </div>
    </div>
  )
}

// Prompt 516 — deterministic per-date PRNG so a mock day's numbers stay
// stable across re-renders/refetches/week-navigation instead of jittering
// on every render, while still varying date to date. xmur3 + mulberry32
// (standard public-domain combo), not a plain multiply-hash — consecutive
// calendar dates like "2026-08-17" vs. "2026-08-18" differ by one
// character, and a weaker hash (tried `h*31+charCode` first) doesn't
// avalanche enough from that single-character difference, so every day
// in a week came out landing on nearly the same dial count (109/109/109/
// 110/110 — caught in a real browser check, not assumed correct from
// reading the code) instead of looking like independent days.
function seededRandom(seed) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = Math.imul(h ^ (h >>> 16), 2246822507)
  a = Math.imul(a ^ (a >>> 13), 3266489909)
  a ^= a >>> 16
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Believable cold-calling volume per the existing badge system's own scale
// (PERFECT_DAY_DIALS = 150 dials/day) — 70-150 dials, 0-3 bookings, never
// flatlined at zero. UI-only: never written to the database, never touches
// `calls`/`leads` — see Stats() below, gated to exactly one account.
// Prompt 519 — was 70-159, letting mock days exceed the real 150-lead pool
// cap (a setter physically cannot dial more leads than they have); capped
// to 70-150 so no mock value is impossible under the real system.
function mockDayStats(dateStr) {
  const rand = seededRandom(dateStr)
  const dials = 70 + Math.floor(rand() * 81)
  const bookings = Math.min(dials, Math.floor(rand() * 4))
  return { dials, bookings }
}

function mockDays(dateList) {
  return dateList.map((date) => ({ date, ...mockDayStats(date) }))
}

export default function Stats() {
  const { profile } = useAuth()
  const { data: leads, isLoading } = useAllLeadsForStats()
  const { data: reps } = useReps()
  const { data: allCalls } = useMyAllCalls(profile?.id)
  const tz = profile?.timezone || DEFAULT_TIMEZONE
  // Prompt 536 — Daily/Monthly/All Time period toggle, replacing the old
  // FROM/TO range. Each tab keeps its own independent nav state so
  // switching tabs doesn't lose where you were in the other two.
  const [periodTab, setPeriodTab] = useState('daily')
  const [dayDate, setDayDate] = useState(() => zonedDateStr(Date.now(), tz))
  const [monthStr, setMonthStr] = useState(() => monthOf(zonedDateStr(Date.now(), tz)))
  const [customRange, setCustomRange] = useState(null)
  const [weekMonday, setWeekMonday] = useState(() => mondayOf(zonedDateStr(Date.now(), tz)))

  const isAdmin = profile?.role === 'admin'
  const isCloser = profile?.role === 'closer'
  // Prompt 516 — `test_setter`'s own Stats page shows believable UI-only
  // sample numbers instead of its real (thin/mostly-zero) call history.
  // Replaces Prompt 506's blocked DB-seeding approach entirely per
  // Brayden's own explicit clarification: no database write, ever — just
  // render mock numbers in place of the real query result for this one
  // account. Scoped by username, not role, so it can never accidentally
  // apply to a real setter.
  const isMockAccount = profile?.username === 'test_setter'

  // Prompt 450: line chart + heatmap, setter/admin only — closers don't
  // dial, same scoping precedent as the badge row on My Goals ("closers
  // don't make calls, so a call-volume goal doesn't apply to them").
  // Prompt 458: grouped by the viewing user's own timezone — this is their
  // own dial history, so their own "today"/"this week" applies.
  const byDay = useMemo(() => groupCallsByDay(allCalls || [], tz), [allCalls, tz])

  const weekDays = useMemo(() => {
    const dates = Array.from({ length: 5 }, (_, i) => shiftDay(weekMonday, i))
    if (isMockAccount) return mockDays(dates).map((d) => ({ ...d, label: weekdayLabel(d.date) }))
    return dates.map((date) => ({ date, label: weekdayLabel(date), ...(byDay.get(date) || { dials: 0, bookings: 0 }) }))
  }, [weekMonday, byDay, isMockAccount])

  // Prompt 516: 21 *business* days, not 21 calendar days — dialers aren't
  // expected to work weekends under the current model, so Sat/Sun no
  // longer pad the grid with guaranteed-empty cells.
  const heatmapDays = useMemo(() => {
    const today = zonedDateStr(Date.now(), tz)
    const dates = lastNBusinessDays(today, 21)
    if (isMockAccount) return mockDays(dates)
    return dates.map((date) => ({ date, ...(byDay.get(date) || { dials: 0, bookings: 0 }) }))
  }, [byDay, tz, isMockAccount])

  // Prompt 536 — plain YYYY-MM-DD start/end for whichever period is
  // currently active, still interpreted as calendar days in a given
  // timezone downstream (zonedDayRange), same as the old FROM/TO values
  // were. Daily/Monthly always resolve to a real pair; All Time only
  // resolves once a range has actually been picked (`customRange` starts
  // null — see the render below for why that's treated as "no data yet,"
  // not silently falling through to genuinely unbounded all-time totals).
  const rawRange = useMemo(() => {
    if (periodTab === 'monthly') return { rawStart: firstOfMonth(monthStr), rawEnd: lastOfMonth(monthStr) }
    if (periodTab === 'allTime') return { rawStart: customRange?.start || '', rawEnd: customRange?.end || '' }
    return { rawStart: dayDate, rawEnd: dayDate }
  }, [periodTab, dayDate, monthStr, customRange])

  // Prompt 458: the date-range picker's plain YYYY-MM-DD values are
  // interpreted as calendar days in the VIEWING user's own timezone
  // before querying — "Aug 17" means Aug 17 where I am, not UTC Aug 17.
  // Empty stays empty (no filter = all-time), same as before.
  const myStats = useMemo(() => {
    if (!leads) return null
    const { rawStart, rawEnd } = rawRange
    const zStart = rawStart ? zonedDayRange(rawStart, tz).start : ''
    const zEnd = rawEnd ? zonedDayRange(rawEnd, tz).end : ''
    return isCloser ? statsForCloser(leads, profile.id, zStart, zEnd) : statsForUser(leads, profile.id, zStart, zEnd)
  }, [leads, profile, rawRange, tz, isCloser])

  // Prompt 458: per Brayden's answer, each rep's row uses THAT rep's own
  // saved timezone to resolve the same picked date range — not the
  // viewing admin's — so the same period means the same calendar day(s)
  // in each rep's own zone, per row, even though every row shares the
  // same nominal period selection.
  const rollup = useMemo(() => {
    if (!leads) return null
    const setters = (reps || []).filter((r) => r.role === 'setter')
    const closers = (reps || []).filter((r) => r.role === 'closer')
    const { rawStart, rawEnd } = rawRange
    const rangeFor = (repTz) => ({
      start: rawStart ? zonedDayRange(rawStart, repTz || DEFAULT_TIMEZONE).start : '',
      end: rawEnd ? zonedDayRange(rawEnd, repTz || DEFAULT_TIMEZONE).end : '',
    })
    return {
      setters: setters.map((s) => {
        const r = rangeFor(s.timezone)
        return { ...s, ...statsForUser(leads, s.id, r.start, r.end) }
      }),
      closers: closers.map((c) => {
        const r = rangeFor(c.timezone)
        return { ...c, ...statsForCloser(leads, c.id, r.start, r.end) }
      }),
    }
  }, [leads, reps, rawRange])

  if (isLoading) {
    return <p className="font-sans text-sm text-fg-secondary">Loading…</p>
  }

  const hasSelectedRange = periodTab !== 'allTime' || !!customRange

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">Stats</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">
            {isAdmin ? 'Team performance' : 'Your performance'}
          </p>
        </div>
        <PillToggle options={PERIOD_TABS} active={periodTab} onChange={setPeriodTab} />
      </div>

      <div className="mt-3 flex justify-end">
        {periodTab === 'daily' && <DayPaginator date={dayDate} onChange={setDayDate} timezone={tz} />}
        {periodTab === 'monthly' && <MonthPaginator month={monthStr} onChange={setMonthStr} timezone={tz} />}
        {periodTab === 'allTime' && (
          <div className="w-full max-w-xs">
            {customRange && (
              <p className="mb-2 text-right font-sans text-xs text-fg-secondary">
                {formatRangeLabel(customRange)}{' '}
                <button onClick={() => setCustomRange(null)} className="underline-offset-2 hover:underline">
                  Clear
                </button>
              </p>
            )}
            <DateRangeCalendar
              range={customRange}
              onChange={setCustomRange}
              initialMonth={monthOf(customRange?.start || dayDate)}
            />
          </div>
        )}
      </div>

      {!hasSelectedRange ? (
        <p className="mt-6 font-sans text-sm text-fg-secondary">
          Pick a start and end date above to see stats for that range.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {isCloser ? (
            <Tile label="Strategy Calls Assigned" value={myStats.assigned} />
          ) : (
            <>
              <Tile label="Calls Logged" value={myStats.logged} />
              <Tile label="Calls Booked" value={myStats.booked} />
              <Tile label="Booking Rate" value={`${myStats.bookingPct}%`} />
            </>
          )}
        </div>
      )}

      {!isCloser && (
        <div className="mt-8 space-y-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-medium text-fg-primary">Weekly Activity</h2>
              <WeekPaginator monday={weekMonday} onChange={setWeekMonday} timezone={tz} />
            </div>
            <div className="mt-3 rounded-card border border-line bg-elevated p-5">
              <WeeklyBarChart days={weekDays} />
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg font-medium text-fg-primary">Last 21 Business Days</h2>
            <div className="mt-3 rounded-card border border-line bg-elevated p-5">
              <ActivityHeatmap days={heatmapDays} />
            </div>
          </div>
        </div>
      )}

      {isAdmin && rollup && (
        <div className="mt-8 space-y-6">
          <div>
            <h2 className="font-display text-lg font-medium text-fg-primary">Setters</h2>
            <div className="mt-3 overflow-hidden rounded-card border border-line bg-elevated">
              <table className="w-full text-left">
                <thead className="eyebrow bg-surface">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Calls Logged</th>
                    <th className="px-5 py-3">Calls Booked</th>
                    <th className="px-5 py-3">Booking Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rollup.setters.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center font-sans text-sm text-fg-secondary">
                        No setters yet.
                      </td>
                    </tr>
                  ) : (
                    rollup.setters.map((s) => (
                      <tr key={s.id} className="border-t border-line font-sans text-sm">
                        <td className="px-5 py-4 font-medium text-fg-primary">{s.full_name}</td>
                        <td className="px-5 py-4 text-fg-secondary">{s.logged}</td>
                        <td className="px-5 py-4 text-fg-secondary">{s.booked}</td>
                        <td className="px-5 py-4 text-fg-secondary">{s.bookingPct}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg font-medium text-fg-primary">Closers</h2>
            <div className="mt-3 overflow-hidden rounded-card border border-line bg-elevated">
              <table className="w-full text-left">
                <thead className="eyebrow bg-surface">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Strategy Calls Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {rollup.closers.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-5 py-6 text-center font-sans text-sm text-fg-secondary">
                        No closers yet.
                      </td>
                    </tr>
                  ) : (
                    rollup.closers.map((c) => (
                      <tr key={c.id} className="border-t border-line font-sans text-sm">
                        <td className="px-5 py-4 font-medium text-fg-primary">{c.full_name}</td>
                        <td className="px-5 py-4 text-fg-secondary">{c.assigned}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
