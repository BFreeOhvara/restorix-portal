import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Search, ClipboardEdit, CheckCircle2, Video, AlertTriangle, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useBrand } from '../hooks/useBrand'
import { useMyPool, useMyBooked, useMyFollowUps, useMyNotInterested, useMyLoggedBookings, useFinishDay, usePipelineHealth } from '../hooks/useLeads'
import { useMyDeal } from '../hooks/useDeals'
import { AGENT_CATALOG } from '../lib/agentCatalog'
import {
  isTestClient,
  ownedAgents,
  PREVIEW_HEADLINE,
  PREVIEW_STATS,
  PREVIEW_ACTIVITY,
  PREVIEW_ATTENTION,
} from '../lib/clientPreview'
import { useAllLeadsForStats, useReps, statsForUser, statsForCloser, followUpsDueToday, inRange } from '../hooks/useStats'
import StatusBadge, { STATUS_SOLID, STATUS_TINT } from '../components/ui/StatusBadge'
import OutcomeBadge, { OUTCOME_LABELS, OUTCOME_TINT, OUTCOME_SOLID, CLOSER_OUTCOME_TILES } from '../components/ui/OutcomeBadge'
import { LiveClock } from '../components/ui/LiveClock'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'
import { ColoredPillGroup } from '../components/ui/ColoredPillGroup'
import { Button } from '../components/ui/Button'
import { formatPhone } from '../lib/phone'
import { displayOutcome } from '../lib/closerOutcome'
import LogCallModal from '../components/LogCallModal'
import CloserLeadModal from '../components/CloserLeadModal'
import { zonedDateStr, zonedDayRange, mondayOf, shiftDay } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'
import { SearchBar, filterLeads } from './Pipeline'
import { usePageHeader } from '../components/Layout'

// Prompt 590 — a hook can't be called conditionally inside a component's
// own body (Rules of Hooks), but mounting/unmounting a child component
// conditionally is normal React — so where a page's header only applies in
// one branch of a stable, per-mount condition (SetterOverview's `embedded`
// prop below never changes for a given mount), this wraps the hook call in
// its own component instead.
function PageHeaderRegistrar({ title, subtitle }) {
  usePageHeader({ title, subtitle })
  return null
}

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Prompt 559 — time left on a held No-Answer lead before Prompt 554's 24h
// hold expires and redistribute_no_answers() releases it to Unassigned.
// Recomputed on each render; useMyPool refetches every 15s so it stays
// current without its own ticking interval.
function noAnswerTimeLeft(noAnswerAt) {
  if (!noAnswerAt) return '—'
  const ms = new Date(noAnswerAt).getTime() + 24 * 60 * 60 * 1000 - Date.now()
  if (ms <= 0) return 'Releasing…'
  const mins = Math.round(ms / 60000)
  return mins >= 60 ? `${Math.floor(mins / 60)}h left` : `${mins}m left`
}

function Tile({ label, value }) {
  return (
    <div className="rounded-card border border-line bg-elevated p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-3xl font-medium text-fg-primary">{value}</p>
    </div>
  )
}

// Prompt 462: date sits to the left of the time, one row, aligned with the
// page title's own header row (was stacked date-above-time, floating below
// the title with a visible gap — Prompt 460). Parent components now place
// this directly beside the "Overview" h1 instead of above the stat grid.
function DateClockRow({ timezone }) {
  const dateLabel = new Date().toLocaleDateString('en-US', {
    timeZone: timezone, weekday: 'long', month: 'short', day: 'numeric',
  })
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-sm text-fg-faint [font-variant-numeric:tabular-nums]">{dateLabel}</span>
      <LiveClock timezone={timezone} />
    </div>
  )
}

// Right now — not the historical/date-range numbers on the Stats page.
// Prompt 458: "today" now follows the viewing user's own saved timezone
// (defaulting to DEFAULT_TIMEZONE for accounts that predate this column)
// instead of the UTC calendar day — both the label above and the actual
// query boundaries feeding statsForUser/followUpsDueToday.
function TodayStrip({ profile, className = 'mt-4' }) {
  const { data: leads, isLoading } = useAllLeadsForStats()
  const tz = profile.timezone || DEFAULT_TIMEZONE
  const { start, end } = useMemo(() => zonedDayRange(zonedDateStr(Date.now(), tz), tz), [tz])
  const today = useMemo(() => {
    if (!leads) return { logged: 0, booked: 0, bookingPct: 0, followUpsDue: 0 }
    return {
      ...statsForUser(leads, profile.id, start, end),
      followUpsDue: followUpsDueToday(leads, profile.id, start, end),
    }
  }, [leads, profile.id, start, end])

  return (
    <div className={clsx('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      <Tile label="Calls Made Today" value={isLoading ? '—' : today.logged} />
      <Tile label="Booked Today" value={isLoading ? '—' : today.booked} />
      <Tile label="Today's Booking Rate" value={isLoading ? '—' : `${today.bookingPct}%`} />
      <Tile label="Follow-ups Due Today" value={isLoading ? '—' : today.followUpsDue} />
    </div>
  )
}

// Prompt 515 Part 3 — New → Follow-Up Due → No Answer → Follow-up →
// Not Interested → Appointment Booked, Brayden's own explicit tab order.
// `key` is what drives state/counts/data-source lookup below; `styleKey`
// is which STATUS_TINT/STATUS_SOLID entry to render with —
// Follow-Up Due has no real `lead_status` enum value of its own (see the
// design doc: it's a live date-comparison over ordinary 'follow_up' rows,
// not a stored state), so it deliberately borrows 'follow_up''s existing
// yellow styling rather than inventing a new color for what's really the
// same underlying status viewed two different ways.
const STATUS_TABS = [
  { key: 'new', label: 'New', styleKey: 'new' },
  { key: 'follow_up_due', label: 'Follow-Up Due', styleKey: 'follow_up' },
  { key: 'no_answer', label: 'No Answer', styleKey: 'no_answer' },
  { key: 'follow_up', label: 'Follow-up', styleKey: 'follow_up' },
  { key: 'not_interested', label: 'Not Interested', styleKey: 'not_interested' },
  { key: 'appointment_booked', label: 'Appointment Booked', styleKey: 'appointment_booked' },
]

// Prompt 515 Part 3 — the "Finish Day" action, shown once the New tab
// hits zero (lets a fast setter skip waiting for local midnight; see the
// design doc for why this and the passive cron produce identical state).
// Prompt 557 — day-end no longer touches no_answer leads at all (Prompt
// 554: they ride their own 24h hold from the moment they're marked), so
// _do_setter_day_end always returns no_answer_rolled: 0. The result line
// now only reports the New refill.
function FinishDayCard() {
  const finishDay = useFinishDay()
  const [result, setResult] = useState(null)

  async function handleClick() {
    setResult(null)
    const res = await finishDay.mutateAsync()
    setResult(res)
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-success/30 bg-success/10 px-4 py-3">
      <CheckCircle2 size={18} className="text-success" />
      <p className="flex-1 font-sans text-sm font-medium text-success">
        New leads all worked — finish today's day now instead of waiting for midnight.
      </p>
      <Button type="button" onClick={handleClick} disabled={finishDay.isPending}>
        {finishDay.isPending ? 'Finishing…' : 'Finish Day'}
      </Button>
      {result && (
        <span className="w-full font-sans text-xs text-fg-secondary">
          {result.refilled} new lead{result.refilled === 1 ? '' : 's'} pulled in for tomorrow.
        </span>
      )}
    </div>
  )
}

// Prompt 509: exported so MyLeads.jsx (closer self-dial) can reuse this
// exact component rather than duplicating it — `useMyPool(profile.id)`
// is already generic on `assigned_setter`, so this works verbatim for a
// closer's own id, no changes needed here at all.
// Prompt 515 Part 3: a closer never sees Follow-Up Due/Follow-up/Not
// Interested rows in practice (a closer's own leads never pass through
// setter-side follow-up/not-interested logging), so merging the three
// data sources here doesn't add anything closer-facing MyPipeline.jsx
// needs to special-case — useMyFollowUps/useMyNotInterested just return
// empty for a closer id and those tabs never show a nonzero count.
// Prompt 544 — `headerRight` lets a caller swap what sits opposite the
// page title (top-right of the header row). Default: the live date/clock,
// exactly as the setter's own /overview has always shown it. The closer's
// My Leads (MyLeads.jsx) passes its "Request Leads" button here instead —
// same slot, no clock — without forking this shared component.
// Prompt 547 — the closer's My Leads also passes `niche`
// (behavioral_health / bail_bonds) + a `nicheTabs` node (the segmented
// niche selector, owned by MyLeads.jsx). When `niche` is set every lead
// list on the page is scoped to it; the setter's own /overview passes
// neither, so `niche` is undefined there and this renders exactly as before.
// Prompt 555 — the niche selector is gone (one brand per portal now), so
// `nicheTabs` is unused but kept as harmless shared plumbing.
// Prompt 563 — `actionsRow` is gone; My Leads' "Request Leads" button is
// back in `headerRight` beside the title. `compactStats` (My Leads only)
// keys TodayStrip's own top margin off an explicit prop now that
// `actionsRow` no longer exists — see the TodayStrip render below for the
// current value and its history (559/562/564 tightened it, 586 opened it
// back up).
// Prompt 554 — `embedded` drops SetterOverview's own page header (h1 +
// headerRight slot) so it can be nested as the "Setter" tab inside
// CloserPipeline without a duplicate title. Everything below the header
// (stat strip, search, status sub-tabs, lead table) renders unchanged.
// Prompt 559 — `clipMarkedToday` (My Leads only; renamed from
// `todayFollowUpOnly` by Prompt 576, which widened what it covers — see
// below) scopes marked-outcome buckets to leads acted on the viewer's local
// today, keyed off last_action_at; once local midnight passes they drop out
// of My Leads. My Pipeline → Setter (embedded) and the setter's own
// /overview both leave it off, so they keep showing every marked lead —
// the "always visible" shape.
// Prompt 576 — Brayden's rule: marking an outcome (Not Interested, No
// Answer, Follow-up, or Appointment Booked) from My Leads must move the
// lead onto My Pipeline immediately AND keep it visible, in its marked
// state, on My Leads until local midnight. Before this prompt the prop only
// clipped follow_up_due/follow_up (Prompt 559 Part C); generalized the same
// `clip()` pattern to no_answer and not_interested (previously unclipped —
// forever-visible on My Leads once marked) and to the new
// appointment_booked bucket below. `new` is deliberately never clipped —
// unworked pool inventory, not a marked outcome.
export function SetterOverview({ profile, title = 'Overview', headerRight, niche, nicheTabs, embedded = false, clipMarkedToday = false, compactStats = false }) {
  const { data: pool, isLoading: poolLoading } = useMyPool(profile.id)
  const tz = profile.timezone || DEFAULT_TIMEZONE
  const { data: followUps, isLoading: followUpsLoading } = useMyFollowUps(profile.id, tz)
  const { data: notInterested, isLoading: notInterestedLoading } = useMyNotInterested(profile.id)
  // Prompt 576 — see useMyLoggedBookings (useLeads.js): appointment_booked
  // leads have assigned_setter nulled by the DB trigger the same instant
  // they're marked, so `pool` (assigned_setter-scoped) can never contain
  // them — this last_action_by-scoped query is the actual source now.
  const { data: loggedBookings, isLoading: loggedBookingsLoading } = useMyLoggedBookings(profile.id)
  const [callLead, setCallLead] = useState(null)
  const [search, setSearch] = useState('')
  // Prompt 558 — the embedded My Pipeline → Setter tab is a tracking view:
  // no New pill (a closer works New leads from My Leads), so it opens on
  // No Answer instead.
  const [statusFilter, setStatusFilter] = useState(embedded ? 'no_answer' : 'new')
  const isLoading = poolLoading || followUpsLoading || notInterestedLoading || loggedBookingsLoading

  const leadsByTab = useMemo(() => {
    // Prompt 547 — scope every bucket to the selected niche when the closer's
    // My Leads passes one; identity (no filter) for the setter's /overview.
    const f = (arr) => (niche ? (arr || []).filter((l) => l.niche === niche) : (arr || []))
    // Prompt 559/576 — on My Leads, drop marked-outcome leads not acted on
    // today (local date of last_action_at — when it was marked, NOT e.g.
    // follow_up_at's scheduled callback date). Identity everywhere else.
    const localToday = zonedDateStr(Date.now(), tz)
    const clip = (arr) =>
      clipMarkedToday
        ? (arr || []).filter((l) => l.last_action_at && zonedDateStr(new Date(l.last_action_at).getTime(), tz) === localToday)
        : (arr || [])
    return {
      new: f(pool).filter((l) => l.status === 'new'),
      no_answer: clip(f(pool).filter((l) => l.status === 'no_answer')),
      appointment_booked: f(clip(loggedBookings)),
      follow_up_due: f(clip(followUps?.due)),
      follow_up: f(clip(followUps?.future)),
      not_interested: f(clip(notInterested)),
    }
  }, [pool, followUps, notInterested, loggedBookings, niche, clipMarkedToday, tz])

  const counts = useMemo(() => {
    const c = {}
    for (const tab of STATUS_TABS) c[tab.key] = leadsByTab[tab.key]?.length || 0
    return c
  }, [leadsByTab])

  // Follow-Up Due only appears in the tab row on a day there's at least
  // one due — if the tab is currently open and its last row just got
  // worked down to zero, fall back to New rather than leaving the view
  // stuck on a tab that's about to disappear.
  useEffect(() => {
    if (statusFilter === 'follow_up_due' && counts.follow_up_due === 0) setStatusFilter(embedded ? 'no_answer' : 'new')
  }, [statusFilter, counts.follow_up_due, embedded])

  // Prompt 558 — the embedded My Pipeline → Setter tab shows only the
  // tracking buckets: No Answer, Follow-up, Not Interested. New +
  // Appointment Booked are dropped there (New belongs to My Leads,
  // Appointment Booked shows on the Closer tab once booked). Follow-Up Due
  // dropped too — reading "only no answer, follow-up, and not interested"
  // literally; it's a live slice of the Follow-up bucket anyway. FLAG: the
  // Follow-Up Due call wasn't explicit in the spec, confirm with Brayden.
  const EMBEDDED_STATUS_KEYS = ['no_answer', 'follow_up', 'not_interested']
  const visibleTabs = embedded
    ? STATUS_TABS.filter((tab) => EMBEDDED_STATUS_KEYS.includes(tab.key))
    : STATUS_TABS.filter((tab) => tab.key !== 'follow_up_due' || counts.follow_up_due > 0)

  // Prompt 520 — only New and Follow-Up Due are actionable from this
  // table; the other four are informational (No Answer's own re-dial
  // happens on its own schedule via day-end + redistribution, not a
  // setter-initiated re-call here; Follow-up isn't due yet; Not
  // Interested/Appointment Booked are terminal from the setter's side).
  // Gates both the visible Call button AND the row's own click-to-open —
  // hiding just the button while leaving the whole row clickable would
  // still open LogCallModal and let a setter re-log an outcome from a
  // tab that's supposed to be call-free.
  const canCallFromTab = statusFilter === 'new' || statusFilter === 'follow_up_due'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = (lead) =>
      lead.facility_name?.toLowerCase().includes(q) ||
      lead.contact_name?.toLowerCase().includes(q) ||
      lead.phone?.toLowerCase().includes(q)
    // Prompt 583 — embedded My Pipeline → Setter tab: an active search
    // crosses all three visible buckets (No Answer / Follow-up / Not
    // Interested), not just the selected pill. Every match still renders
    // its real status badge. Non-embedded (/overview, /my-leads) is
    // untouched — search there still narrows within the selected status.
    if (embedded && q) {
      return [
        ...leadsByTab.no_answer,
        ...leadsByTab.follow_up,
        ...leadsByTab.not_interested,
      ].filter(match)
    }
    const active = leadsByTab[statusFilter] || []
    if (!q) return active
    return active.filter(match)
  }, [leadsByTab, search, statusFilter, embedded])

  // Prompt 583 — while an embedded cross-status search is active the result
  // rows can mix statuses, so the two status-specific columns (Callback for
  // follow-up, Releases in for no_answer) stop making sense as fixed
  // columns; render the plain Business/Phone/Status table instead, revert
  // the moment the box is cleared. Non-embedded: always the per-status
  // layout, exactly as before.
  const embeddedSearching = embedded && search.trim() !== ''
  const showCallbackCol = !embeddedSearching && (statusFilter === 'follow_up_due' || statusFilter === 'follow_up')
  const showReleasesCol = !embeddedSearching && statusFilter === 'no_answer'
  const emptyMessage = embedded
    ? search.trim()
      ? 'No leads match your search.'
      : 'Nothing in this status right now.'
    : leadsByTab[statusFilter]?.length
      ? 'No leads match this filter.'
      : 'Nothing here right now.'

  // Prompt 560 — status pills render above the search bar on the embedded
  // My Pipeline → Setter tab. Prompt 591 — /overview and My Leads now match
  // that order too (was search-then-pills, backwards from My Pipeline);
  // every non-embedded caller renders pills first, same as embedded.
  const searchRow = (
    <div className={clsx('flex flex-wrap items-center gap-3', embedded ? 'mt-3' : 'mt-6')}>
      <div className="relative flex-1 min-w-[220px]">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search facility, contact, or phone…"
          className="w-full rounded-lg border-2 border-line bg-elevated py-2 pl-9 pr-3 font-sans text-sm text-fg-primary shadow-sm outline-none focus:border-accent"
        />
      </div>
    </div>
  )

  // Prompt 583 — embedded My Pipeline → Setter tab: pills in one bordered
  // group (ColoredPillGroup), no "(N)" on the labels, a plain count of
  // what's showing on the right of the row, and clicking a pill clears the
  // search box (the box drives 583's cross-status search there).
  // Prompt 585 — non-embedded (/overview, /my-leads) gets the same
  // ColoredPillGroup + right-side count visual treatment (Brayden compared
  // the two side by side and wanted parity), but deliberately keeps today's
  // plain behavior: `onChange` only sets the filter, no search-clear and no
  // cross-status search — those are 583-specific to the embedded tab, not
  // asked for here. `filtered` already narrows to `leadsByTab[statusFilter]`
  // + the search query on this branch (see the useMemo above), so the count
  // stays in sync with the table without any new computation.
  const pillsRow = (
    <div className={clsx('flex flex-wrap items-center justify-between gap-3', embedded ? 'mt-1' : 'mt-3')}>
      <ColoredPillGroup
        options={visibleTabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
          tint: STATUS_TINT[tab.styleKey],
          solid: STATUS_SOLID[tab.styleKey],
        }))}
        active={statusFilter}
        onChange={(key) => { setStatusFilter(key); if (embedded) setSearch('') }}
      />
      <p className="font-sans text-sm text-fg-secondary">
        {filtered.length} lead{filtered.length === 1 ? '' : 's'}
      </p>
    </div>
  )

  // Prompt 591 — dropped the live pool count in favor of a static
  // description, same treatment 590 gave My Pipeline's subtitle. Shared by
  // /overview (setter) and /my-leads (closer, non-embedded) — fixing here
  // fixes both at once. Exact wording is a judgment call; flag for Brayden.
  const subtitle = 'Your active lead pool'

  return (
    <div>
      {/* Prompt 558 — when embedded (My Pipeline → Setter tab) the wrapper
          owns the title + count line, so no header renders here at all.
          Prompt 590 — non-embedded now hands title/subtitle up to Layout's
          shared header via usePageHeader (PageHeaderRegistrar, since
          `embedded` gates whether the hook fires at all — see its own
          comment above); the sibling action (headerRight: DateClockRow on
          /overview, the Request Leads button on My Leads) stays in the page
          body, right-aligned alone now that it no longer shares a row with
          the title. */}
      {!embedded && <PageHeaderRegistrar title={title} subtitle={subtitle} />}
      {!embedded && (
        <div className="flex justify-end">
          {headerRight ?? <DateClockRow timezone={tz} />}
        </div>
      )}

      {/* Prompt 558 — no stat tiles in the embedded My Pipeline → Setter
          tracking view (kept on /overview and My Leads).
          Prompt 563/564 — My Leads passes `compactStats` so the tiles sit
          tight directly under the header row (was mt-0.5, nudged in from
          Prompt 563's mt-1). Prompt 586 — Brayden wanted that tightness
          reversed into a clear, deliberate gap instead: mt-0.5 → mt-6,
          matching the section-gap value already used elsewhere on this page
          (searchRow, nicheTabs, the table wrapper) rather than a new
          one-off value. Header row itself (title/subtitle/button) is
          untouched — this only pushes TodayStrip (and everything after it,
          via normal margin flow) down as a block. /overview keeps its
          original, already-roomier mt-4 — not part of this ask. */}
      {!embedded && <TodayStrip profile={profile} className={compactStats ? 'mt-6' : 'mt-4'} />}

      {/* Prompt 547 — "Finish Day" is a setter-only day-end action
          (run_setter_day_end is role-checked to setters), so it's hidden on
          the closer's niche-scoped My Leads, where an empty niche tab would
          otherwise trip the counts.new === 0 condition. */}
      {!isLoading && !niche && counts.new === 0 && <FinishDayCard />}

      {nicheTabs && <div className="mt-6">{nicheTabs}</div>}

      {/* Prompt 558 — embedded has no header/stats/nicheTabs above it, so
          the first control row sits right under the wrapper's own tab
          switcher (tight top margin). Prompt 560/591 — status pills always
          render first, search bar second, embedded or not. */}
      {pillsRow}
      {searchRow}

      {/* Own scroll region for the row list, bounded height so the strip/
          search/filters above stay pinned while scrolling a 150-lead pool
          (Prompt 440) — sticky thead so column headers travel with it.
          Prompt 595 — box height quantized to the sticky header's own
          height (43px, identical markup on this table and
          CloserBookedPipeline's) plus a whole number of 72px rows, so the
          box's bottom edge always lands on a row's own bottom border
          instead of bisecting the last visible row (h-[65vh] had no
          relationship to the 72px row height). Row count differs by
          context, checked live against a 1366×768 viewport (591's original
          "no page scroll" target): embedded (My Pipeline's Setter tab) sits
          higher on the page with no stat tiles above it, so 5 rows fits;
          non-embedded (/overview, /my-leads) carries TodayStrip's tiles
          above the table and only fits 4 before the page itself would need
          to scroll. Matches CloserBookedPipeline's own fixed height below,
          which is always in the embedded-equivalent (My Pipeline) context. */}
      <div className={clsx('mt-6 overflow-hidden rounded-card border border-line bg-elevated', embedded ? 'h-[619px]' : 'h-[547px]')}>
        <div className="h-full overflow-y-auto">
          {/* Prompt 593 — border-b closes off the last row with a line,
              matching every other row's border-t (which only draws lines
              between rows, not after the final one). Sits on the table
              itself, right at the end of its real content, not the
              bottom of the box, so it doesn't float in empty scroll space
              below a short list. */}
          <table className={clsx('w-full text-left', filtered.length > 0 && 'border-b border-line')}>
            <thead className="eyebrow sticky top-0 z-10 bg-surface">
              <tr>
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Status</th>
                {showCallbackCol && <th className="px-5 py-3">Callback</th>}
                {/* Prompt 559 Part B — countdown to the 24h No-Answer
                    hold releasing the lead to Unassigned. */}
                {showReleasesCol && <th className="px-5 py-3">Releases in</th>}
                {canCallFromTab && <th className="px-5 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  {/* Prompt 595 — explicit height (= the box's row-list
                      space, header excluded) + align-middle vertically
                      centers the message in the box instead of it sitting
                      near the top; a bare `<td>` only takes the height of
                      its own padding, leaving the rest of the fixed-height
                      box as empty space below it. */}
                  <td colSpan={99} className={clsx('px-8 text-center align-middle font-sans text-sm text-fg-secondary', embedded ? 'h-[576px]' : 'h-[504px]')}>
                    Loading…
                  </td>
                </tr>
              ) : !filtered.length ? (
                <tr>
                  <td colSpan={99} className={clsx('px-8 text-center align-middle font-sans text-sm text-fg-secondary', embedded ? 'h-[576px]' : 'h-[504px]')}>
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={canCallFromTab ? () => setCallLead(lead) : undefined}
                    className={clsx(
                      // Prompt 594 — explicit row height so a badge-only row
                      // (most tabs) renders the same size as a row with the
                      // Call button (New/Follow-Up Due), matching parity with
                      // CloserBookedPipeline's own explicit row height below.
                      'h-[72px] border-t border-line font-sans text-sm',
                      canCallFromTab && 'cursor-pointer hover:bg-surface'
                    )}
                  >
                    <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                    <td className="px-5 py-4 text-fg-secondary">{formatPhone(lead.phone) || '—'}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={lead.status} />
                    </td>
                    {showCallbackCol && (
                      <td className="px-5 py-4 text-fg-secondary">{fmt(lead.follow_up_at)}</td>
                    )}
                    {showReleasesCol && (
                      <td className="px-5 py-4 font-mono text-fg-secondary [font-variant-numeric:tabular-nums]">
                        {noAnswerTimeLeft(lead.no_answer_at)}
                      </td>
                    )}
                    {canCallFromTab && (
                      <td className="px-5 py-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); setCallLead(lead) }}
                          className={clsx(
                            'inline-flex items-center gap-2 rounded-full px-4 py-2 font-sans text-sm font-semibold transition-colors hover:opacity-90',
                            STATUS_SOLID.new
                          )}
                        >
                          <Phone size={15} /> Call
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {callLead && <LogCallModal lead={callLead} onClose={() => setCallLead(null)} />}
    </div>
  )
}

// Prompt 540 — 'needs_reschedule' replaced by 'no_show'; Prompt 579 —
// moved to OutcomeBadge.jsx so Stats can share the same four categories.

// Prompt 487 — restructured to match Setter Overview's own established
// pattern (stat tiles, then a bordered box holding the lead list with a
// real empty state, rows clickable to open a modal) instead of a flat
// stack of individually-actioned cards. Tiles are scoped to this
// closer's own leads only (`useMyBooked` already filters on
// `assigned_closer = auth.uid()`) — the all-closers rollup is the admin
// Pipeline Closer tab's job, not this page's. `useMyBooked` returns
// every lead ever booked to this closer regardless of `closer_outcome`
// (that field never gates the query — see Prompt 468's own note that
// logging an outcome doesn't touch `status`), so counting by
// `closer_outcome` (defaulting missing/null to 'pending', matching
// LogOutcomeForm's own default) covers the closer's full working set,
// not just unresolved ones.
// Prompt 509: exported so MyPipeline.jsx can reuse this exact component.
// Prompt 548: this IS "My Pipeline" now — the closer's Overview and My
// Pipeline were the literal same component (Overview just passed a
// different title), which Prompt 509's comment already flagged was meant
// to diverge once My Leads existed as its own working queue. It now does
// (Prompt 509/543/547), so the outcome-filtered working table below is
// renamed `CloserPipeline` and stays exactly as-is (untouched, per
// Brayden), while the new `CloserOverview` further down is a real
// at-a-glance daily snapshot instead of a second copy of this table.
// Prompt 554 — `CloserPipeline` is now a thin wrapper with a Setter/Closer
// sub-tab split (below); this is the "Closer" tab body — the booked-
// appointment outcome table, structurally unchanged, just minus its own
// page-title header row (the wrapper owns that now).
const MY_PIPELINE_TABS = [
  { key: 'closer', label: 'Closer' },
  { key: 'setter', label: 'Setter' },
]

export function CloserPipeline({ profile, title = 'My Pipeline' }) {
  const brand = useBrand()
  const [view, setView] = useState('closer')

  // Prompt 590 — Brayden dropped the live count (558/589's subtitle): the
  // Closer tab's "N booked leads" was wrong since that count included
  // Lost/No-Show leads too, not just booked ones, and he didn't want a
  // number here at all — a short static description instead, Ohvara's
  // "Your whole book of business" style. Exact copy is a judgment call
  // (not specified beyond "no number, more like what the page really is")
  // — flag for Brayden to tweak if it's not quite right.
  const subtitle = view === 'closer' ? 'Your appointment outcomes' : 'Your working lead pool'

  // Prompt 589 — title/subtitle now render in Layout's header bar instead
  // of this page's own body; re-registers whenever the subtitle's wording
  // changes with the active tab.
  usePageHeader({ title, subtitle })

  return (
    <div className="-mt-4">
      {/* Prompt 597 — page-scoped negative top margin, cancels part of
          Layout's shared <main> py-8 for this route only (that padding
          itself is untouched — every other page still gets its full 32px).
          Brings the toggle to ~1-2 lines below the header instead of the
          larger gap left over since 589 moved the title into the header. */}
      {/* Prompt 554 — Closer = booked appointments (setter-booked + own);
          Setter = leads this closer personally dials via My Leads, i.e.
          SetterOverview scoped to their own id. Empty Setter tab for a
          closer who never self-dials. No Unassigned — admin-only concept. */}
      <div className="mt-4">
        <SegmentedTabs tabs={MY_PIPELINE_TABS} active={view} onChange={setView} variant="grouped" />
      </div>

      <div className="mt-6">
        {view === 'closer' ? (
          <CloserBookedPipeline profile={profile} />
        ) : (
          <SetterOverview profile={profile} niche={brand.niche} embedded />
        )}
      </div>
    </div>
  )
}

function CloserBookedPipeline({ profile }) {
  const brand = useBrand()
  const { data: allLeads, isLoading } = useMyBooked(profile.id)
  const [activeLead, setActiveLead] = useState(null)
  const [search, setSearch] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('pending')

  // Prompt 549 — My Pipeline scopes to the current portal's niche (settled
  // 2026-08-29, overriding Prompt 547's "one combined list"): a closer on
  // the Suretix portal sees only bail_bonds booked leads, swap back and
  // it's only behavioral_health. Same client-side `l.niche === …` filter
  // My Leads' niche tabs use.
  const leads = useMemo(
    () => (allLeads || []).filter((l) => l.niche === brand.niche),
    [allLeads, brand.niche]
  )

  // Prompt 542 — restyled to match admin Pipeline's Closer tab: the 4
  // static Tile counts become clickable filter chips. Prompt 583 — chips
  // move into one bordered group (ColoredPillGroup), no "(N)" on the
  // labels, and a plain count of what's showing sits on the right.
  const outcomeFiltered = useMemo(
    () => (leads || []).filter((lead) => displayOutcome(lead) === outcomeFilter),
    [leads, outcomeFilter]
  )
  // Prompt 583 — an active search crosses every outcome (all this closer's
  // booked leads), not just the selected pill; each match still renders its
  // real outcome badge. Empty search → the selected pill's rows, as before.
  const searching = search.trim() !== ''
  const filtered = useMemo(
    () => filterLeads(searching ? leads : outcomeFiltered, search),
    [searching, leads, outcomeFiltered, search]
  )

  return (
    <div>
      {/* Prompt 558 — the "N booked leads" line moved up to the CloserPipeline
          wrapper (above the tab switcher). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ColoredPillGroup
          options={CLOSER_OUTCOME_TILES.map((key) => ({
            key,
            label: OUTCOME_LABELS[key],
            tint: OUTCOME_TINT[key],
            solid: OUTCOME_SOLID[key],
          }))}
          active={outcomeFilter}
          onChange={(key) => { setOutcomeFilter(key); setSearch('') }}
        />
        <p className="font-sans text-sm text-fg-secondary">
          {filtered.length} lead{filtered.length === 1 ? '' : 's'}
        </p>
      </div>

      <SearchBar value={search} onChange={setSearch} />

      {/* Prompt 595 — box height quantized to the sticky header's own
          height (43px, identical markup on this table and
          SetterOverview's) plus a whole number of 72px rows, so the box's
          bottom edge always lands on a row's own bottom border instead of
          bisecting the last visible row (h-[65vh] had no relationship to
          the 72px row height). Fixed 5-row height — this table only ever
          renders in the My Pipeline context, matching SetterOverview's own
          embedded (My Pipeline → Setter tab) height so the Closer and
          Setter tabs read identically; checked live against a 1366×768
          viewport (591's original "no page scroll" target). */}
      <div className="mt-4 h-[619px] overflow-hidden rounded-card border border-line bg-elevated">
        <div className="h-full overflow-y-auto">
          {/* Prompt 593 — border-b closes off the last row with a line,
              matching every other row's border-t (which only draws lines
              between rows, not after the final one). Sits on the table
              itself, right at the end of its real content, not the
              bottom of the box, so it doesn't float in empty scroll space
              below a short list. */}
          <table className={clsx('w-full text-left', filtered.length > 0 && 'border-b border-line')}>
            <thead className="eyebrow sticky top-0 z-10 bg-surface">
              <tr>
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Strategy Call</th>
                <th className="px-5 py-3">Outcome</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  {/* Prompt 595 — explicit height (= the box's row-list
                      space, header excluded) + align-middle vertically
                      centers the message in the box instead of it sitting
                      near the top; a bare `<td>` only takes the height of
                      its own padding, leaving the rest of the fixed-height
                      box as empty space below it. */}
                  <td colSpan={5} className="h-[576px] px-8 text-center align-middle font-sans text-sm text-fg-secondary">
                    Loading…
                  </td>
                </tr>
              ) : !filtered.length ? (
                <tr>
                  <td colSpan={5} className="h-[576px] px-8 text-center align-middle font-sans text-sm text-fg-secondary">
                    {searching
                      ? 'No booked leads match your search.'
                      : leads?.length
                        ? 'No booked leads in this status.'
                        : 'No booked leads yet — Strategy Calls are assigned to you automatically.'}
                  </td>
                </tr>
              ) : (
                filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setActiveLead(lead)}
                    // Prompt 594 — explicit row height matches
                    // SetterOverview's own explicit row height, so Closer-tab
                    // and Setter-tab rows on My Pipeline render at the same
                    // size (same row count visible before scrolling).
                    className="h-[72px] cursor-pointer border-t border-line font-sans text-sm hover:bg-surface"
                  >
                    <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                    <td className="px-5 py-4 text-fg-secondary">
                      {lead.contact_name || 'No contact name'} · {formatPhone(lead.phone) || 'No phone'}
                    </td>
                    <td className="px-5 py-4 text-fg-secondary">{fmt(lead.strategy_call_at)}</td>
                    <td className="px-5 py-4">
                      <OutcomeBadge outcome={displayOutcome(lead)} />
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveLead(lead) }}
                        className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 font-sans text-sm font-semibold text-fg-primary transition-colors hover:border-fg-primary/40"
                      >
                        <ClipboardEdit size={15} /> Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeLead && <CloserLeadModal lead={activeLead} onClose={() => setActiveLead(null)} />}
    </div>
  )
}

// Prompt 548 — one row of the closer Overview's "Today's Strategy Calls"
// list. Local time · facility · contact, then a real Zoom join link when
// `zoom_join_url` is set (opens in a new tab, doesn't bubble to the row's
// own click) or muted "Zoom pending" text when it isn't. The row itself
// opens the same CloserLeadModal My Pipeline uses.
function StrategyCallRow({ lead, tz, onOpen }) {
  const time = new Date(lead.strategy_call_at).toLocaleTimeString('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit',
  })
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t border-line font-sans text-sm hover:bg-surface">
      <td className="px-5 py-4 font-mono text-fg-primary [font-variant-numeric:tabular-nums]">{time}</td>
      <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
      <td className="px-5 py-4 text-fg-secondary">
        {lead.contact_name || 'No contact name'} · {formatPhone(lead.phone) || 'No phone'}
      </td>
      <td className="px-5 py-4">
        {lead.zoom_join_url ? (
          <a
            href={lead.zoom_join_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Video size={15} /> Join
          </a>
        ) : (
          <span className="font-sans text-sm text-fg-faint">Zoom pending</span>
        )}
      </td>
    </tr>
  )
}

// Prompt 548 — the closer's Overview, rebuilt as an at-a-glance daily
// snapshot. It used to be the literal same component as My Pipeline
// (CloserPipeline above, just a different title) — Prompt 509's own
// comment flagged that was meant to diverge once My Leads became its own
// working queue, which it now is (509/543/547). My Pipeline is untouched;
// this is a genuinely different view: today's strategy calls (a short
// chronological list, not a paginated table), a stat-tile row, and a
// conditional No-Show alert. Every number comes from useMyBooked, already
// scoped to `assigned_closer = me` + `status = 'appointment_booked'` —
// the same single source CloserPipeline reads.
export function CloserOverview({ profile, title = 'Overview' }) {
  const { data: leads, isLoading } = useMyBooked(profile.id)
  const [activeLead, setActiveLead] = useState(null)
  const tz = profile.timezone || DEFAULT_TIMEZONE

  const todayRange = useMemo(() => zonedDayRange(zonedDateStr(Date.now(), tz), tz), [tz])
  const weekRange = useMemo(() => {
    const monday = mondayOf(zonedDateStr(Date.now(), tz))
    return {
      start: zonedDayRange(monday, tz).start,
      end: zonedDayRange(shiftDay(monday, 6), tz).end,
    }
  }, [tz])

  // Raw closer_outcome here, NOT displayOutcome — a No Show that happened
  // today still belongs on today's list so the closer can log the real
  // outcome, rather than silently dropping off once its time passes.
  const todaysCalls = useMemo(
    () =>
      (leads || [])
        .filter(
          (l) =>
            l.strategy_call_at &&
            inRange(l.strategy_call_at, todayRange.start, todayRange.end) &&
            (!l.closer_outcome || l.closer_outcome === 'pending')
        )
        .sort((a, b) => new Date(a.strategy_call_at) - new Date(b.strategy_call_at)),
    [leads, todayRange]
  )

  const tiles = useMemo(() => {
    const all = leads || []
    // Booked This Week — mirrors statsForCloser's `assigned` rule
    // (assigned_closer + appointment_booked are already guaranteed by
    // useMyBooked), ranged to this ISO week by strategy_call_at.
    const bookedThisWeek = all.filter((l) => inRange(l.strategy_call_at, weekRange.start, weekRange.end)).length
    // Closed This Week — closer_outcome_at is forward-only (Prompt 548 DB
    // prep): a null stamp on an older closed lead is simply not countable
    // in a date-ranged tile (inRange returns false for null), not an error.
    const closedThisWeek = all.filter(
      (l) => l.closer_outcome === 'closed' && inRange(l.closer_outcome_at, weekRange.start, weekRange.end)
    ).length
    // Win Rate — deliberately all-time (a single week's sample is too small
    // to mean anything). Only resolved deals: closed / (closed + lost);
    // pending/no-show are excluded from the denominator entirely.
    const closed = all.filter((l) => l.closer_outcome === 'closed').length
    const lost = all.filter((l) => l.closer_outcome === 'lost').length
    const winRate = closed + lost > 0 ? `${Math.round((closed / (closed + lost)) * 100)}%` : '—'
    return { bookedThisWeek, closedThisWeek, winRate }
  }, [leads, weekRange])

  const noShowCount = useMemo(
    () => (leads || []).filter((l) => displayOutcome(l) === 'no_show').length,
    [leads]
  )

  usePageHeader({ title, subtitle: 'Your day at a glance' })

  return (
    <div>
      <div className="flex justify-end">
        <DateClockRow timezone={tz} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Booked This Week" value={isLoading ? '—' : tiles.bookedThisWeek} />
        <Tile label="Closed This Week" value={isLoading ? '—' : tiles.closedThisWeek} />
        <Tile label="Win Rate (All Time)" value={isLoading ? '—' : tiles.winRate} />
      </div>

      {/* Needs Attention — unresolved No Shows only, hidden entirely at
          zero. Reuses the app's established No-Show purple (OUTCOME_TINT,
          Prompt 540) rather than a new color; links into My Pipeline,
          whose No Show filter chip already exists (CLOSER_OUTCOME_TILES). */}
      {!isLoading && noShowCount > 0 && (
        <Link
          to="/my-pipeline"
          className={clsx(
            'mt-4 flex flex-wrap items-center gap-3 rounded-card border border-line px-4 py-3 transition-opacity hover:opacity-90',
            OUTCOME_TINT.no_show
          )}
        >
          <AlertTriangle size={18} />
          <p className="flex-1 font-sans text-sm font-medium">
            {noShowCount} unresolved No Show{noShowCount === 1 ? '' : 's'} — log an outcome or reschedule.
          </p>
          <span className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold">
            My Pipeline <ArrowRight size={14} />
          </span>
        </Link>
      )}

      <h2 className="mt-8 font-display text-lg font-medium text-fg-primary">Today's Strategy Calls</h2>
      <div className="mt-3 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !todaysCalls.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            No strategy calls scheduled for today.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="eyebrow bg-surface">
              <tr>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {todaysCalls.map((lead) => (
                <StrategyCallRow key={lead.id} lead={lead} tz={tz} onOpen={() => setActiveLead(lead)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {activeLead && <CloserLeadModal lead={activeLead} onClose={() => setActiveLead(null)} />}
    </div>
  )
}

// Prompt 578 — the client Overview, reframed as the top of a CRM (not the
// agent catalog it used to be). A row of stat tiles, a same-day-only
// activity feed (agent-name prefixes stripped — the client sees that a
// consult was booked, not which agent booked it), and an honest footnote
// making the bounded-by-design choice explicit. Real clients get real
// facts where they exist (facility name, how many of their agents are
// live) and honest empty / "Coming soon" states everywhere else; the
// seeded test account gets the full mockup-matching preview from
// clientPreview.js. RLS scopes useMyDeal to this client's own row.
function AttentionDot({ kind }) {
  return (
    <span
      className={clsx(
        'mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full',
        kind === 'urgent' ? 'bg-danger' : 'bg-yellow-600 dark:bg-yellow-500'
      )}
    />
  )
}

function ClientOverview({ profile }) {
  const { session } = useAuth()
  const { data: deal, isLoading, isError } = useMyDeal()

  // Prompt 590 — two mutually-exclusive header states (was two separately-
  // rendered h1/p blocks, one per early-return branch): the loading/no-deal
  // state shows "Welcome[, name]", the normal state shows the facility
  // name. Computed once, before either early return, so both branches
  // register the right one via usePageHeader.
  const showWelcome = isLoading || isError || !deal
  usePageHeader({
    title: showWelcome ? `Welcome${profile.full_name ? `, ${profile.full_name}` : ''}` : deal.lead?.facility_name || 'Your facility',
    subtitle: showWelcome ? 'Your dashboard is being set up. Check back shortly.' : 'Your Restorix setup',
  })

  if (isLoading) {
    return <p className="font-sans text-sm text-fg-secondary">Loading…</p>
  }
  if (isError || !deal) {
    return null
  }

  const owned = ownedAgents(deal)
  const liveCount = owned.filter((k) => AGENT_CATALOG[k]?.status === 'live').length
  const hasBedSync = owned.includes('bed_sync')
  const preview = isTestClient(session)

  if (!preview) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Tile label="Agents live" value={`${liveCount} of ${owned.length}`} />
          {hasBedSync && <Tile label="Beds open" value={<span className="text-fg-faint">Coming soon</span>} />}
        </div>
        <div>
          <p className="eyebrow !text-fg-faint">Today's activity</p>
          <div className="mt-2 rounded-card border border-line bg-elevated p-8 text-center">
            <p className="font-sans text-sm text-fg-secondary">Nothing yet today.</p>
          </div>
          <p className="mt-2.5 font-sans text-xs text-fg-faint">
            Bounded to today by design — always short, never a scroll-forever log.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-[22px]">
      <div className="rounded-card border border-line bg-elevated px-6 py-5">
        <p className="font-display text-lg font-medium leading-relaxed text-fg-primary">{PREVIEW_HEADLINE}</p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Active prospects" value={PREVIEW_STATS.activeProspects} />
        <Tile label="Booked this week" value={PREVIEW_STATS.bookedThisWeek} />
        <Tile label="Booking rate" value={PREVIEW_STATS.bookingRate} />
        <Tile label="Avg response" value={PREVIEW_STATS.avgResponse} />
        {hasBedSync && (
          <Tile
            label="Beds open"
            value={
              <>
                {PREVIEW_STATS.bedsOpen}
                <span className="ml-1 text-lg font-normal text-fg-faint">/ {PREVIEW_STATS.bedsTotal}</span>
              </>
            }
          />
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-card border border-line bg-elevated px-5 py-[18px]">
          <p className="eyebrow !text-fg-faint">Needs your attention</p>
          <div className="mt-3 flex flex-col">
            {PREVIEW_ATTENTION.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5 border-b border-line py-2.5 last:border-0">
                <AttentionDot kind={c.attention} />
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-sm font-semibold text-fg-primary">{c.name}</p>
                  <p className="mt-0.5 font-sans text-[13px] leading-snug text-fg-secondary">{c.attentionReason}</p>
                  <p className="mt-1 font-sans text-[11px] text-fg-faint">{c.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col rounded-card border border-line bg-elevated px-5 py-[18px]">
          <p className="eyebrow !text-fg-faint">Today's activity</p>
          <div className="mt-3 flex flex-1 flex-col">
            {PREVIEW_ACTIVITY.map((a) => (
              <div key={a.text} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
                <span className="min-w-0 truncate font-sans text-sm text-fg-primary">{a.text}</span>
                <span className="shrink-0 font-sans text-[11px] text-fg-faint">{a.time}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 font-sans text-[11.5px] text-fg-faint">
            Bounded to today by design — always short, never a scroll-forever log.
          </p>
        </div>
      </div>
    </div>
  )
}

function AdminOverview({ profile }) {
  const { data: leads, isLoading: leadsLoading } = useAllLeadsForStats()
  const { data: reps } = useReps()
  const { data: health, isLoading: healthLoading } = usePipelineHealth()
  const tz = profile.timezone || DEFAULT_TIMEZONE

  const rollup = useMemo(() => {
    if (!leads) return null
    const setters = (reps || []).filter((r) => r.role === 'setter')
    const closers = (reps || []).filter((r) => r.role === 'closer')
    return {
      setters: setters.map((s) => ({ ...s, ...statsForUser(leads, s.id) })),
      closers: closers.map((c) => ({ ...c, ...statsForCloser(leads, c.id) })),
    }
  }, [leads, reps])

  usePageHeader({ title: 'Overview', subtitle: 'Team performance and pipeline health' })

  return (
    <div>
      <div className="flex justify-end">
        <DateClockRow timezone={tz} />
      </div>

      <h2 className="mt-6 font-display text-lg font-medium text-fg-primary">Pipeline health</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Unassigned Pool" value={healthLoading ? '—' : health.unassignedPool} />
        <Tile label="No-Answer Cooldown" value={healthLoading ? '—' : health.noAnswerCooldown} />
        <Tile label="Follow-ups Due Today" value={healthLoading ? '—' : health.followUpsDueToday} />
      </div>

      {leadsLoading || !rollup ? (
        <p className="mt-8 font-sans text-sm text-fg-secondary">Loading…</p>
      ) : (
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

export default function Overview() {
  const { profile } = useAuth()

  if (profile?.role === 'setter') return <SetterOverview profile={profile} />
  if (profile?.role === 'closer') return <CloserOverview profile={profile} />
  if (profile?.role === 'client') return <ClientOverview profile={profile} />
  return <AdminOverview profile={profile} />
}
