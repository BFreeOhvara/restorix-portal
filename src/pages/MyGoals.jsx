import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarCheck, Sun, DollarSign, Flame, Trophy } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useAllLeadsForStats, statsForUser } from '../hooks/useStats'
import { useCommissionLeads } from '../hooks/useLeads'
import { useMyAllCalls, computeBadgeProgress, tieredProgress, DIAL_TIERS, BOOKING_TIERS, PERFECT_DAY_TIERS, COMMISSION_TIERS } from '../hooks/useBadges'
import { totalCommission } from '../lib/commissions'
import { zonedDateStr, zonedDayRange, mondayOf } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'

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

// Prompt 517 — named constant (was an inline array literal inside
// SpecialSection's own JSX call) so its `.length` can feed the X/26
// earned-count total below without a second hardcoded "2" drifting out
// of sync with the actual row.
const SPECIAL_BADGES = [
  { key: 'backToBack', icon: Flame, label: 'Back-to-Back', title: '2 bookings in a row, no other outcome logged in between' },
  { key: 'hatTrick', icon: Trophy, label: 'Hat Trick', title: '3 bookings in the same day' },
]

// Prompt 458: "today"/"this week"/"this month" now follow the viewing
// user's own saved timezone instead of the UTC calendar day — daily/
// weekly/monthly all resolve to real instant bounds via zonedDayRange
// rather than bare UTC date strings.
function rangeForPeriod(period, tz) {
  const today = zonedDateStr(Date.now(), tz)
  if (period === 'daily') return zonedDayRange(today, tz)
  if (period === 'weekly') {
    const { start } = zonedDayRange(mondayOf(today), tz)
    const { end } = zonedDayRange(today, tz)
    return { start, end }
  }
  const firstOfMonth = `${today.slice(0, 7)}-01`
  const { start } = zonedDayRange(firstOfMonth, tz)
  const { end } = zonedDayRange(today, tz)
  return { start, end }
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

// Prompt 521 — Dials' own tile, replacing BadgePill's icon+label chip for
// this category now that real per-tier art exists (`badge-dials-tier1..6`,
// escalating ornamentation baked into each image — see Prompt 521's scope
// change from the original shared-icon + programmatic overlay plan). No
// ring/numeral is drawn on top; each image already IS the tier's full look.
// Keeps BadgePill's own locked/unlocked philosophy (Prompt 452: grayscale
// silhouette vs. color+glow) applied to the image instead of an icon glyph,
// and reuses the exact green BadgePill's unlocked gradient already uses
// (#26b37a/#1f8a5f) rather than inventing a second "success" color for the
// same badge system. No named tier scheme exists anywhere in this codebase
// or the art-generation docs, so tier names are the plain ordinal the
// asset filenames themselves already use ("Tier 1"..."Tier 6"), not
// invented lore — flag to Brayden if he had specific names in mind.
function DialBadgeTile({ tier, threshold, value }) {
  const unlocked = value >= threshold
  return (
    <div
      title={`Tier ${tier} — ${threshold.toLocaleString()} total dials`}
      className={clsx(
        'flex w-28 flex-col items-center gap-2 rounded-card border p-3 text-center transition-all',
        unlocked
          ? 'border-[#1f8a5f]/30 bg-gradient-to-b from-[#1f8a5f]/10 to-transparent shadow-[0_0_16px_rgba(31,138,95,0.3)]'
          : 'border-line bg-surface'
      )}
    >
      <img
        src={`/badges/badge-dials-tier${tier}.png`}
        alt={`Dials Tier ${tier} badge`}
        className={clsx('h-14 w-auto', !unlocked && 'grayscale opacity-35')}
      />
      <div>
        <p className={clsx('font-sans text-xs font-semibold', unlocked ? 'text-fg-primary' : 'text-fg-faint')}>
          Tier {tier}
        </p>
        <p className="font-sans text-[11px] text-fg-faint">{threshold.toLocaleString()} dials</p>
      </div>
    </div>
  )
}

function DialsBadgeSection({ value, thresholds, first }) {
  const { next } = tieredProgress(value, thresholds)
  return (
    <div className={clsx('py-5', !first && 'border-t border-line')}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Dials</p>
        <p className="font-sans text-xs text-fg-faint">
          {value.toLocaleString()} all-time{next != null ? ` · ${(next - value).toLocaleString()} to next` : ' · all tiers earned'}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {thresholds.map((t, i) => (
          <DialBadgeTile key={t} tier={i + 1} threshold={t} value={value} />
        ))}
      </div>
    </div>
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
  const { data: commissionLeads } = useCommissionLeads()
  const [period, setPeriod] = useState('daily')

  const isLoading = leadsLoading || callsLoading
  const tz = profile?.timezone || DEFAULT_TIMEZONE

  const periodStats = useMemo(() => {
    if (!leads) return { logged: 0, booked: 0 }
    const { start, end } = rangeForPeriod(period, tz)
    return statsForUser(leads, profile.id, start, end)
  }, [leads, profile?.id, period, tz])

  const badgeProgress = useMemo(() => {
    if (!calls) return { dials: 0, bookings: 0, perfectDays: 0, backToBack: false, hatTrick: false }
    return computeBadgeProgress(calls, tz)
  }, [calls, tz])

  // Prompt 468: real commission total now that a comp structure exists —
  // was hardcoded to 0 with an "honest placeholder" note before this.
  const myCommission = useMemo(() => {
    if (!commissionLeads || !profile?.id) return 0
    return totalCommission(commissionLeads.filter((l) => l.last_action_by === profile.id))
  }, [commissionLeads, profile?.id])

  // Prompt 517 — X/26 earned-count next to the Badges heading. Driven by
  // the exact same tier arrays and threshold logic (`tieredProgress`) the
  // rows below already render from, plus SPECIAL_BADGES' own length for
  // the two non-tiered badges — nothing here is a separately-hardcoded
  // "26," so it can't silently drift if a tier list or SPECIAL_BADGES
  // ever changes size.
  const badgeTotals = useMemo(() => {
    const tieredEarned =
      tieredProgress(badgeProgress.dials, DIAL_TIERS).earned.length +
      tieredProgress(badgeProgress.bookings, BOOKING_TIERS).earned.length +
      tieredProgress(badgeProgress.perfectDays, PERFECT_DAY_TIERS).earned.length +
      tieredProgress(myCommission, COMMISSION_TIERS).earned.length
    const specialEarned = SPECIAL_BADGES.filter((b) => badgeProgress[b.key]).length
    const total = DIAL_TIERS.length + BOOKING_TIERS.length + PERFECT_DAY_TIERS.length + COMMISSION_TIERS.length + SPECIAL_BADGES.length
    return { earned: tieredEarned + specialEarned, total }
  }, [badgeProgress, myCommission])

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

          <div className="mt-6 flex items-baseline justify-between gap-3">
            <p className="eyebrow">Badges — all-time, not affected by the toggle above</p>
            <p className="font-sans text-sm font-semibold text-accent">{badgeTotals.earned}/{badgeTotals.total}</p>
          </div>

          <div className="mt-3 rounded-card border border-line bg-elevated px-5">
            <DialsBadgeSection value={badgeProgress.dials} thresholds={DIAL_TIERS} first />
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
              sub="15% of setup fee + first month, paid once a deal you booked reaches Closed"
              value={myCommission}
              thresholds={COMMISSION_TIERS}
              format={(n) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
            <SpecialSection
              items={SPECIAL_BADGES.map((b) => ({ ...b, unlocked: badgeProgress[b.key] }))}
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
