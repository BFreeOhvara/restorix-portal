import { useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { useMyDeal } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'
import { catalogEntry, CONNECT_LABELS } from '../lib/agentCatalog'
import { STATUS_SOLID, STATUS_TINT } from '../components/ui/StatusBadge'

// Prompt 565 — a client's per-agent page. Each agent the client purchased
// (deal.front_runner + deal.sub_agents) gets its own sidebar tab that
// routes here (/my-agents/:agentKey). Same catalog lookup + honest status
// ('Coming soon' until an agent is really built) as the Overview cards —
// this is just the full-page view of one agent instead of one card among
// several. Overview itself stays exactly as-is.
//
// Prompt 568/569 — a preview-only look at what a *live* agent page would
// be, for agents that have a PREVIEW block below. Nothing about the
// catalog changes: every entry stays `status: 'placeholder'`, so every
// real client keeps the honest "Coming soon" render below.
//
// Prompt 572 — the preview used to be gated behind a `?preview=live` query
// param (568/569). That was a URL trick Brayden had to remember to type.
// Replaced with an account-identity check: the preview renders only for
// the one seeded test account (`test_client`), identified by its
// authenticated email off the Supabase session (server-issued, not
// URL-based, not client-editable — a real client can never trigger it).
// So `test_client` now just sees the preview on normal navigation to any
// /my-agents/:key that has a PREVIEW block (intake_triage, insurance,
// follow_up, bed_sync); everyone else sees the unchanged placeholder. The
// preview path is hardcoded sample data, no fetching, no new tables.
//
// Prompt 571 — Bed Availability (`bed_sync`) gets its own render
// (`BedAvailabilityPreview`) instead of the shared tiles+log `LivePreview`.
// It's continuously-synced state (open beds per program), not a stream of
// discrete per-lead outcomes, so an "outcome pill per row" log would
// misrepresent it — occupancy bars + a light sync-activity feed instead.
//
// Prompt 573 — Phone Calls (`intake_triage`) also gets its own render
// (`PhoneCallsPreview`): a "needs your attention" callout for calls a human
// has to act on, a booked-consult funnel (Answered → Consult offered →
// Booked) instead of four flat tiles, and the call log grouped by day. So
// intake_triage / insurance / follow_up no longer all look like the same
// generic page. insurance + follow_up keep the shared `LivePreview` until
// each gets its own turn.
//
// Prompt 574 — Phone Calls' `intake_triage` preview data went from one flat
// { avgPickup, funnel, calls } to a `days` array (most-recent-first), each
// day carrying its own `daysAgo` / `avgPickup` / `funnel` / `calls`.
// PhoneCallsPreview gained a day navigator (chevrons + label, in the row
// that already held "Avg pickup") that pages the funnel + call log together
// through the sample days, and a row of status-filter pills above the log.
// The "Needs your attention" panel is unaffected by the navigator — it
// always reads day 0 ("right now"). Real calendar dates are computed from
// `daysAgo` at render, never hardcoded.

// `test_client` logs in as the username `test_client`, which useAuth.jsx
// maps to `<username>@restorix.internal`. This is the authenticated
// session email, so it can't be spoofed from the client.
const TEST_CLIENT_EMAIL = 'test_client@restorix.internal'

// Sample data for the test-account live preview only — not fetched, not real.
// Each entry: tiles (4), a log section label, and ~8 rows. `row.status`
// keys into the shared STATUS_TINT color map (StatusBadge.jsx) so pills
// reuse the exact status color language the rest of the app already uses —
// no new colors. `monoRef` renders the row's left value in the mono/phone
// treatment (Phone Calls' caller numbers); omit it for text refs like
// payer names.
const PREVIEW = {
  // Prompt 574 — `days` array, most-recent-first, one entry per browsable
  // day. daysAgo 0 + 1 carry the exact numbers + calls shipped in 573
  // (funnel 24/14/9, avgPickup "Instant", the same rows split onto their
  // original Today/Yesterday day) — unchanged, just relocated into the new
  // shape. daysAgo 2/3/4 are three more sample days in the same style,
  // staying inside the outcome vocabulary (Booked / Routed to staff /
  // Escalated / In progress → appointment_booked / new / not_interested /
  // no_answer). Only day 0 carries `attention` rows — the attention panel
  // always reads day 0 regardless of which day the navigator is showing.
  // No hardcoded dates: PhoneCallsPreview's dayLabel() derives the real
  // date from `daysAgo` at render.
  intake_triage: {
    days: [
      {
        daysAgo: 0,
        avgPickup: 'Instant',
        // Answered → Consult offered → Booked. 14/24 = 58%, 9/14 = 64%;
        // overall 9/24 = 38% (the headline booking rate).
        funnel: [
          { label: 'Answered', value: 24 },
          { label: 'Consult offered', value: 14 },
          { label: 'Booked', value: 9 },
        ],
        calls: [
          { ref: '(415) 555-0182', outcome: 'Consult booked for tomorrow 9:00 AM', status: 'appointment_booked', pill: 'Booked', time: '4m ago' },
          { ref: '(415) 555-0143', outcome: 'Aetna coverage verified, intake booked', status: 'appointment_booked', pill: 'Booked', time: '21m ago' },
          { ref: '(628) 555-0117', outcome: 'Family asking about detox, routed to clinical', status: 'new', pill: 'Routed to staff', time: '39m ago' },
          { ref: '(510) 555-0169', outcome: 'Billing question, transferred to front desk', status: 'new', pill: 'Routed to staff', time: '1h ago' },
          { ref: '(415) 555-0195', outcome: 'After-hours call, crisis language detected — live clinician paged', status: 'not_interested', pill: 'Escalated', time: '2h ago', attention: 'urgent', attentionReason: 'Crisis language detected after hours — clinician paged, confirm follow-up' },
          { ref: '(925) 555-0134', outcome: 'Callback requested, awaiting return call', status: 'no_answer', pill: 'In progress', time: '3h ago', attention: 'callback', attentionReason: 'Caller asked for a callback — not yet returned' },
        ],
      },
      {
        daysAgo: 1,
        avgPickup: 'Instant',
        funnel: [
          { label: 'Answered', value: 24 },
          { label: 'Consult offered', value: 14 },
          { label: 'Booked', value: 9 },
        ],
        calls: [
          { ref: '(415) 555-0126', outcome: 'Insurance pre-screen done, consult booked', status: 'appointment_booked', pill: 'Booked', time: '5h ago' },
          { ref: '(707) 555-0150', outcome: 'Comparing facilities, follow-up sequence started', status: 'no_answer', pill: 'In progress', time: '6h ago' },
        ],
      },
      {
        daysAgo: 2,
        avgPickup: 'Instant',
        funnel: [
          { label: 'Answered', value: 22 },
          { label: 'Consult offered', value: 13 },
          { label: 'Booked', value: 8 },
        ],
        calls: [
          { ref: '(415) 555-0177', outcome: 'Consult booked for Friday 2:00 PM', status: 'appointment_booked', pill: 'Booked', time: '9:12 AM' },
          { ref: '(510) 555-0140', outcome: 'Cigna benefits verified, intake scheduled', status: 'appointment_booked', pill: 'Booked', time: '10:35 AM' },
          { ref: '(628) 555-0158', outcome: 'Referral from ER, routed to admissions', status: 'new', pill: 'Routed to staff', time: '11:48 AM' },
          { ref: '(925) 555-0193', outcome: 'Pricing question, transferred to billing', status: 'new', pill: 'Routed to staff', time: '1:20 PM' },
          { ref: '(707) 555-0121', outcome: 'Prospective patient weighing options, nurture started', status: 'no_answer', pill: 'In progress', time: '3:05 PM' },
          { ref: '(415) 555-0166', outcome: 'Left voicemail, awaiting callback', status: 'no_answer', pill: 'In progress', time: '4:40 PM' },
        ],
      },
      {
        daysAgo: 3,
        avgPickup: 'Instant',
        funnel: [
          { label: 'Answered', value: 19 },
          { label: 'Consult offered', value: 11 },
          { label: 'Booked', value: 7 },
        ],
        calls: [
          { ref: '(415) 555-0138', outcome: 'Consult booked for Monday 11:00 AM', status: 'appointment_booked', pill: 'Booked', time: '8:50 AM' },
          { ref: '(628) 555-0104', outcome: 'Aetna verified, intake booked same week', status: 'appointment_booked', pill: 'Booked', time: '10:02 AM' },
          { ref: '(510) 555-0187', outcome: 'Alumni asking about aftercare, routed to clinical', status: 'new', pill: 'Routed to staff', time: '12:15 PM' },
          { ref: '(925) 555-0149', outcome: 'After-hours call, safety concern — on-call clinician paged', status: 'not_interested', pill: 'Escalated', time: '9:30 PM' },
          { ref: '(707) 555-0172', outcome: 'Comparing in-network options, follow-up scheduled', status: 'no_answer', pill: 'In progress', time: '2:25 PM' },
        ],
      },
      {
        daysAgo: 4,
        avgPickup: 'Instant',
        funnel: [
          { label: 'Answered', value: 26 },
          { label: 'Consult offered', value: 15 },
          { label: 'Booked', value: 10 },
        ],
        calls: [
          { ref: '(415) 555-0110', outcome: 'Consult booked for Thursday 9:30 AM', status: 'appointment_booked', pill: 'Booked', time: '8:15 AM' },
          { ref: '(628) 555-0163', outcome: 'BCBS verified, intake scheduled', status: 'appointment_booked', pill: 'Booked', time: '9:40 AM' },
          { ref: '(510) 555-0129', outcome: 'UnitedHealthcare verified, consult booked', status: 'appointment_booked', pill: 'Booked', time: '11:05 AM' },
          { ref: '(925) 555-0155', outcome: 'Employer EAP referral, routed to admissions', status: 'new', pill: 'Routed to staff', time: '12:30 PM' },
          { ref: '(707) 555-0198', outcome: 'Records request, transferred to front desk', status: 'new', pill: 'Routed to staff', time: '1:55 PM' },
          { ref: '(415) 555-0141', outcome: 'Family gathering information, nurture sequence started', status: 'no_answer', pill: 'In progress', time: '3:45 PM' },
          { ref: '(628) 555-0176', outcome: 'Callback requested for insurance details', status: 'no_answer', pill: 'In progress', time: '5:10 PM' },
        ],
      },
    ],
  },
  insurance: {
    tiles: [
      { label: 'Verifications today', value: '17' },
      { label: 'Avg turnaround', value: '45 sec' },
      { label: 'Confirmed in-network', value: '71%' },
      { label: 'Flagged for staff', value: '3' },
    ],
    logLabel: 'Recent verifications',
    // appointment_booked=green (confirmed, in-network), new=blue (confirmed,
    // out-of-network), no_answer=gray (no coverage on file / self-pay),
    // not_interested=red (coverage expired or inactive — the one case
    // worth surfacing distinctly, parallel to Phone Calls' escalation row).
    rows: [
      { ref: 'Aetna', outcome: 'Eligible, in-network — behavioral health covered', status: 'appointment_booked', pill: 'In-network', time: '6m ago' },
      { ref: 'Blue Cross Blue Shield', outcome: 'Eligible, in-network — deductible met', status: 'appointment_booked', pill: 'In-network', time: '19m ago' },
      { ref: 'Cigna', outcome: 'Out-of-network benefits only, staff to confirm rate', status: 'new', pill: 'Out-of-network', time: '34m ago' },
      { ref: 'UnitedHealthcare', outcome: 'Eligible, in-network — prior auth required', status: 'appointment_booked', pill: 'In-network', time: '52m ago' },
      { ref: 'Humana', outcome: 'Policy inactive as of last month — flagged for staff', status: 'not_interested', pill: 'Coverage expired', time: '1h ago' },
      { ref: 'Self-pay', outcome: 'No coverage on file, self-pay estimate sent', status: 'no_answer', pill: 'Self-pay', time: '2h ago' },
      { ref: 'Optum / UMR', outcome: 'Out-of-network, single-case agreement possible', status: 'new', pill: 'Out-of-network', time: '4h ago' },
      { ref: 'Kaiser Permanente', outcome: 'No behavioral health benefit on this plan', status: 'no_answer', pill: 'No coverage', time: '5h ago' },
    ],
  },
  follow_up: {
    monoRef: true,
    tiles: [
      { label: 'Active sequences', value: '6' },
      { label: 'Messages sent today', value: '14' },
      { label: 'Re-engaged this week', value: '3' },
      { label: 'Avg days to book', value: '2.4' },
    ],
    logLabel: 'Recent activity',
    // appointment_booked=green (replied, booked), no_answer=gray (in
    // sequence, awaiting a response), follow_up=yellow (replied but not
    // ready yet — the app's own "follow-up" color, reused for exactly that
    // meaning), not_interested=red (opted out — the one standout case,
    // parallel to Phone Calls' escalation and Insurance's expired coverage).
    rows: [
      { ref: '(415) 555-0188', outcome: 'Text 2 of 4 — replied, consult booked Thursday', status: 'appointment_booked', pill: 'Booked', time: '8m ago' },
      { ref: '(628) 555-0132', outcome: 'Email opened, no reply yet', status: 'no_answer', pill: 'In sequence', time: '25m ago' },
      { ref: '(510) 555-0175', outcome: 'Call — spoke with spouse, wants to wait a week', status: 'follow_up', pill: 'Nurturing', time: '1h ago' },
      { ref: '(415) 555-0149', outcome: 'Text 1 of 4 delivered', status: 'no_answer', pill: 'In sequence', time: '2h ago' },
      { ref: '(925) 555-0117', outcome: 'Replied STOP — removed from sequence', status: 'not_interested', pill: 'Opted out', time: '3h ago' },
      { ref: '(707) 555-0163', outcome: 'Email 3 of 5 — replied with questions, still deciding', status: 'follow_up', pill: 'Nurturing', time: '4h ago' },
      { ref: '(415) 555-0154', outcome: 'Text — replied, booked intake for tomorrow', status: 'appointment_booked', pill: 'Booked', time: '5h ago' },
      { ref: '(628) 555-0109', outcome: 'Day 3 call attempt, left voicemail', status: 'no_answer', pill: 'In sequence', time: '6h ago' },
    ],
  },
  // Prompt 571 — different shape (see BedAvailabilityPreview): occupancy
  // state, not an outcome log. `sub` on the first tile renders the "/ 18"
  // smaller/fainter after the value. Bar fill = open/total per program,
  // matching the "Occupancy 67%" tile (12/18).
  bed_sync: {
    tiles: [
      { label: 'Beds open', value: '12', sub: '/ 18' },
      { label: 'Occupancy', value: '67%' },
      { label: 'Programs synced', value: '3' },
      { label: 'Last synced', value: '2 min ago' },
    ],
    programs: [
      { name: 'Detox', open: 4, total: 6 },
      { name: 'Residential', open: 6, total: 9 },
      { name: 'PHP / day program', open: 2, total: 3 },
    ],
    // kind → dot color: released=green (bed opened up), held=blue (bed
    // reserved/held), staff=gray (manual staff update). Not outcome pills —
    // this isn't a per-lead win/loss.
    activity: [
      { kind: 'released', text: 'Detox wing — 2 beds released after discharge', time: '12m ago' },
      { kind: 'held', text: 'Residential — 1 bed held for incoming transfer', time: '48m ago' },
      { kind: 'staff', text: 'PHP — capacity updated by staff', time: '2h ago' },
      { kind: 'released', text: 'Residential — 1 bed released', time: '3h ago' },
      { kind: 'held', text: 'Detox — 1 bed reserved for scheduled admit', time: '5h ago' },
      { kind: 'staff', text: 'Detox — bed count reconciled with EHR', time: '7h ago' },
    ],
  },
}

const SYNC_DOT = {
  released: 'bg-success',
  held: 'bg-accent-bright',
  staff: 'bg-fg-faint',
}

function PreviewTile({ label, value, sub }) {
  return (
    <div className="rounded-card border border-line bg-elevated p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-3xl font-medium text-fg-primary">
        {value}
        {sub && <span className="ml-1 text-xl text-fg-faint">{sub}</span>}
      </p>
    </div>
  )
}

function BedAvailabilityPreview({ entry, data }) {
  return (
    <div className="mt-6 space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {data.tiles.map((t) => (
          <PreviewTile key={t.label} label={t.label} value={t.value} sub={t.sub} />
        ))}
      </div>

      <div>
        <p className="eyebrow !text-fg-faint">By program</p>
        <div className="mt-3 space-y-4">
          {data.programs.map((p) => (
            <div key={p.name} className="flex items-center gap-4">
              <span className="w-40 shrink-0 font-sans text-sm text-fg-primary">{p.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.round((p.open / p.total) * 100)}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-sm text-fg-secondary [font-variant-numeric:tabular-nums]">
                {p.open} / {p.total} open
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="eyebrow !text-fg-faint">Recent sync activity</p>
        <div className="mt-2">
          {data.activity.map((a) => (
            <div key={a.text} className="flex items-start gap-3 border-b border-line py-3 last:border-0">
              <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', SYNC_DOT[a.kind])} />
              <span className="min-w-0 flex-1 font-sans text-sm text-fg-secondary">{a.text}</span>
              <span className="shrink-0 font-sans text-xs text-fg-faint">{a.time}</span>
            </div>
          ))}
        </div>
      </div>

      {entry.copy?.whatItDoes && (
        <p className="max-w-2xl font-sans text-xs leading-relaxed text-fg-faint">{entry.copy.whatItDoes}</p>
      )}
    </div>
  )
}

// Prompt 573 — one call row, shared by PhoneCallsPreview's day groups.
// Same treatment LivePreview uses (mono number, one-line outcome,
// STATUS_TINT pill, relative time).
function CallRow({ call }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-0">
      <div className="min-w-0">
        <p className="font-mono text-sm text-fg-primary [font-variant-numeric:tabular-nums]">{call.ref}</p>
        <p className="mt-0.5 font-sans text-sm text-fg-secondary">{call.outcome}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={clsx('eyebrow inline-flex rounded-full px-2.5 py-1', STATUS_TINT[call.status])}>
          {call.pill}
        </span>
        <span className="font-sans text-xs text-fg-faint">{call.time}</span>
      </div>
    </div>
  )
}

// Prompt 574 — real date label for a day N days back, computed at render so
// it's never frozen to the day this was built. 0 → "Today", 1 →
// "Yesterday", older → a short formatted date ("Mon, Aug 31").
function dayLabel(daysAgo) {
  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function PhoneCallsPreview({ entry, data }) {
  const days = data.days // most-recent-first: index 0 == Today
  const [idx, setIdx] = useState(0)
  // Switching days always clears the status filter — a filter picked on one
  // day silently carrying into a day with different outcomes just looks broken.
  const [filter, setFilter] = useState(null)
  const goToDay = (next) => {
    setIdx(next)
    setFilter(null)
  }

  const day = days[idx]
  const atToday = idx <= 0
  const atOldest = idx >= days.length - 1
  const answered = day.funnel[0].value

  // The attention panel is "what needs action right now" — always day 0,
  // never the browsed day.
  const attention = (days.find((d) => d.daysAgo === 0)?.calls || []).filter((c) => c.attention)

  // One filter pill per outcome actually present in this day's calls (first
  // occurrence order), so a day with no escalations shows no "Escalated" pill.
  const outcomes = []
  for (const c of day.calls) if (!outcomes.includes(c.status)) outcomes.push(c.status)
  const pillLabel = (status) => day.calls.find((c) => c.status === status).pill
  const shownCalls = filter ? day.calls.filter((c) => c.status === filter) : day.calls

  return (
    <div className="mt-6 space-y-8">
      {attention.length > 0 && (
        <div>
          <p className="eyebrow !text-fg-faint">Needs your attention</p>
          <div className="mt-3 space-y-3">
            {attention.map((c) => (
              <div key={c.ref} className="flex overflow-hidden rounded-card border border-line bg-elevated">
                <div className={clsx('w-1 shrink-0', c.attention === 'urgent' ? 'bg-danger' : 'bg-yellow-600')} />
                <div className="flex flex-1 items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-fg-primary [font-variant-numeric:tabular-nums]">{c.ref}</p>
                    <p className="mt-0.5 font-sans text-sm text-fg-secondary">{c.attentionReason || c.outcome}</p>
                  </div>
                  <span className="shrink-0 font-sans text-xs text-fg-faint">{c.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3">
          {/* Prompt 574 — day navigator replaces the old static "Today at a
              glance" label. Left = older, right = newer; each end disables at
              the edge of the sample data. Paging re-renders the funnel + call
              log below for that day together. */}
          <div className="flex items-center gap-1 rounded-full border border-line bg-elevated p-1">
            <button
              onClick={() => goToDay(idx + 1)}
              disabled={atOldest}
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary disabled:opacity-30 disabled:hover:bg-transparent"
              title="Previous day"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-[104px] text-center font-sans text-xs font-medium text-fg-primary">
              {dayLabel(day.daysAgo)}
            </span>
            <button
              onClick={() => goToDay(idx - 1)}
              disabled={atToday}
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary disabled:opacity-30 disabled:hover:bg-transparent"
              title="Next day"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <span className="font-sans text-xs text-fg-faint">
            Avg pickup <span className="font-medium text-fg-secondary">{day.avgPickup}</span>
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {day.funnel.map((stage, i) => {
            const conv = i === 0 ? null : Math.round((stage.value / day.funnel[i - 1].value) * 100)
            return (
              <div key={stage.label} className="flex items-center gap-4">
                <span className="w-32 shrink-0 font-sans text-sm text-fg-primary">{stage.label}</span>
                <div className="h-8 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="flex h-full items-center rounded bg-accent px-3"
                    style={{ width: `${Math.round((stage.value / answered) * 100)}%` }}
                  >
                    <span className="font-display text-sm font-medium text-white">{stage.value}</span>
                  </div>
                </div>
                <span className="w-12 shrink-0 text-right font-mono text-xs text-fg-faint [font-variant-numeric:tabular-nums]">
                  {conv != null ? `${conv}%` : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <p className="eyebrow !text-fg-faint">Recent calls</p>
        {/* Prompt 574 — status filter pills. Same selected/unselected
            treatment as the lead-pipeline pills (STATUS_SOLID / STATUS_TINT);
            "All" uses the neutral no_answer treatment. Clicking a pill again
            (or "All") clears the filter. */}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter(null)}
            className={clsx(
              'eyebrow rounded-full px-3 py-1.5 transition-colors hover:opacity-85',
              filter === null ? STATUS_SOLID.no_answer : STATUS_TINT.no_answer
            )}
          >
            All
          </button>
          {outcomes.map((status) => (
            <button
              key={status}
              onClick={() => setFilter(filter === status ? null : status)}
              className={clsx(
                'eyebrow rounded-full px-3 py-1.5 transition-colors hover:opacity-85',
                filter === status ? STATUS_SOLID[status] : STATUS_TINT[status]
              )}
            >
              {pillLabel(status)}
            </button>
          ))}
        </div>
        <div className="mt-2">
          {shownCalls.map((c) => (
            <CallRow key={c.ref + c.time} call={c} />
          ))}
        </div>
      </div>

      {entry.copy?.whatItDoes && (
        <p className="max-w-2xl font-sans text-xs leading-relaxed text-fg-faint">{entry.copy.whatItDoes}</p>
      )}
    </div>
  )
}

function LivePreview({ entry, data }) {
  return (
    <div className="mt-6 space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {data.tiles.map((t) => (
          <PreviewTile key={t.label} label={t.label} value={t.value} />
        ))}
      </div>

      <div>
        <p className="eyebrow !text-fg-faint">{data.logLabel}</p>
        <div className="mt-2">
          {data.rows.map((r) => (
            <div
              key={r.ref + r.time}
              className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-0"
            >
              <div className="min-w-0">
                <p
                  className={clsx(
                    'text-sm text-fg-primary',
                    data.monoRef ? 'font-mono [font-variant-numeric:tabular-nums]' : 'font-sans font-medium'
                  )}
                >
                  {r.ref}
                </p>
                <p className="mt-0.5 font-sans text-sm text-fg-secondary">{r.outcome}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={clsx('eyebrow inline-flex rounded-full px-2.5 py-1', STATUS_TINT[r.status])}>
                  {r.pill}
                </span>
                <span className="font-sans text-xs text-fg-faint">{r.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {entry.copy?.whatItDoes && (
        <p className="max-w-2xl font-sans text-xs leading-relaxed text-fg-faint">{entry.copy.whatItDoes}</p>
      )}
    </div>
  )
}

export default function MyAgent() {
  const { agentKey } = useParams()
  const { session } = useAuth()
  const { data: deal, isLoading, isError } = useMyDeal()

  if (isLoading) {
    return <p className="font-sans text-sm text-fg-secondary">Loading…</p>
  }

  // Guard: only render an agent that's actually in this client's own deal.
  // A hand-typed URL for an agent they didn't buy, a stale key, or no deal
  // yet all fall back to /overview — useMyDeal is already RLS-scoped to the
  // caller's row, this just keeps a client off an agent page that isn't
  // part of their plan.
  const owned = deal ? [deal.front_runner, ...(deal.sub_agents || [])].filter(Boolean) : []
  if (isError || !deal || !owned.includes(agentKey)) {
    return <Navigate to="/overview" replace />
  }

  const entry = catalogEntry(agentKey)
  if (!entry) return <Navigate to="/overview" replace />

  // Prompt 572 — preview renders only for the seeded test account (checked
  // against the authenticated session email, not a URL param) and only for
  // an agentKey that has a PREVIEW block. Every real client falls through
  // to the unchanged placeholder below.
  const isTestClient = session?.user?.email === TEST_CLIENT_EMAIL
  const previewData = PREVIEW[agentKey]
  const showLivePreview = isTestClient && !!previewData

  const isLive = entry.status === 'live' || showLivePreview

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        {/* Prompt 567 — heading now matches the sidebar tab that links here
            (navLabel, e.g. "Phone Calls") instead of the fuller internal
            `label` ("Inbound Intake & Triage") — otherwise a client clicks a
            client-friendly tab and lands on a page titled with the same
            internal jargon Prompt 565/567 renamed the tab away from.
            Overview's own cards are untouched; this is the one page they
            link into. */}
        <h1 className="font-display text-2xl font-medium text-fg-primary">{entry.navLabel || entry.label}</h1>
        <span
          className={clsx(
            'eyebrow shrink-0 rounded-full px-2.5 py-1',
            isLive ? STATUS_SOLID.appointment_booked : 'bg-muted !text-fg-secondary'
          )}
        >
          {isLive ? 'Live' : 'Coming soon'}
        </span>
      </div>

      {showLivePreview && agentKey === 'intake_triage' ? (
        <PhoneCallsPreview entry={entry} data={previewData} />
      ) : showLivePreview && agentKey === 'bed_sync' ? (
        <BedAvailabilityPreview entry={entry} data={previewData} />
      ) : showLivePreview ? (
        <LivePreview entry={entry} data={previewData} />
      ) : (
        <div className="mt-6 max-w-2xl space-y-5">
          {entry.copy?.whatItIs && (
            <div>
              <p className="eyebrow !text-fg-faint">What it is</p>
              <p className="mt-1 font-sans text-sm leading-relaxed text-fg-secondary">{entry.copy.whatItIs}</p>
            </div>
          )}
          {entry.copy?.whatItDoes && (
            <div>
              <p className="eyebrow !text-fg-faint">Why it matters</p>
              <p className="mt-1 font-sans text-sm leading-relaxed text-fg-secondary">{entry.copy.whatItDoes}</p>
            </div>
          )}
          {!isLive && entry.needsConnect.length > 0 && (
            <p className="font-sans text-xs text-fg-faint">
              We'll walk you through connecting your{' '}
              {entry.needsConnect.map((c) => CONNECT_LABELS[c] || c).join(', ')} once this is ready.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
