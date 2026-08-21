import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { useAllLeadsForStats, useReps, statsForUser, statsForCloser } from '../hooks/useStats'
import { useMyAllCalls, groupCallsByDay, isPerfectDay, PERFECT_DAY_DIALS } from '../hooks/useBadges'
import { Field, inputClass } from '../components/ui/Field'
import { WeekPaginator } from '../components/ui/WeekPaginator'
import { zonedDateStr, zonedDayRange, mondayOf, shiftDay, lastNBusinessDays } from '../lib/dates'
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

function DateRangeFilter({ start, end, setStart, setEnd }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="From">
        <input type="date" className={inputClass()} value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label="To">
        <input type="date" className={inputClass()} value={end} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      {(start || end) && (
        <button
          onClick={() => {
            setStart('')
            setEnd('')
          }}
          className="pb-2 font-sans text-sm text-fg-secondary underline-offset-2 hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  )
}

function weekdayLabel(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
}

// Prompt 506 — "0-10"/"0-2" in the caption text was the only scale
// information this chart ever gave; there was no way to read an actual
// data point's value off the chart itself. `niceTicks` picks round,
// human-readable tick values (1/2/5 × a power of ten, the standard
// axis-tick heuristic) rather than dividing the raw max into N equal
// slices, which would produce ugly ticks like "0, 3.67, 7.33, 11".
function niceTicks(max, count = 4) {
  if (max <= 0) return [0]
  const rawStep = max / (count - 1)
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  const step = niceNorm * mag
  const ticks = []
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v))
  return [...new Set(ticks)]
}

// Prompt 516 — grouped bar chart, one shared Y-axis for both series (was
// two independent-scale lines, Prompt 450). Dials and bookings are
// naturally very different magnitudes (e.g. 150 dials vs. 2 bookings/day)
// so the bookings bar reads small next to the dials bar on a shared
// axis — that's an accurate picture of the real ratio, not something to
// rescale away. Axis max comes from `niceTicks` over both series at once
// (not each series' own max) so there's exactly one scale to read.
function WeeklyBarChart({ days }) {
  const W = 600
  const H = 200
  const padX = 34
  const padY = 24
  const maxVal = Math.max(1, ...days.map((d) => Math.max(d.dials, d.bookings)))
  const ticks = niceTicks(maxVal)
  const axisMax = ticks[ticks.length - 1] || 1
  const yFor = (v) => H - padY - (v / axisMax) * (H - padY * 2)
  const groupWidth = days.length > 0 ? (W - padX * 2) / days.length : 0
  const groupPad = groupWidth * 0.18
  const barGap = 3
  const barWidth = Math.max(1, (groupWidth - groupPad * 2 - barGap) / 2)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        {ticks.map((t) => (
          <g key={`tick-${t}`}>
            <line x1={padX} y1={yFor(t)} x2={W - padX} y2={yFor(t)} className="stroke-line" strokeWidth="1" opacity={t === 0 ? 1 : 0.5} />
            <text x={padX - 6} y={yFor(t)} dy="3.5" textAnchor="end" fontSize="10" className="fill-fg-faint">{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const groupX = padX + i * groupWidth
          const dialsX = groupX + groupPad
          const bookingsX = dialsX + barWidth + barGap
          return (
            <g key={d.date}>
              <rect x={dialsX} y={yFor(d.dials)} width={barWidth} height={Math.max(0, H - padY - yFor(d.dials))} rx="2" className="fill-accent">
                <title>{d.label}: {d.dials} dials</title>
              </rect>
              <rect x={bookingsX} y={yFor(d.bookings)} width={barWidth} height={Math.max(0, H - padY - yFor(d.bookings))} rx="2" className="fill-success">
                <title>{d.label}: {d.bookings} bookings</title>
              </rect>
              <text x={groupX + groupWidth / 2} y={H - 6} textAnchor="middle" fontSize="11" className="fill-fg-faint">{d.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 font-sans text-xs text-fg-faint">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" /> Dials</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> Bookings</span>
        <span>Shared scale — 0–{axisMax.toLocaleString()}</span>
      </div>
    </div>
  )
}

// White (0 dials) to the portal's own blue accent (PERFECT_DAY_DIALS,
// clamped) — Prompt 475: was gray-to-dark-gray, recolored to match the
// rest of the UI's color language (same accent used on Call buttons,
// selected filter chips, etc. — `--accent: #3a63d6` = rgb(58,99,214)).
// Same intensity math as before, just a different end color. Perfect Days
// override this entirely with solid green, per spec, regardless of where
// their dial count would otherwise land in the gradient.
//
// Prompt 502 — the "0 dials" anchor used to be hardcoded pure white,
// which reads as "empty card" against light mode's own white
// `--bg-elevated`, but the same white cell on a dark card would render as
// a near-white outlier instead of "empty" — breaking the low-to-high
// hierarchy the gradient exists to show. The fix is conceptual, not just
// a color swap: the anchor should always equal whatever `--bg-elevated`
// currently is, in either theme, so a 0-dial cell always reads as "same
// as the card behind it." Passed in from Stats() via useTheme() rather
// than read live from the DOM here, since this stays a plain function.
const HEATMAP_LOW_RGB = {
  light: [255, 255, 255], // matches light --bg-elevated (#ffffff) exactly
  dark: [26, 36, 32], // matches dark --bg-elevated (#1a2420) exactly
}

function dialColor(dials, lowRgb) {
  const pct = Math.min(1, dials / PERFECT_DAY_DIALS)
  const end = [58, 99, 214]
  const rgb = lowRgb.map((s, i) => Math.round(s + (end[i] - s) * pct))
  return `rgb(${rgb.join(',')})`
}

function ActivityHeatmap({ days, lowRgb }) {
  return (
    <div>
      {/* Prompt 516: 5 columns, not 7 — days are now business days only, so
          each row is one Mon-Fri work week rather than a calendar week
          with two guaranteed-empty weekend cells padding it out. */}
      <div className="grid grid-cols-5 gap-1.5">
        {days.map((d) => {
          const perfect = isPerfectDay(d)
          return (
            <div
              key={d.date}
              title={`${d.date} — ${d.dials} dials, ${d.bookings} bookings${perfect ? ' · Perfect Day' : ''}`}
              className="aspect-square rounded-md border border-line"
              style={{ background: perfect ? 'var(--success)' : dialColor(d.dials, lowRgb) }}
            />
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 font-sans text-xs text-fg-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-success" /> Perfect Day (150 dials + 2 bookings)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-line" style={{ background: dialColor(75, lowRgb) }} /> Dial volume
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
// (PERFECT_DAY_DIALS = 150 dials/day) — 70-159 dials, 0-3 bookings, never
// flatlined at zero. UI-only: never written to the database, never touches
// `calls`/`leads` — see Stats() below, gated to exactly one account.
function mockDayStats(dateStr) {
  const rand = seededRandom(dateStr)
  const dials = 70 + Math.floor(rand() * 90)
  const bookings = Math.min(dials, Math.floor(rand() * 4))
  return { dials, bookings }
}

function mockDays(dateList) {
  return dateList.map((date) => ({ date, ...mockDayStats(date) }))
}

export default function Stats() {
  const { profile } = useAuth()
  const { resolvedTheme } = useTheme()
  const heatmapLowRgb = HEATMAP_LOW_RGB[resolvedTheme]
  const { data: leads, isLoading } = useAllLeadsForStats()
  const { data: reps } = useReps()
  const { data: allCalls } = useMyAllCalls(profile?.id)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const tz = profile?.timezone || DEFAULT_TIMEZONE
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

  // Prompt 458: the date-range picker's plain YYYY-MM-DD values are
  // interpreted as calendar days in the VIEWING user's own timezone
  // before querying — "Aug 17" means Aug 17 where I am, not UTC Aug 17.
  // Empty stays empty (no filter = all-time), same as before.
  const myStats = useMemo(() => {
    if (!leads) return null
    const zStart = start ? zonedDayRange(start, tz).start : ''
    const zEnd = end ? zonedDayRange(end, tz).end : ''
    return isCloser ? statsForCloser(leads, profile.id, zStart, zEnd) : statsForUser(leads, profile.id, zStart, zEnd)
  }, [leads, profile, start, end, tz, isCloser])

  // Prompt 458: per Brayden's answer, each rep's row uses THAT rep's own
  // saved timezone to resolve the same picked date range — not the
  // viewing admin's — so "Aug 17" means Aug 17 in each rep's own zone,
  // per row, even though every row shares the same nominal date picker.
  const rollup = useMemo(() => {
    if (!leads) return null
    const setters = (reps || []).filter((r) => r.role === 'setter')
    const closers = (reps || []).filter((r) => r.role === 'closer')
    const rangeFor = (repTz) => ({
      start: start ? zonedDayRange(start, repTz || DEFAULT_TIMEZONE).start : '',
      end: end ? zonedDayRange(end, repTz || DEFAULT_TIMEZONE).end : '',
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
  }, [leads, reps, start, end])

  if (isLoading) {
    return <p className="font-sans text-sm text-fg-secondary">Loading…</p>
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Stats</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">
        {isAdmin ? 'Team performance' : 'Your performance'}
      </p>

      <div className="mt-6">
        <DateRangeFilter start={start} end={end} setStart={setStart} setEnd={setEnd} />
      </div>

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
              <ActivityHeatmap days={heatmapDays} lowRgb={heatmapLowRgb} />
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
