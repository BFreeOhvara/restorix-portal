import { useMemo, useState } from 'react'
import { Award } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useAllLeadsForStats, useReps, statsForUser, statsForCloser, badgesForCount, BADGE_TIERS } from '../hooks/useStats'
import { Field, inputClass } from '../components/ui/Field'

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-card border border-line bg-elevated p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-3xl font-medium text-fg-primary">{value}</p>
      {sub && <p className="mt-1 font-sans text-xs text-fg-faint">{sub}</p>}
    </div>
  )
}

function BadgeRow({ bookedCount }) {
  const { earned, next } = badgesForCount(bookedCount)
  return (
    <div className="rounded-card border border-line bg-elevated p-5">
      <p className="eyebrow">Badges</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {earned.length === 0 && !next && (
          <p className="font-sans text-sm text-fg-secondary">No badges yet.</p>
        )}
        {earned.map((b) => (
          <span
            key={b.threshold}
            className="eyebrow inline-flex items-center gap-1.5 rounded-full bg-[#dcf3e6] px-3 py-1.5 !text-success"
          >
            <Award size={12} /> {b.label}
          </span>
        ))}
        {next && (
          <span className="eyebrow inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 !text-fg-faint">
            <Award size={12} /> {bookedCount}/{next.threshold} to {next.label}
          </span>
        )}
      </div>
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

export default function Stats() {
  const { profile } = useAuth()
  const { data: leads, isLoading } = useAllLeadsForStats()
  const { data: reps } = useReps()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const isAdmin = profile?.role === 'admin'
  const isCloser = profile?.role === 'closer'

  const myStats = useMemo(() => {
    if (!leads) return null
    return isCloser ? statsForCloser(leads, profile.id, start, end) : statsForUser(leads, profile.id, start, end)
  }, [leads, profile, start, end, isCloser])

  const myAllTimeBooked = useMemo(() => {
    if (!leads || isCloser) return 0
    return statsForUser(leads, profile.id).booked
  }, [leads, profile, isCloser])

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
        <div className="mt-4">
          <BadgeRow bookedCount={myAllTimeBooked} />
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

      {!isCloser && (
        <p className="mt-6 font-sans text-xs text-fg-faint">
          Badges: {BADGE_TIERS.map((t) => t.label).join(' · ')}, based on all-time booked calls.
        </p>
      )}
    </div>
  )
}
