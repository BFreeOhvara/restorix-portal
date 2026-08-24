import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
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
// of sync with the actual row. Icons used to differ per badge (Flame/
// Trophy), then briefly shared one glyph (Zap) across a flat SVG
// treatment — Prompt 521's final round gives each achievement its own
// real illustrated PNG art (see SpecialBadgeTile below) via `slug`,
// same as every tiered category now has; real names/descriptions stay
// as real text either way. Only these 2 achievements exist anywhere in
// this codebase — if a future one gets added without matching PNG art,
// it'll need its own slug + source file before it can render here.
const SPECIAL_BADGES = [
  { key: 'backToBack', slug: 'backtoback', label: 'Back-to-Back', title: '2 bookings in a row, no other outcome logged in between' },
  { key: 'hatTrick', slug: 'hattrick', label: 'Hat Trick', title: '3 bookings in the same day' },
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

// Prompt 521 — real per-tier illustrated PNG art for tiered categories
// (`badge-{category}-tier1..N`, escalating ornamentation baked into each
// image), replacing what used to be one shared SVG shield template for
// every category. Dials shipped first, then Bookings, then Perfect Days,
// then Commission — all four driven by this one `PngBadgeTile`/
// `PngBadgeSection` pair keyed off `category` rather than near-duplicate
// components each, since
// the only real per-category differences are the image path, the glow
// tint, the value formatter (plain numbers vs. Commission's `$` amounts
// — also drives the tile label unless `tileLabel` overrides it, like
// Dials' "N dials" suffix), the tier count (Perfect Days has 5,
// Commission has 7 — everyone else has 6; the map below drives `.map()`
// directly off each category's own `thresholds` array, nothing hardcodes
// a count), and an optional section-level sub-line (Perfect Days' "150
// dials + 2 bookings" and Commission's "15% of setup fee..." descriptions,
// same text `TierBadgeRow` used to render for them). No card/box
// wrapper — no border, background, or shadow on the outer div — just the
// badge floating free with its label; the "lights up when unlocked"
// effect is a `drop-shadow` glow on the image itself (Brayden's own
// explicit ask after seeing the boxed version live: the box was
// competing with the art instead of framing it). Locked state keeps the
// same grayscale/opacity-35 silhouette treatment (Prompt 452's
// philosophy) applied to the image directly. No named tier scheme exists
// anywhere in this codebase or the art-generation docs, so tier names
// are the plain ordinal the asset filenames themselves already use.
// Source PNGs are not a uniform canvas size — each tier's own
// width/height ratio is deliberately different (wider canvases for
// tiers whose wings/crown extend the artwork) specifically so scaling
// to a fixed CSS height renders every tier's shield at the same pixel
// size, rather than the shield shrinking on tiers with more surrounding
// ornamentation. Badge height 140px, `w-auto` so each tier keeps its own
// aspect ratio. Tile container shrink-wraps to each image's own rendered
// width (no fixed `w-*`, Prompt 521's 11th-reopen fix) with a tight
// `gap-2` and `flex-nowrap` so every tier stays on one row regardless of
// count, never wrapping, regardless of category.
//
// Glow colors are literal Tailwind arbitrary-value strings per category
// (not built from a runtime hex) so the JIT scanner can find them as
// plain text in this file — a dynamically-interpolated class name
// wouldn't be scannable. `SpecialBadgeTile` below uses the same pattern
// via its own `SPECIAL_GLOW` constant, since Special's PNG art round.
const PNG_BADGE_CATEGORIES = {
  dials: {
    title: 'Dials',
    // Recolored 2026-08-24: Dials' original green got reassigned to
    // Commission, so Dials moved to red (sampled from the new source
    // art) to stay visually distinct from it — asset swap + this one
    // color constant, no structural change.
    glow: 'drop-shadow-[0_0_10px_rgba(220,43,36,0.6)]',
    format: (n) => n.toLocaleString(),
    tileLabel: (n) => `${n.toLocaleString()} dials`,
  },
  bookings: {
    title: 'Bookings',
    glow: 'drop-shadow-[0_0_10px_rgba(58,99,214,0.6)]',
    format: (n) => n.toLocaleString(),
  },
  perfectDays: {
    // `slug` drives the asset filename (`badge-perfect-days-tier{N}.png`,
    // hyphenated to match the vault's own naming) — separate from the
    // object key since `category` prop values elsewhere in this file are
    // the camelCase keys `badgeProgress`/`tieredProgress` already use.
    slug: 'perfect-days',
    title: 'Perfect Days',
    glow: 'drop-shadow-[0_0_10px_rgba(245,158,11,0.6)]',
    format: (n) => n.toLocaleString(),
    sectionSub: '150 dials + 2 bookings in the same day',
  },
  commission: {
    slug: 'commission',
    title: 'Commission',
    // Was described as "the same green Dials uses" when this entry
    // was added — that's now historical only: Dials moved to red the
    // same day, so this hex (still `rgba(31,138,95,0.6)`) is Commission's
    // own green rather than a shared one, unchanged by Dials' recolor.
    glow: 'drop-shadow-[0_0_10px_rgba(31,138,95,0.6)]',
    format: (n) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    sectionSub: '15% of setup fee + first month, paid once a deal you booked reaches Closed',
  },
}

function PngBadgeTile({ category, tier, threshold, value }) {
  const meta = PNG_BADGE_CATEGORIES[category]
  const label = (meta.tileLabel || meta.format)(threshold)
  const unlocked = value >= threshold
  return (
    <div title={`Tier ${tier} — ${label}`} className="flex flex-col items-center gap-2 text-center">
      <img
        src={`/badges/badge-${meta.slug || category}-tier${tier}.png`}
        alt={`${meta.title} Tier ${tier} badge`}
        className={clsx('h-[140px] w-auto', unlocked ? meta.glow : 'grayscale opacity-35')}
      />
      <div>
        <p className={clsx('font-sans text-sm font-semibold', unlocked ? 'text-fg-primary' : 'text-fg-faint')}>
          Tier {tier}
        </p>
        <p className="font-sans text-xs text-fg-faint">{label}</p>
      </div>
    </div>
  )
}

function PngBadgeSection({ category, value, thresholds, first }) {
  const meta = PNG_BADGE_CATEGORIES[category]
  const { next } = tieredProgress(value, thresholds)
  return (
    <div className={clsx('py-5', !first && 'border-t border-line')}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">{meta.title}</p>
        <p className="font-sans text-xs text-fg-faint">
          {meta.format(value)} all-time{next != null ? ` · ${meta.format(next - value)} to next` : ' · all tiers earned'}
        </p>
      </div>
      {meta.sectionSub && <p className="mt-1 font-sans text-xs text-fg-faint">{meta.sectionSub}</p>}
      <div className="mt-3 flex flex-nowrap gap-2">
        {thresholds.map((t, i) => (
          <PngBadgeTile key={t} category={category} tier={i + 1} threshold={t} value={value} />
        ))}
      </div>
    </div>
  )
}

// Special is the last category off the SVG shield template (Prompt 452's
// original `BadgeTile`/`TierBadge`-driven component is gone entirely now
// — Dials, Bookings, Perfect Days, and Commission each migrated to real
// PNG art in turn, and Special's own migration removed its last
// consumer). Special is structurally different from every tiered
// category above: Back-to-Back/Hat Trick aren't a threshold ladder,
// they're two independent named achievements, each either earned or
// not — no "locked tier 1 vs. unlocked tier 6" escalation, just one
// image per achievement at its own full "maxed out" ornamentation
// (crown, wings, wreath, stars, gems — the same finish every other
// category's own top tier uses). That shape doesn't fit
// `PngBadgeTile`/`PngBadgeSection`'s tier+threshold signature, so this
// is a small dedicated pair instead of forcing Special into the tiered
// abstraction — same visual language (140px height, shrink-wrap tile
// width, grayscale/opacity-35 locked vs. drop-shadow-glow unlocked) as
// every PNG category, just keyed by achievement `slug` instead of tier
// number. Purple was picked specifically not to collide with Dials'
// red or Commission's green.
const SPECIAL_GLOW = 'drop-shadow-[0_0_10px_rgba(124,58,237,0.6)]'

function SpecialBadgeTile({ slug, label, title, unlocked }) {
  return (
    <div title={`${label} — ${title}`} className="flex flex-col items-center gap-2 text-center">
      <img
        src={`/badges/badge-special-${slug}.png`}
        alt={`${label} badge`}
        className={clsx('h-[140px] w-auto', unlocked ? SPECIAL_GLOW : 'grayscale opacity-35')}
      />
      <div>
        <p className={clsx('font-sans text-sm font-semibold', unlocked ? 'text-fg-primary' : 'text-fg-faint')}>
          {label}
        </p>
        <p className="font-sans text-xs text-fg-faint">{title}</p>
      </div>
    </div>
  )
}

function SpecialBadgeRow({ items }) {
  const earnedCount = items.filter((i) => i.unlocked).length
  return (
    <div className="border-t border-line py-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Special</p>
        <p className="font-sans text-xs text-fg-faint">{earnedCount}/{items.length} earned</p>
      </div>
      <div className="mt-3 flex flex-nowrap gap-2">
        {items.map((item) => (
          <SpecialBadgeTile key={item.key} slug={item.slug} label={item.label} title={item.title} unlocked={item.unlocked} />
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
            <PngBadgeSection category="dials" value={badgeProgress.dials} thresholds={DIAL_TIERS} first />
            <PngBadgeSection category="bookings" value={badgeProgress.bookings} thresholds={BOOKING_TIERS} />
            <PngBadgeSection category="perfectDays" value={badgeProgress.perfectDays} thresholds={PERFECT_DAY_TIERS} />
            <PngBadgeSection category="commission" value={myCommission} thresholds={COMMISSION_TIERS} />
            <SpecialBadgeRow items={SPECIAL_BADGES.map((b) => ({ ...b, unlocked: badgeProgress[b.key] }))} />
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
