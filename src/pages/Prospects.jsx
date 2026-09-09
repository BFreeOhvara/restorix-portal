import { useMemo, useState } from 'react'
import { Search, User } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useMyDeal } from '../hooks/useDeals'
import { AGENT_CATALOG } from '../lib/agentCatalog'
import { STATUS_TINT } from '../components/ui/StatusBadge'
import {
  isTestClient,
  ownedAgents,
  FRONT_RUNNER_KEYS,
  PREVIEW_CONTACTS,
  initials,
} from '../lib/clientPreview'

// Prompt 578 — the client Pipeline (nav label "Pipeline", path /prospects
// since /pipeline is admin-only and /my-pipeline is the closer's). A CRM
// roster: everyone who's reached out and where they stand. This is the
// page Brayden flagged as still feeling incomplete even after signing off
// on the mockup — built to spec, but the most likely one to need a
// follow-up pass.
//
// There is no real per-facility inbound-lead data model in the schema yet
// (deals only carries the sales lead it closed from — nothing downstream
// per client). So: real clients see an honest empty state; the seeded
// test account gets the full mockup-matching master-detail from
// clientPreview.js.
//
// Active / Resolved toggle: shipped as real UI state per the mockup, but
// what makes a contact "Resolved" isn't defined anywhere yet — so for now
// every sample contact lives under Active and Resolved renders an honest
// empty state until Brayden defines the rule.

const DOT = {
  accent: 'bg-accent',
  success: 'bg-success',
  faint: 'bg-fg-faint',
}

function Avatar({ name }) {
  return (
    <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-muted">
      {name === 'Unnamed caller' ? (
        <User size={15} className="text-fg-faint" />
      ) : (
        <span className="font-display text-xs font-semibold text-fg-primary">{initials(name)}</span>
      )}
    </div>
  )
}

function Pill({ status, label }) {
  return (
    <span className={clsx('eyebrow inline-flex shrink-0 rounded-full px-2.5 py-1', STATUS_TINT[status])}>
      {label}
    </span>
  )
}

function EmptyPipeline({ deal }) {
  const owned = ownedAgents(deal)
  const frontRunner = owned.find((k) => FRONT_RUNNER_KEYS.includes(k))
  const agentName = frontRunner ? AGENT_CATALOG[frontRunner]?.label || 'your intake agent' : 'your intake agent'
  return (
    <div className="rounded-card border border-line bg-elevated p-10 text-center">
      <p className="font-sans text-sm text-fg-secondary">
        Your pipeline will appear here once {agentName} is live.
      </p>
    </div>
  )
}

function DetailPanel({ contact, showInsurance, showFollowUp }) {
  return (
    <div className="rounded-card border border-line bg-elevated p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[17px] font-semibold text-fg-primary">{contact.name}</p>
          <p className="mt-1 font-mono text-[12.5px] text-fg-faint [font-variant-numeric:tabular-nums]">{contact.phone}</p>
        </div>
        <Pill status={contact.status} label={contact.pill} />
      </div>

      {(showInsurance || showFollowUp) && (
        <div className="mt-[18px]">
          {showInsurance && (
            <div className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-0">
              <span className="font-sans text-[12.5px] text-fg-secondary">Insurance</span>
              <span className="font-sans text-[12.5px] font-semibold text-fg-primary">{contact.insurance}</span>
            </div>
          )}
          {showFollowUp && (
            <div className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-0">
              <span className="font-sans text-[12.5px] text-fg-secondary">Next follow-up</span>
              <span className="font-sans text-[12.5px] font-semibold text-fg-primary">{contact.followUp}</span>
            </div>
          )}
        </div>
      )}

      <p className="eyebrow !text-fg-faint mt-5">What happened</p>
      <div className="mt-1 flex flex-col">
        {contact.timeline.map((t, i) => (
          <div key={i} className="flex items-start gap-2.5 border-b border-line py-2.5 last:border-0">
            <span className={clsx('mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full', DOT[t.dot])} />
            <div className="min-w-0 flex-1">
              <p className="font-sans text-[13px] leading-snug text-fg-primary">{t.text}</p>
              <p className="mt-0.5 font-sans text-[11px] text-fg-faint">{t.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Prospects() {
  const { session } = useAuth()
  const { data: deal, isLoading, isError } = useMyDeal()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)
  const [view, setView] = useState('active') // 'active' | 'resolved'
  const [selectedId, setSelectedId] = useState(PREVIEW_CONTACTS[0].id)

  const owned = useMemo(() => ownedAgents(deal), [deal])
  const preview =
    isTestClient(session) && owned.some((k) => FRONT_RUNNER_KEYS.includes(k))

  // One filter pill per outcome actually present, first-occurrence order.
  const outcomes = useMemo(() => {
    const seen = []
    for (const c of PREVIEW_CONTACTS) if (!seen.find((o) => o.status === c.status)) seen.push({ status: c.status, label: c.pill })
    return seen
  }, [])

  const visible = useMemo(() => {
    if (view === 'resolved') return []
    const q = search.trim().toLowerCase()
    return PREVIEW_CONTACTS.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.toLowerCase().includes(q)) return false
      return true
    })
  }, [search, statusFilter, view])

  const selected = visible.find((c) => c.id === selectedId) || visible[0] || null

  if (isLoading) {
    return <p className="font-sans text-sm text-fg-secondary">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h1 className="font-display text-2xl font-medium text-fg-primary">Pipeline</h1>
        <p className="mt-1 font-sans text-sm text-fg-secondary">Everyone who's reached out, and where they stand.</p>
      </div>

      {isError || !deal || !preview ? (
        <EmptyPipeline deal={deal} />
      ) : (
        <>
          <div className="relative max-w-[340px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or number…"
              className="w-full rounded-lg border-2 border-line bg-elevated py-2 pl-9 pr-3 font-sans text-sm text-fg-primary shadow-sm outline-none focus:border-accent"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStatusFilter(null)}
                className={clsx(
                  'eyebrow rounded-full px-3 py-1.5 transition-colors hover:opacity-85',
                  statusFilter === null ? 'bg-muted !text-fg-primary' : 'bg-muted !text-fg-secondary'
                )}
              >
                All
              </button>
              {outcomes.map((o) => (
                <button
                  key={o.status}
                  onClick={() => setStatusFilter(statusFilter === o.status ? null : o.status)}
                  className={clsx(
                    'eyebrow rounded-full px-3 py-1.5 transition-colors hover:opacity-85',
                    STATUS_TINT[o.status],
                    statusFilter === o.status && 'ring-1 ring-inset ring-accent'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11.5px] text-fg-faint">
              {['active', 'resolved'].map((v, i) => (
                <span key={v} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden>·</span>}
                  <button
                    onClick={() => setView(v)}
                    className={clsx(
                      'capitalize transition-colors hover:text-fg-primary',
                      view === v ? 'font-semibold text-fg-primary' : ''
                    )}
                  >
                    {v}
                  </button>
                </span>
              ))}
            </div>
          </div>

          {view === 'resolved' ? (
            <div className="rounded-card border border-line bg-elevated p-10 text-center">
              <p className="font-sans text-sm text-fg-secondary">Nothing here yet.</p>
            </div>
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-2">
              <div className="overflow-hidden rounded-card border border-line bg-elevated">
                <div className="max-h-[480px] overflow-y-auto">
                  {visible.length === 0 ? (
                    <p className="p-8 text-center font-sans text-sm text-fg-secondary">No contacts match this filter.</p>
                  ) : (
                    visible.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
                        className={clsx(
                          'flex w-full items-center gap-3 border-b border-line px-[18px] py-[13px] text-left transition-colors last:border-0 hover:bg-surface',
                          selected?.id === c.id && 'bg-surface'
                        )}
                      >
                        <Avatar name={c.name} />
                        <div className="min-w-0 flex-1">
                          <p className="font-sans text-[13.5px] font-semibold text-fg-primary">{c.name}</p>
                          <p className="mt-px font-mono text-xs text-fg-faint [font-variant-numeric:tabular-nums]">{c.phone}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <Pill status={c.status} label={c.pill} />
                          <span className="font-sans text-[11px] text-fg-faint">{c.time}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {selected && (
                <DetailPanel
                  contact={selected}
                  showInsurance={owned.includes('insurance')}
                  showFollowUp={owned.includes('follow_up')}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
