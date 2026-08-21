import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useMyPool, useRequestCloserLeads } from '../hooks/useLeads'
import { Field, inputClass } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { SetterOverview } from './Overview'

const POOL_CAP = 150

// Prompt 509 — closers can now request their own leads from the shared
// unassigned pool instead of only ever receiving already-booked handoffs.
// Deliberately on-demand (a real form + button), not a passive cron
// top-up like `assign_setter_batches` gives setters — Brayden's own
// wording was "request," a closer-initiated action with a chosen count,
// not "automatically topped up to 150" like the setter side. The 150 cap
// itself is the one thing genuinely shared with that mechanism: same
// pool, same ceiling, same `assigned_setter is null and status = 'new'
// order by created_at` selection — just triggered on demand instead of a
// timer, and enforced server-side in `request_closer_leads` (the actual
// clamp), not just this form's max attribute.
function RequestLeadsCard({ currentCount }) {
  const requestLeads = useRequestCloserLeads()
  const [count, setCount] = useState(25)
  const [result, setResult] = useState(null)

  const room = Math.max(0, POOL_CAP - currentCount)

  async function submit(e) {
    e.preventDefault()
    setResult(null)
    const assigned = await requestLeads.mutateAsync(count)
    setResult(assigned)
  }

  return (
    <div className="rounded-card border border-line bg-elevated p-6">
      <p className="font-sans text-sm font-semibold text-fg-primary">Request Leads</p>
      <p className="mt-1 font-sans text-xs text-fg-secondary">
        Pull leads from the shared unassigned pool into your own working queue below. You have{' '}
        <span className="font-medium text-fg-primary">{currentCount}</span> of {POOL_CAP} New leads right now
        — room for {room} more.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="How many">
          <input
            type="number"
            min={0}
            max={room}
            value={count}
            onChange={(e) => setCount(Math.max(0, Math.min(room, Number(e.target.value) || 0)))}
            className={inputClass()}
            style={{ width: 100 }}
          />
        </Field>
        <Button type="submit" disabled={room === 0 || count === 0 || requestLeads.isPending}>
          {requestLeads.isPending ? 'Requesting…' : 'Request'}
        </Button>
        {result !== null && (
          <span className="pb-2 font-sans text-sm text-success">
            {result === 0 ? 'No leads available in the pool right now.' : `Got ${result} lead${result === 1 ? '' : 's'}.`}
          </span>
        )}
      </form>
    </div>
  )
}

export default function MyLeads() {
  const { profile } = useAuth()
  const { data: leads } = useMyPool(profile?.id)
  if (!profile) return null

  const currentNewCount = (leads || []).filter((l) => l.status === 'new').length

  return (
    <div>
      <RequestLeadsCard currentCount={currentNewCount} />
      <div className="mt-6">
        <SetterOverview profile={profile} title="My Leads" />
      </div>
    </div>
  )
}
