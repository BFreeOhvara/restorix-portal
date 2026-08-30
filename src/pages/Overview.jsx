import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Search, ClipboardEdit, CheckCircle2, Video, AlertTriangle, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useBrand } from '../hooks/useBrand'
import { useMyPool, useMyBooked, useMyFollowUps, useMyNotInterested, useFinishDay, usePipelineHealth } from '../hooks/useLeads'
import { useMyDeal } from '../hooks/useDeals'
import { catalogEntry, CONNECT_LABELS } from '../lib/agentCatalog'
import { useAllLeadsForStats, useReps, statsForUser, statsForCloser, followUpsDueToday, inRange } from '../hooks/useStats'
import StatusBadge, { STATUS_SOLID, STATUS_TINT } from '../components/ui/StatusBadge'
import OutcomeBadge, { OUTCOME_LABELS, OUTCOME_TINT, OUTCOME_SOLID } from '../components/ui/OutcomeBadge'
import { LiveClock } from '../components/ui/LiveClock'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'
import { Button } from '../components/ui/Button'
import { formatPhone } from '../lib/phone'
import { displayOutcome } from '../lib/closerOutcome'
import LogCallModal from '../components/LogCallModal'
import CloserLeadModal from '../components/CloserLeadModal'
import { zonedDateStr, zonedDayRange, mondayOf, shiftDay } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'
import { SearchBar, filterLeads } from './Pipeline'

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
// `nicheTabs` is unused but kept as harmless shared plumbing. `actionsRow`
// is a new slot rendered right above the stat strip — My Leads puts its
// "Request Leads" button there instead of up in `headerRight` by the title.
// Prompt 554 — `embedded` drops SetterOverview's own page header (h1 +
// headerRight slot) so it can be nested as the "Setter" tab inside
// CloserPipeline without a duplicate title. Everything below the header
// (stat strip, search, status sub-tabs, lead table) renders unchanged.
// Prompt 559 — `todayFollowUpOnly` (My Leads only) scopes the Follow-up
// tabs to leads *marked* follow-up on the viewer's local today, keyed off
// last_action_at; once local midnight passes they drop out of My Leads.
// My Pipeline → Setter (embedded) and the setter's own /overview both leave
// it off, so they keep showing every Follow-up lead — same "always visible"
// shape Not Interested has.
export function SetterOverview({ profile, title = 'Overview', headerRight, actionsRow, niche, nicheTabs, embedded = false, todayFollowUpOnly = false }) {
  const { data: pool, isLoading: poolLoading } = useMyPool(profile.id)
  const tz = profile.timezone || DEFAULT_TIMEZONE
  const { data: followUps, isLoading: followUpsLoading } = useMyFollowUps(profile.id, tz)
  const { data: notInterested, isLoading: notInterestedLoading } = useMyNotInterested(profile.id)
  const [callLead, setCallLead] = useState(null)
  const [search, setSearch] = useState('')
  // Prompt 558 — the embedded My Pipeline → Setter tab is a tracking view:
  // no New pill (a closer works New leads from My Leads), so it opens on
  // No Answer instead.
  const [statusFilter, setStatusFilter] = useState(embedded ? 'no_answer' : 'new')
  const isLoading = poolLoading || followUpsLoading || notInterestedLoading

  const leadsByTab = useMemo(() => {
    // Prompt 547 — scope every bucket to the selected niche when the closer's
    // My Leads passes one; identity (no filter) for the setter's /overview.
    const f = (arr) => (niche ? (arr || []).filter((l) => l.niche === niche) : (arr || []))
    // Prompt 559 — on My Leads, drop Follow-up leads not marked today (local
    // date of last_action_at — when it was marked, NOT follow_up_at's
    // scheduled callback date). Identity everywhere else.
    const localToday = zonedDateStr(Date.now(), tz)
    const fu = (arr) =>
      todayFollowUpOnly
        ? (arr || []).filter((l) => l.last_action_at && zonedDateStr(new Date(l.last_action_at).getTime(), tz) === localToday)
        : (arr || [])
    return {
      new: f(pool).filter((l) => l.status === 'new'),
      no_answer: f(pool).filter((l) => l.status === 'no_answer'),
      appointment_booked: f(pool).filter((l) => l.status === 'appointment_booked'),
      follow_up_due: f(fu(followUps?.due)),
      follow_up: f(fu(followUps?.future)),
      not_interested: f(notInterested),
    }
  }, [pool, followUps, notInterested, niche, todayFollowUpOnly, tz])

  const poolCount = useMemo(
    () => (niche ? (pool || []).filter((l) => l.niche === niche).length : pool?.length ?? 0),
    [pool, niche]
  )

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
    const active = leadsByTab[statusFilter] || []
    const q = search.trim().toLowerCase()
    if (!q) return active
    return active.filter((lead) =>
      lead.facility_name?.toLowerCase().includes(q) ||
      lead.contact_name?.toLowerCase().includes(q) ||
      lead.phone?.toLowerCase().includes(q)
    )
  }, [leadsByTab, search, statusFilter])

  return (
    <div>
      {/* Prompt 558 — when embedded (My Pipeline → Setter tab) the wrapper
          owns the title + count line, so no header renders here at all. */}
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-medium text-fg-primary">{title}</h1>
            <p className="mt-1 font-sans text-sm text-fg-secondary">
              {poolCount} lead{poolCount === 1 ? '' : 's'} in your pool
            </p>
          </div>
          {headerRight ?? <DateClockRow timezone={tz} />}
        </div>
      )}

      {/* Prompt 562 — My Leads (2nd pass at the gap complaint): the button
          row + stat tiles pull up tight against the header as one block —
          near-zero margins (mt-1) so subtitle → button → tiles read as a
          single unit, no awkward gap anywhere in that span. /overview + the
          embedded Setter tab are untouched (no actionsRow → TodayStrip mt-4). */}
      {actionsRow && <div className="mt-1 flex justify-end">{actionsRow}</div>}

      {/* Prompt 558 — no stat tiles in the embedded My Pipeline → Setter
          tracking view (kept on /overview and My Leads). */}
      {!embedded && <TodayStrip profile={profile} className={actionsRow ? 'mt-1' : 'mt-4'} />}

      {/* Prompt 547 — "Finish Day" is a setter-only day-end action
          (run_setter_day_end is role-checked to setters), so it's hidden on
          the closer's niche-scoped My Leads, where an empty niche tab would
          otherwise trip the counts.new === 0 condition. */}
      {!isLoading && !niche && counts.new === 0 && <FinishDayCard />}

      {nicheTabs && <div className="mt-6">{nicheTabs}</div>}

      {/* Prompt 558 — embedded has no header/stats/nicheTabs above it, so
          the search row sits right under the wrapper's own tab switcher —
          tighter top margin to match the Closer tab's spacing. */}
      <div className={clsx('flex flex-wrap items-center gap-3', embedded ? 'mt-1' : 'mt-6')}>
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

      <div className="mt-3 flex flex-wrap gap-2">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={clsx(
              'eyebrow rounded-full px-3.5 py-2 transition-colors hover:opacity-85',
              statusFilter === tab.key ? STATUS_SOLID[tab.styleKey] : STATUS_TINT[tab.styleKey]
            )}
          >
            {tab.label} ({counts[tab.key] || 0})
          </button>
        ))}
      </div>

      {/* Own scroll region for the row list, bounded height so the strip/
          search/filters above stay pinned while scrolling a 150-lead pool
          (Prompt 440) — sticky thead so column headers travel with it. */}
      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !filtered.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            {leadsByTab[statusFilter]?.length
              ? 'No leads match this filter.'
              : 'Nothing here right now.'}
          </p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="eyebrow sticky top-0 z-10 bg-surface">
                <tr>
                  <th className="px-5 py-3">Business</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Status</th>
                  {(statusFilter === 'follow_up_due' || statusFilter === 'follow_up') && (
                    <th className="px-5 py-3">Callback</th>
                  )}
                  {/* Prompt 559 Part B — countdown to the 24h No-Answer
                      hold releasing the lead to Unassigned. */}
                  {statusFilter === 'no_answer' && <th className="px-5 py-3">Releases in</th>}
                  {canCallFromTab && <th className="px-5 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={canCallFromTab ? () => setCallLead(lead) : undefined}
                    className={clsx(
                      'border-t border-line font-sans text-sm',
                      canCallFromTab && 'cursor-pointer hover:bg-surface'
                    )}
                  >
                    <td className="px-5 py-4 font-medium text-fg-primary">{lead.facility_name}</td>
                    <td className="px-5 py-4 text-fg-secondary">{formatPhone(lead.phone) || '—'}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={lead.status} />
                    </td>
                    {(statusFilter === 'follow_up_due' || statusFilter === 'follow_up') && (
                      <td className="px-5 py-4 text-fg-secondary">{fmt(lead.follow_up_at)}</td>
                    )}
                    {statusFilter === 'no_answer' && (
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {callLead && <LogCallModal lead={callLead} onClose={() => setCallLead(null)} />}
    </div>
  )
}

// Prompt 540 — 'needs_reschedule' replaced by 'no_show' (derived, see
// lib/closerOutcome.js) as the second tile.
const CLOSER_OUTCOME_TILES = ['pending', 'no_show', 'lost', 'closed']

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

  // Prompt 558 — the count line moves up here (under the title, above the
  // tab switcher) and switches wording with the active tab, matching how
  // every other page stacks title+count. The wrapper reads the same two
  // queries the children do (react-query dedupes identical keys — no extra
  // fetch), niche-filtered the same way, so the children can stop rendering
  // their own copy of this line.
  const { data: bookedLeads } = useMyBooked(profile.id)
  const { data: poolLeads } = useMyPool(profile.id)
  const bookedCount = (bookedLeads || []).filter((l) => l.niche === brand.niche).length
  const poolCount = (poolLeads || []).filter((l) => l.niche === brand.niche).length
  const subtitle =
    view === 'closer'
      ? `${bookedCount} booked lead${bookedCount === 1 ? '' : 's'}`
      : `${poolCount} lead${poolCount === 1 ? '' : 's'} in your pool`

  return (
    <div>
      {/* Prompt 558 — no date on this page at all (Prompt 553 dropped the
          clock, this drops the date too). */}
      <h1 className="font-display text-2xl font-medium text-fg-primary">{title}</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">{subtitle}</p>

      {/* Prompt 554 — Closer = booked appointments (setter-booked + own);
          Setter = leads this closer personally dials via My Leads, i.e.
          SetterOverview scoped to their own id. Empty Setter tab for a
          closer who never self-dials. No Unassigned — admin-only concept. */}
      <div className="mt-4">
        <SegmentedTabs tabs={MY_PIPELINE_TABS} active={view} onChange={setView} />
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

  const counts = useMemo(() => {
    const c = {}
    for (const key of CLOSER_OUTCOME_TILES) c[key] = 0
    for (const lead of leads || []) {
      const outcome = displayOutcome(lead)
      c[outcome] = (c[outcome] || 0) + 1
    }
    return c
  }, [leads])

  // Prompt 542 — restyled to match admin Pipeline's Closer tab: the 4
  // static Tile counts become clickable OUTCOME_TINT/SOLID filter chips
  // (same treatment, same displayOutcome-driven counts), plus a search
  // bar, both reused verbatim from Pipeline.jsx rather than re-implemented
  // here. No "Assigned Closer" column — unlike admin's rollup, every row
  // on this page is already this one closer's own lead.
  const outcomeFiltered = useMemo(
    () => (leads || []).filter((lead) => displayOutcome(lead) === outcomeFilter),
    [leads, outcomeFilter]
  )
  const filtered = useMemo(() => filterLeads(outcomeFiltered, search), [outcomeFiltered, search])

  return (
    <div>
      {/* Prompt 558 — the "N booked leads" line moved up to the CloserPipeline
          wrapper (above the tab switcher). */}
      <div className="flex flex-wrap gap-2">
        {CLOSER_OUTCOME_TILES.map((key) => (
          <button
            key={key}
            onClick={() => setOutcomeFilter(key)}
            className={clsx(
              'eyebrow rounded-full px-3.5 py-2 transition-colors hover:opacity-85',
              outcomeFilter === key ? OUTCOME_SOLID[key] : OUTCOME_TINT[key]
            )}
          >
            {OUTCOME_LABELS[key]} ({isLoading ? 0 : counts[key] || 0})
          </button>
        ))}
      </div>

      <SearchBar value={search} onChange={setSearch} />

      <div className="mt-4 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !filtered.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">
            {outcomeFiltered.length
              ? 'No leads match this search.'
              : leads?.length
                ? 'No booked leads match this filter.'
                : 'No booked leads yet — Strategy Calls are assigned to you automatically.'}
          </p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto">
            <table className="w-full text-left">
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
                {filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setActiveLead(lead)}
                    className="cursor-pointer border-t border-line font-sans text-sm hover:bg-surface"
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
                ))}
              </tbody>
            </table>
          </div>
        )}
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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">{title}</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">Your day at a glance</p>
        </div>
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

// Prompt 546 — the client's own dashboard. Catalog-driven (Brayden's
// "build each agent once" model): renders `deals.front_runner` +
// `deals.sub_agents` as cards, each pulling its copy from the shared
// catalog and showing an honest status (every entry is 'placeholder'
// today, so every card reads "Coming soon" — never hidden). RLS scopes
// `useMyDeal` to this client's own row; there is no other data a client
// can reach.
function ClientAgentCard({ entryKey, hero }) {
  const entry = catalogEntry(entryKey)
  if (!entry) return null
  const isLive = entry.status === 'live'
  return (
    <div
      className={clsx(
        'rounded-card border bg-elevated p-6',
        hero ? 'border-accent/30' : 'border-line'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-lg font-medium text-fg-primary">{entry.label}</p>
        <span
          className={clsx(
            'eyebrow shrink-0 rounded-full px-2.5 py-1',
            isLive ? STATUS_SOLID.appointment_booked : 'bg-muted !text-fg-secondary'
          )}
        >
          {isLive ? 'Live' : 'Coming soon'}
        </span>
      </div>
      {entry.copy?.whatItIs && (
        <p className="mt-2 font-sans text-sm leading-relaxed text-fg-secondary">{entry.copy.whatItIs}</p>
      )}
      {!isLive && entry.needsConnect.length > 0 && (
        <p className="mt-3 font-sans text-xs text-fg-faint">
          We'll walk you through connecting your {entry.needsConnect.map((c) => CONNECT_LABELS[c] || c).join(', ')}{' '}
          once this is ready.
        </p>
      )}
    </div>
  )
}

function ClientOverview({ profile }) {
  const { data: deal, isLoading, isError } = useMyDeal()

  if (isLoading) {
    return <p className="font-sans text-sm text-fg-secondary">Loading…</p>
  }
  if (isError || !deal) {
    return (
      <div>
        <h1 className="font-display text-2xl font-medium text-fg-primary">Welcome{profile.full_name ? `, ${profile.full_name}` : ''}</h1>
        <p className="mt-2 font-sans text-sm text-fg-secondary">
          Your dashboard is being set up. Check back shortly.
        </p>
      </div>
    )
  }

  const facility = deal.lead?.facility_name || 'Your facility'

  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-medium text-fg-primary">{facility}</h1>
        <p className="mt-1 font-sans text-sm text-fg-secondary">Your Restorix setup</p>
      </div>

      <div className="mt-6 space-y-4">
        <ClientAgentCard entryKey={deal.front_runner} hero />
        {(deal.sub_agents || []).map((key) => (
          <ClientAgentCard key={key} entryKey={key} />
        ))}
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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">Overview</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">Team performance and pipeline health</p>
        </div>
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
