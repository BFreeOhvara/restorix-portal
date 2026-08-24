import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, PhoneCall, CalendarCheck, Sun, DollarSign, Zap } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useAllLeadsForStats, statsForUser } from '../hooks/useStats'
import { useCommissionLeads } from '../hooks/useLeads'
import { useMyAllCalls, computeBadgeProgress, tieredProgress, DIAL_TIERS, BOOKING_TIERS, PERFECT_DAY_TIERS, COMMISSION_TIERS } from '../hooks/useBadges'
import { totalCommission } from '../lib/commissions'
import { zonedDateStr, zonedDayRange, mondayOf } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'
import { TierBadge } from '../components/ui/TierBadge'

// Prompt 518's locked color proposal, given real hex values here for the
// first time (the scoping doc only named colors — "amber/gold", "purple/
// violet" — not exact values). Dials gets a distinct emerald rather than
// reusing --success (already means "positive outcome" elsewhere); Bookings
// reuses the app's own real accent-blue hex directly. The other three are
// new to this codebase — picked from Tailwind's own default palette
// (emerald/amber/violet/orange) for values already vetted at reasonable
// saturation/contrast rather than invented from scratch.
const CATEGORY_COLORS = {
  dials: '#10b981',
  bookings: '#3a63d6',
  perfectDays: '#f59e0b',
  commission: '#8b5cf6',
  special: '#f97316',
}

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
// of sync with the actual row. Icons used to differ per badge (Flame/
// Trophy) — Prompt 521's rebuild gives Special one shared glyph (Zap)
// like every other category, real names/descriptions stay as real text.
const SPECIAL_BADGES = [
  { key: 'backToBack', label: 'Back-to-Back', title: '2 bookings in a row, no other outcome logged in between' },
  { key: 'hatTrick', label: 'Hat Trick', title: '3 bookings in the same day' },
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

// Prompt 452 established the locked/unlocked philosophy (grayscale
// silhouette vs. color+glow, no separate lock icon). Prompt 521's rebuild
// (2026-08-24) replaced the flat icon+label pill AND the illustrated
// per-tier PNG art with one shared `TierBadge` SVG shield, driven by a
// runtime `color` — since the color varies per category/tier, the glow/
// border/gradient chrome around it has to be inline `style`, not a
// Tailwind arbitrary-value class (those need a static string for the
// build-time JIT scanner, which a runtime hex can't provide). `w-40`
// (was `w-28` on the old pill/PNG tiles) per Brayden's own "too narrow"
// feedback on the live PNG version.
function BadgeTile({ icon, tier, maxTier, label, sub, color, unlocked }) {
  return (
    <div
      title={sub ? `${label} — ${sub}` : label}
      className={clsx(
        'flex w-40 flex-col items-center gap-2 rounded-card border p-3 text-center transition-all',
        !unlocked && 'border-line bg-surface'
      )}
      style={
        unlocked
          ? {
              borderColor: `${color}4D`,
              backgroundImage: `linear-gradient(to bottom, ${color}1A, transparent)`,
              boxShadow: `0 0 16px ${color}4D`,
            }
          : undefined
      }
    >
      <TierBadge icon={icon} tier={tier} maxTier={maxTier} color={color} unlocked={unlocked} size={88} />
      <div>
        <p className={clsx('font-sans text-xs font-semibold', unlocked ? 'text-fg-primary' : 'text-fg-faint')}>{label}</p>
        {sub && <p className="font-sans text-[11px] text-fg-faint">{sub}</p>}
      </div>
    </div>
  )
}

// One row per tiered category (Dials/Bookings/Perfect Days/Commission) —
// same shield template, same escalation logic, just a different icon/
// color/tier array per category. Tier "names" are the plain ordinal
// ("Tier 1"..."Tier N") since no named scheme (Bronze/Silver/etc.) exists
// anywhere in this codebase or the earlier art-generation docs.
function TierBadgeRow({ icon, title, sub, color, value, thresholds, format = (n) => n.toLocaleString(), first }) {
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
      <div className="mt-3 flex flex-wrap gap-3">
        {thresholds.map((t, i) => (
          <BadgeTile
            key={t}
            icon={icon}
            tier={i + 1}
            maxTier={thresholds.length}
            label={`Tier ${i + 1}`}
            sub={format(t)}
            color={color}
            unlocked={value >= t}
          />
        ))}
      </div>
    </div>
  )
}

// Special: Back-to-Back + Hat Trick aren't a shared numeric threshold like
// the other 4 categories — each is its own independent boolean condition —
// but the prompt's own "Special (2 tiers, lightning-bolt icon)" framing
// asked for the same shield treatment, so each badge is treated as its own
// "tier" of a 2-tier category sharing one icon/color, real names kept as
// real text instead of forcing them into "Tier 1"/"Tier 2".
function SpecialBadgeRow({ icon, color, items }) {
  const earnedCount = items.filter((i) => i.unlocked).length
  return (
    <div className="border-t border-line py-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Special</p>
        <p className="font-sans text-xs text-fg-faint">{earnedCount}/{items.length} earned</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {items.map((item, i) => (
          <BadgeTile
            key={item.key}
            icon={icon}
            tier={i + 1}
            maxTier={items.length}
            label={item.label}
            sub={item.title}
            color={color}
            unlocked={item.unlocked}
          />
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
            <TierBadgeRow icon={PhoneCall} title="Dials" color={CATEGORY_COLORS.dials} value={badgeProgress.dials} thresholds={DIAL_TIERS} first />
            <TierBadgeRow icon={CalendarCheck} title="Bookings" color={CATEGORY_COLORS.bookings} value={badgeProgress.bookings} thresholds={BOOKING_TIERS} />
            <TierBadgeRow
              icon={Sun}
              title="Perfect Days"
              sub="150 dials + 2 bookings in the same day"
              color={CATEGORY_COLORS.perfectDays}
              value={badgeProgress.perfectDays}
              thresholds={PERFECT_DAY_TIERS}
            />
            <TierBadgeRow
              icon={DollarSign}
              title="Commission"
              sub="15% of setup fee + first month, paid once a deal you booked reaches Closed"
              color={CATEGORY_COLORS.commission}
              value={myCommission}
              thresholds={COMMISSION_TIERS}
              format={(n) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
            <SpecialBadgeRow
              icon={Zap}
              color={CATEGORY_COLORS.special}
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
