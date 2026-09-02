import { useParams, Navigate } from 'react-router-dom'
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
  // Prompt 573 — reshaped from the old flat tiles+rows into what
  // PhoneCallsPreview needs: an avg-pickup speed stat, a 3-stage booking
  // funnel (9 of 24 ≈ the same 38% booking rate the old tile claimed), and
  // the same 8 calls — unchanged outcomes/timestamps — now tagged with a
  // `day` group and, for the two that need a human, an `attention` level.
  intake_triage: {
    avgPickup: 'Instant',
    // Answered → Consult offered → Booked. Conversions: 14/24 = 58%,
    // 9/14 = 64%; overall 9/24 = 38% (the headline booking rate).
    funnel: [
      { label: 'Answered', value: 24 },
      { label: 'Consult offered', value: 14 },
      { label: 'Booked', value: 9 },
    ],
    // status: appointment_booked=green (booked), new=blue (routed to a
    // person), not_interested=red (after-hours crisis escalation),
    // no_answer=gray (still in progress). attention: 'urgent' (red) /
    // 'callback' (amber) surfaces the row in the callout above the log too.
    calls: [
      { ref: '(415) 555-0182', outcome: 'Consult booked for tomorrow 9:00 AM', status: 'appointment_booked', pill: 'Booked', time: '4m ago', day: 'Today' },
      { ref: '(415) 555-0143', outcome: 'Aetna coverage verified, intake booked', status: 'appointment_booked', pill: 'Booked', time: '21m ago', day: 'Today' },
      { ref: '(628) 555-0117', outcome: 'Family asking about detox, routed to clinical', status: 'new', pill: 'Routed to staff', time: '39m ago', day: 'Today' },
      { ref: '(510) 555-0169', outcome: 'Billing question, transferred to front desk', status: 'new', pill: 'Routed to staff', time: '1h ago', day: 'Today' },
      { ref: '(415) 555-0195', outcome: 'After-hours call, crisis language detected — live clinician paged', status: 'not_interested', pill: 'Escalated', time: '2h ago', day: 'Today', attention: 'urgent', attentionReason: 'Crisis language detected after hours — clinician paged, confirm follow-up' },
      { ref: '(925) 555-0134', outcome: 'Callback requested, awaiting return call', status: 'no_answer', pill: 'In progress', time: '3h ago', day: 'Today', attention: 'callback', attentionReason: 'Caller asked for a callback — not yet returned' },
      { ref: '(415) 555-0126', outcome: 'Insurance pre-screen done, consult booked', status: 'appointment_booked', pill: 'Booked', time: '5h ago', day: 'Yesterday' },
      { ref: '(707) 555-0150', outcome: 'Comparing facilities, follow-up sequence started', status: 'no_answer', pill: 'In progress', time: '6h ago', day: 'Yesterday' },
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

function PhoneCallsPreview({ entry, data }) {
  const attention = data.calls.filter((c) => c.attention)
  const days = ['Today', 'Yesterday'].filter((d) => data.calls.some((c) => c.day === d))
  const answered = data.funnel[0].value

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
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow !text-fg-faint">Today at a glance</p>
          <span className="font-sans text-xs text-fg-faint">
            Avg pickup <span className="font-medium text-fg-secondary">{data.avgPickup}</span>
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {data.funnel.map((stage, i) => {
            const conv = i === 0 ? null : Math.round((stage.value / data.funnel[i - 1].value) * 100)
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
        <div className="mt-2 space-y-4">
          {days.map((day) => (
            <div key={day}>
              <p className="eyebrow !text-fg-faint !text-[0.7rem]">{day}</p>
              <div className="mt-1">
                {data.calls.filter((c) => c.day === day).map((c) => (
                  <CallRow key={c.ref + c.time} call={c} />
                ))}
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
