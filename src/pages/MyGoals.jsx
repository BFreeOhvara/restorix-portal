import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, Lock, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useAllLeadsForStats, statsForUser } from '../hooks/useStats'
import { useMyAllCalls, computeBadgeProgress, tieredProgress, DIAL_TIERS, BOOKING_TIERS, PERFECT_DAY_TIERS, COMMISSION_TIERS } from '../hooks/useBadges'

// v1 daily target is hardcoded (150 dials / 2 booked = "perfect day"),
// weekly/monthly are that same target scaled to a 5-day work week and a
// ~21.7-working-day month (Brayden's call — setters aren't expected to
// dial weekends, so the goalpost reflects actual working days, not raw
// calendar days) rather than a straight x7/x30 multiplication.
const PERIODS = {
  daily: { label: 'Daily', noun: 'Today', callsTarget: 150, bookedTarget: 2 },
  weekly: { label: 'Weekly', noun: 'This Week', callsTarget: 750, bookedTarget: 10 },
  monthly: { label: 'Monthly', noun: 'This Month', callsTarget: 3255, bookedTarget: 43 },
}

function todayUTC() {
  return new Date().toISOString().split('T')[0]
}

function mondayOfThisWeek() {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun..6=Sat
  const offset = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() + offset)
  return monday
}

function firstOfThisMonth() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

function rangeForPeriod(period) {
  if (period === 'daily') return { start: todayUTC(), end: todayUTC() }
  if (period === 'weekly') return { start: toDateStr(mondayOfThisWeek()), end: todayUTC() }
  return { start: toDateStr(firstOfThisMonth()), end: todayUTC() }
}

function ProgressTile({ label, value, target }) {
  const pct = Math.min(100, Math.round((value / target) * 100))
  return (
    <div className="rounded-card border border-line bg-elevated p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-3xl font-medium text-fg-primary">
        {value} <span className="text-lg font-normal text-fg-faint">/ {target.toLocaleString()}</span>
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function BadgeCategory({ title, sub, value, thresholds, format = (n) => n.toLocaleString() }) {
  const { next } = tieredProgress(value, thresholds)
  return (
    <div className="rounded-card border border-line bg-elevated p-5">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">{title}</p>
        <p className="font-sans text-xs text-fg-faint">
          {format(value)} all-time{next != null ? ` · ${format(next - value)} to next` : ' · all tiers earned'}
        </p>
      </div>
      {sub && <p className="mt-1 font-sans text-xs text-fg-faint">{sub}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {thresholds.map((t) => {
          const isEarned = value >= t
          return (
            <span
              key={t}
              className={clsx(
                'eyebrow inline-flex items-center gap-1.5 rounded-full px-3 py-1.5',
                isEarned ? 'bg-[#dcf3e6] !text-success' : 'bg-surface !text-fg-faint'
              )}
            >
              {isEarned ? <Award size={12} /> : <Lock size={11} />} {format(t)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function SpecialBadge({ label, sub, achieved }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3">
      <div>
        <p className="font-sans text-sm font-medium text-fg-primary">{label}</p>
        <p className="font-sans text-xs text-fg-faint">{sub}</p>
      </div>
      <span
        className={clsx(
          'eyebrow inline-flex items-center gap-1.5 rounded-full px-3 py-1.5',
          achieved ? 'bg-[#dcf3e6] !text-success' : 'bg-elevated !text-fg-faint'
        )}
      >
        {achieved ? <Award size={12} /> : <Lock size={11} />} {achieved ? 'Earned' : 'Not yet'}
      </span>
    </div>
  )
}

export default function MyGoals() {
  const { profile } = useAuth()
  const { data: leads, isLoading: leadsLoading } = useAllLeadsForStats()
  const { data: calls, isLoading: callsLoading } = useMyAllCalls(profile?.id)
  const [period, setPeriod] = useState('daily')

  const isLoading = leadsLoading || callsLoading

  const periodStats = useMemo(() => {
    if (!leads) return { logged: 0, booked: 0 }
    const { start, end } = rangeForPeriod(period)
    return statsForUser(leads, profile.id, start, end)
  }, [leads, profile?.id, period])

  const badgeProgress = useMemo(() => {
    if (!calls) return { dials: 0, bookings: 0, perfectDays: 0, backToBack: false, hatTrick: false }
    return computeBadgeProgress(calls)
  }, [calls])

  const target = PERIODS[period]
  const isPerfectDay = period === 'daily' && periodStats.logged >= target.callsTarget && periodStats.booked >= target.bookedTarget

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">My Goals</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">Progress toward a perfect day</p>

      {isLoading ? (
        <p className="mt-6 font-sans text-sm text-fg-secondary">Loading…</p>
      ) : (
        <>
          {isPerfectDay && (
            <div className="mt-4 rounded-card border border-success/30 bg-success/10 px-4 py-3 font-sans text-sm font-medium text-success">
              Perfect day — {target.callsTarget} calls and {target.bookedTarget} booked appointments, both hit today.
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <p className="eyebrow">{target.label} progress</p>
            <div className="flex gap-1 rounded-full border border-line bg-elevated p-1">
              {Object.entries(PERIODS).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => setPeriod(key)}
                  className={clsx(
                    'rounded-full px-3 py-1 font-sans text-xs font-medium transition-colors',
                    period === key ? 'bg-accent text-white' : 'text-fg-secondary hover:text-fg-primary'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ProgressTile label={`Calls Made ${target.noun}`} value={periodStats.logged} target={target.callsTarget} />
            <ProgressTile label={`Booked ${target.noun}`} value={periodStats.booked} target={target.bookedTarget} />
          </div>

          <p className="mt-6 eyebrow">Badges — all-time, not affected by the toggle above</p>

          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BadgeCategory title="Dials" value={badgeProgress.dials} thresholds={DIAL_TIERS} />
            <BadgeCategory title="Bookings" value={badgeProgress.bookings} thresholds={BOOKING_TIERS} />
            <BadgeCategory
              title="Perfect Days"
              sub="150 dials + 2 bookings in the same day"
              value={badgeProgress.perfectDays}
              thresholds={PERFECT_DAY_TIERS}
            />
            <BadgeCategory
              title="Commission"
              sub="Not live yet — Restorix has no comp structure defined, so this always reads $0 honestly rather than a fabricated number"
              value={0}
              thresholds={COMMISSION_TIERS}
              format={(n) => `$${n.toLocaleString()}`}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SpecialBadge
              label="Back-to-Back"
              sub="2 bookings in a row, no other outcome logged in between"
              achieved={badgeProgress.backToBack}
            />
            <SpecialBadge
              label="Hat Trick"
              sub="3 bookings in the same day"
              achieved={badgeProgress.hatTrick}
            />
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
