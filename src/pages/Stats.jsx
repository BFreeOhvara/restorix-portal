import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useAllLeadsForStats, useReps, statsForUser, statsForCloser } from '../hooks/useStats'
import { useMyAllCalls, groupCallsByDay, isPerfectDay, PERFECT_DAY_DIALS } from '../hooks/useBadges'
import { Field, inputClass } from '../components/ui/Field'
import { WeekPaginator } from '../components/ui/WeekPaginator'
import { todayUTCStr, mondayOf, shiftDay } from '../lib/dates'

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

// Prompt 450 — dials (0–150+/day) and bookings (0–5/day) plotted on
// independent y-scales, each normalized to its own week max. A shared
// linear axis would flatten the bookings line to near-zero next to
// dials — not specified either way, but any faithful rendering of "two
// lines" needs to solve this, so calling it out rather than a silent
// choice.
function WeeklyLineChart({ days }) {
  const W = 600
  const H = 200
  const padX = 30
  const padY = 24
  const maxDials = Math.max(1, ...days.map((d) => d.dials))
  const maxBookings = Math.max(1, ...days.map((d) => d.bookings))
  const stepX = days.length > 1 ? (W - padX * 2) / (days.length - 1) : 0
  const xFor = (i) => padX + i * stepX
  const yForDials = (v) => H - padY - (v / maxDials) * (H - padY * 2)
  const yForBookings = (v) => H - padY - (v / maxBookings) * (H - padY * 2)
  const dialsPoints = days.map((d, i) => `${xFor(i)},${yForDials(d.dials)}`).join(' ')
  const bookingsPoints = days.map((d, i) => `${xFor(i)},${yForBookings(d.bookings)}`).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} className="stroke-line" strokeWidth="1" />
        <polyline points={dialsPoints} className="fill-none stroke-accent" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={bookingsPoints} className="fill-none stroke-success" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {days.map((d, i) => (
          <g key={d.date}>
            <circle cx={xFor(i)} cy={yForDials(d.dials)} r="3.5" className="fill-accent">
              <title>{d.label}: {d.dials} dials</title>
            </circle>
            <circle cx={xFor(i)} cy={yForBookings(d.bookings)} r="3.5" className="fill-success">
              <title>{d.label}: {d.bookings} bookings</title>
            </circle>
            <text x={xFor(i)} y={H - 6} textAnchor="middle" fontSize="11" className="fill-fg-faint">{d.label}</text>
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 font-sans text-xs text-fg-faint">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" /> Dials</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> Bookings</span>
        <span>Independent scales — dials 0–{maxDials.toLocaleString()}, bookings 0–{maxBookings.toLocaleString()}</span>
      </div>
    </div>
  )
}

// White (0 dials) to dark gray (PERFECT_DAY_DIALS, clamped) — Perfect
// Days override this entirely with solid green, per spec, regardless of
// where their dial count would otherwise land in the gradient.
function dialGrayColor(dials) {
  const pct = Math.min(1, dials / PERFECT_DAY_DIALS)
  const start = [255, 255, 255]
  const end = [55, 65, 81]
  const rgb = start.map((s, i) => Math.round(s + (end[i] - s) * pct))
  return `rgb(${rgb.join(',')})`
}

function ActivityHeatmap({ days }) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const perfect = isPerfectDay(d)
          return (
            <div
              key={d.date}
              title={`${d.date} — ${d.dials} dials, ${d.bookings} bookings${perfect ? ' · Perfect Day' : ''}`}
              className="aspect-square rounded-md border border-line"
              style={{ background: perfect ? 'var(--success)' : dialGrayColor(d.dials) }}
            />
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 font-sans text-xs text-fg-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-success" /> Perfect Day (150 dials + 2 bookings)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-line" style={{ background: dialGrayColor(75) }} /> Dial volume
        </span>
      </div>
    </div>
  )
}

export default function Stats() {
  const { profile } = useAuth()
  const { data: leads, isLoading } = useAllLeadsForStats()
  const { data: reps } = useReps()
  const { data: allCalls } = useMyAllCalls(profile?.id)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [weekMonday, setWeekMonday] = useState(() => mondayOf(todayUTCStr()))

  const isAdmin = profile?.role === 'admin'
  const isCloser = profile?.role === 'closer'

  // Prompt 450: line chart + heatmap, setter/admin only — closers don't
  // dial, same scoping precedent as the badge row on My Goals ("closers
  // don't make calls, so a call-volume goal doesn't apply to them").
  const byDay = useMemo(() => groupCallsByDay(allCalls || []), [allCalls])

  const weekDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const date = shiftDay(weekMonday, i)
      return { date, label: weekdayLabel(date), ...(byDay.get(date) || { dials: 0, bookings: 0 }) }
    })
  }, [weekMonday, byDay])

  const heatmapDays = useMemo(() => {
    const today = todayUTCStr()
    return Array.from({ length: 21 }, (_, i) => {
      const date = shiftDay(today, i - 20)
      return { date, ...(byDay.get(date) || { dials: 0, bookings: 0 }) }
    })
  }, [byDay])

  const myStats = useMemo(() => {
    if (!leads) return null
    return isCloser ? statsForCloser(leads, profile.id, start, end) : statsForUser(leads, profile.id, start, end)
  }, [leads, profile, start, end, isCloser])

  const rollup = useMemo(() => {
    if (!leads) return null
    const setters = (reps || []).filter((r) => r.role === 'setter')
    const closers = (reps || []).filter((r) => r.role === 'closer')
    return {
      setters: setters.map((s) => ({ ...s, ...statsForUser(leads, s.id, start, end) })),
      closers: closers.map((c) => ({ ...c, ...statsForCloser(leads, c.id, start, end) })),
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
              <WeekPaginator monday={weekMonday} onChange={setWeekMonday} />
            </div>
            <div className="mt-3 rounded-card border border-line bg-elevated p-5">
              <WeeklyLineChart days={weekDays} />
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg font-medium text-fg-primary">Last 21 Days</h2>
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
