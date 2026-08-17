import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Award, ArrowRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useAllLeadsForStats, statsForUser, badgesForCount, BADGE_TIERS } from '../hooks/useStats'

// Hardcoded v1 target (Prompt 442) — a real per-rep quota system is out of
// scope for now; Brayden gave concrete numbers instead: 150 calls + 2 booked
// appointments = a "perfect day."
const CALLS_TARGET = 150
const BOOKED_TARGET = 2

function ProgressTile({ label, value, target }) {
  const pct = Math.min(100, Math.round((value / target) * 100))
  return (
    <div className="rounded-card border border-line bg-elevated p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-3xl font-medium text-fg-primary">
        {value} <span className="text-lg font-normal text-fg-faint">/ {target}</span>
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Moved here from Stats.jsx (Prompt 442) — Stats keeps the historical
// date-range KPI view; My Goals owns the daily-target + badges framing.
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
      <p className="mt-3 font-sans text-xs text-fg-faint">
        {BADGE_TIERS.map((t) => t.label).join(' · ')}, based on all-time booked calls.
      </p>
    </div>
  )
}

export default function MyGoals() {
  const { profile } = useAuth()
  const { data: leads, isLoading } = useAllLeadsForStats()
  const todayStr = new Date().toISOString().split('T')[0]

  const today = useMemo(() => {
    if (!leads) return { logged: 0, booked: 0 }
    return statsForUser(leads, profile.id, todayStr, todayStr)
  }, [leads, profile.id, todayStr])

  const allTimeBooked = useMemo(() => {
    if (!leads) return 0
    return statsForUser(leads, profile.id).booked
  }, [leads, profile.id])

  const isPerfectDay = today.logged >= CALLS_TARGET && today.booked >= BOOKED_TARGET

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">My Goals</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">Today's progress toward a perfect day</p>

      {isLoading ? (
        <p className="mt-6 font-sans text-sm text-fg-secondary">Loading…</p>
      ) : (
        <>
          {isPerfectDay && (
            <div className="mt-4 rounded-card border border-success/30 bg-success/10 px-4 py-3 font-sans text-sm font-medium text-success">
              Perfect day — {CALLS_TARGET} calls and {BOOKED_TARGET} booked appointments, both hit today.
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ProgressTile label="Calls Made Today" value={today.logged} target={CALLS_TARGET} />
            <ProgressTile label="Booked Today" value={today.booked} target={BOOKED_TARGET} />
          </div>

          <div className="mt-4">
            <BadgeRow bookedCount={allTimeBooked} />
          </div>

          <Link
            to="/commissions"
            className="mt-4 inline-flex items-center gap-1.5 font-sans text-sm text-accent hover:underline"
          >
            See how this translates to pay <ArrowRight size={14} />
          </Link>
        </>
      )}
    </div>
  )
}
