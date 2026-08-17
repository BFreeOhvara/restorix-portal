import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, PhoneCall, CalendarCheck, Sun, DollarSign, Flame, Trophy } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useAllLeadsForStats, statsForUser } from '../hooks/useStats'
import { useMyAllCalls, computeBadgeProgress, tieredProgress, DIAL_TIERS, BOOKING_TIERS, PERFECT_DAY_TIERS, COMMISSION_TIERS } from '../hooks/useBadges'
import { todayUTCStr, mondayOf } from '../lib/dates'

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

function firstOfThisMonth() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

function rangeForPeriod(period) {
  const today = todayUTCStr()
  if (period === 'daily') return { start: today, end: today }
  if (period === 'weekly') return { start: mondayOf(today), end: today }
  return { start: toDateStr(firstOfThisMonth()), end: today }
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

// Prompt 452: consolidated from 4 separate cards + 2 floating description
// cards into one box with labeled rows, achievement-panel styling — the
// badge itself (real icon, not a generic Award glyph) carries the
// unlocked/locked state via color/glow vs. grayscale, rather than a
// separate lock icon doing all the work. Locked pills keep the same real
// icon desaturated (how console achievement panels show a locked trophy —
// a silhouette of the real thing, not a padlock standing in for it).
function BadgePill({ icon: Icon, label, unlocked, title }) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-xs font-semibold transition-all',
        unlocked
          ? 'bg-gradient-to-br from-[#26b37a] to-[#1f8a5f] text-white shadow-[0_0_0_1px_rgba(31,138,95,0.35),0_3px_10px_rgba(31,138,95,0.45)]'
          : 'bg-surface text-fg-faint grayscale'
      )}
    >
      <Icon size={13} />
      {label}
    </span>
  )
}

function BadgeSection({ icon: Icon, title, sub, value, thresholds, format = (n) => n.toLocaleString(), first }) {
  const { next } = tieredProgress(value, thresholds)
  return (
    <div className={clsx('py-5', !first && 'border-t border-line')}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">{title}</p>
        <p className="font-sans text-xs text-fg-faint">
          {format(value)} all-time{next != null ? ` · ${format(next - value)} to next` : ' · all tiers earned'}
        </p>
      </div>
      {sub && <p className="mt-1 font-sans text-xs text-fg-faint">{sub}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {thresholds.map((t) => (
          <BadgePill key={t} icon={Icon} label={format(t)} unlocked={value >= t} />
        ))}
      </div>
    </div>
  )
}

// Special: Back-to-Back + Hat Trick, previously two standalone
// card-with-description blocks floating outside any box — now a row
// inside the same box, same in-box pill treatment as every other
// category. Each pill's own condition moves to a hover title instead of
// a permanent description line, to actually match the other rows' density.
function SpecialSection({ items }) {
  const earnedCount = items.filter((i) => i.unlocked).length
  return (
    <div className="border-t border-line py-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Special</p>
        <p className="font-sans text-xs text-fg-faint">{earnedCount}/{items.length} earned</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <BadgePill key={item.label} icon={item.icon} label={item.label} unlocked={item.unlocked} title={item.title} />
        ))}
      </div>
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

          <div className="mt-3 rounded-card border border-line bg-elevated px-5">
            <BadgeSection icon={PhoneCall} title="Dials" value={badgeProgress.dials} thresholds={DIAL_TIERS} first />
            <BadgeSection icon={CalendarCheck} title="Bookings" value={badgeProgress.bookings} thresholds={BOOKING_TIERS} />
            <BadgeSection
              icon={Sun}
              title="Perfect Days"
              sub="150 dials + 2 bookings in the same day"
              value={badgeProgress.perfectDays}
              thresholds={PERFECT_DAY_TIERS}
            />
            <BadgeSection
              icon={DollarSign}
              title="Commission"
              sub="Not live yet — Restorix has no comp structure defined, so this always reads $0 honestly rather than a fabricated number"
              value={0}
              thresholds={COMMISSION_TIERS}
              format={(n) => `$${n.toLocaleString()}`}
            />
            <SpecialSection
              items={[
                { icon: Flame, label: 'Back-to-Back', unlocked: badgeProgress.backToBack, title: '2 bookings in a row, no other outcome logged in between' },
                { icon: Trophy, label: 'Hat Trick', unlocked: badgeProgress.hatTrick, title: '3 bookings in the same day' },
              ]}
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
