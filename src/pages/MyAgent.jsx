import { useParams, Navigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { useMyDeal } from '../hooks/useDeals'
import { catalogEntry, CONNECT_LABELS } from '../lib/agentCatalog'
import { STATUS_SOLID, STATUS_TINT } from '../components/ui/StatusBadge'

// Prompt 565 — a client's per-agent page. Each agent the client purchased
// (deal.front_runner + deal.sub_agents) gets its own sidebar tab that
// routes here (/my-agents/:agentKey). Same catalog lookup + honest status
// ('Coming soon' until an agent is really built) as the Overview cards —
// this is just the full-page view of one agent instead of one card among
// several. Overview itself stays exactly as-is.
//
// Prompt 568 — a preview-only look at what a *live* agent page would be,
// gated behind `?preview=live` (checked with useSearchParams) AND a
// specific agentKey. Nothing about the catalog changes: every entry stays
// `status: 'placeholder'`, so every real client — and this same page
// without the query param — keeps the honest "Coming soon" render below.
// The preview path is hardcoded sample data, no fetching, no new tables —
// it only shows the layout the page would take once there's a real system
// behind it. Reviewed at /my-agents/intake_triage?preview=live as
// test_client (front_runner === 'intake_triage').

// Sample data for the ?preview=live layout only — not fetched, not real.
// Each entry: tiles (4), a log section label, and ~8 rows. `row.status`
// keys into the shared STATUS_TINT color map (StatusBadge.jsx) so pills
// reuse the exact status color language the rest of the app already uses —
// no new colors. `monoRef` renders the row's left value in the mono/phone
// treatment (Phone Calls' caller numbers); omit it for text refs like
// payer names.
const PREVIEW = {
  intake_triage: {
    monoRef: true,
    tiles: [
      { label: 'Calls answered today', value: '24' },
      { label: 'Avg pickup', value: 'Instant' },
      { label: 'Consults booked today', value: '9' },
      { label: 'Booking rate', value: '38%' },
    ],
    logLabel: 'Recent calls',
    // appointment_booked=green (booked), new=blue (routed to a person),
    // not_interested=red (after-hours crisis escalation — Intake &
    // Triage's single strongest differentiator, per its own copy),
    // no_answer=gray (still in progress).
    rows: [
      { ref: '(415) 555-0182', outcome: 'Consult booked for tomorrow 9:00 AM', status: 'appointment_booked', pill: 'Booked', time: '4m ago' },
      { ref: '(415) 555-0143', outcome: 'Aetna coverage verified, intake booked', status: 'appointment_booked', pill: 'Booked', time: '21m ago' },
      { ref: '(628) 555-0117', outcome: 'Family asking about detox, routed to clinical', status: 'new', pill: 'Routed to staff', time: '39m ago' },
      { ref: '(510) 555-0169', outcome: 'Billing question, transferred to front desk', status: 'new', pill: 'Routed to staff', time: '1h ago' },
      { ref: '(415) 555-0195', outcome: 'After-hours call, crisis language detected — live clinician paged', status: 'not_interested', pill: 'Escalated', time: '2h ago' },
      { ref: '(925) 555-0134', outcome: 'Callback requested, awaiting return call', status: 'no_answer', pill: 'In progress', time: '3h ago' },
      { ref: '(415) 555-0126', outcome: 'Insurance pre-screen done, consult booked', status: 'appointment_booked', pill: 'Booked', time: '5h ago' },
      { ref: '(707) 555-0150', outcome: 'Comparing facilities, follow-up sequence started', status: 'no_answer', pill: 'In progress', time: '6h ago' },
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
}

function PreviewTile({ label, value }) {
  return (
    <div className="rounded-card border border-line bg-elevated p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-3xl font-medium text-fg-primary">{value}</p>
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
  const [searchParams] = useSearchParams()
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

  // Prompt 568 — preview-only. `?preview=live` + a specific agentKey with a
  // PREVIEW block renders the live-state layout; nothing else changes and
  // no real client hits this unless they deliberately add the param.
  const previewData = PREVIEW[agentKey]
  const showLivePreview = searchParams.get('preview') === 'live' && !!previewData

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

      {showLivePreview ? (
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
