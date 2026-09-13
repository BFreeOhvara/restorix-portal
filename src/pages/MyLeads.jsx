import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useBrand } from '../hooks/useBrand'
import { useMyPool, useRequestCloserLeads } from '../hooks/useLeads'
import { Field, inputClass } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { STATUS_SOLID } from '../components/ui/StatusBadge'
import { SetterOverview } from './Overview'

const POOL_CAP = 150

// Prompt 543 — closers can pull from either vertical's pool.
// Prompt 547 — My Leads was split into two niche tabs (Behavioral Health /
// Bail Bonds), the active tab driving the Request Leads modal.
// Prompt 555 — that tab is gone. `portal.restorix.co` only serves
// behavioral_health closers and `portal.suretix.co` only serves bail_bonds
// closers, so the niche is fixed by the portal (`useBrand()`), not chosen
// by hand. `request_closer_leads(p_count, p_niche)` is unchanged.
const NICHE_LABEL = { behavioral_health: 'Behavioral Health', bail_bonds: 'Bail Bonds' }
const nicheLabel = (v) => NICHE_LABEL[v] ?? v

// Prompt 509 — closers request their own leads from the shared unassigned
// pool on demand (a real form + button), not a passive cron top-up like
// setters get. The 150 cap is the one thing genuinely shared with that
// mechanism (same pool, same ceiling, same selection), enforced
// server-side in `request_closer_leads` against the closer's TOTAL New
// count (both niches), not just this form's max.
//
// Prompt 544 — this form moved out of a full-width inline card and into a
// centered modal opened by a compact "Request Leads" button in the page
// header (styled to match the per-row Call pills).
// Prompt 547 — the niche is now fixed by the active tab and passed in as a
// prop; the in-modal Niche <select> is gone. `currentCount` stays the
// closer's total New count so the cap math is unchanged.
// Prompt 587 — a wheel row is ROW_HEIGHT tall; WHEEL_HEIGHT is padded so the
// first and last rows can still scroll to center (padding = half the
// leftover space on each side).
const ROW_HEIGHT = 32
const WHEEL_HEIGHT = 128
const WHEEL_PADDING = (WHEEL_HEIGHT - ROW_HEIGHT) / 2

function RequestLeadsForm({ niche, currentCount, onClose }) {
  const requestLeads = useRequestCloserLeads()
  // Prompt 587 — `raw` is the field's live text, kept free of any forced
  // numeric coercion so backspacing to nothing leaves it genuinely empty
  // instead of snapping back to "0" (which is what let fresh digits get
  // appended onto a stray "0"). It's clamped into a real number only at the
  // checkpoints that need one: blur, submit, and the wheel's derived value.
  const [raw, setRaw] = useState('25')
  const [result, setResult] = useState(null)
  const wheelRef = useRef(null)
  const scrollEndTimeout = useRef(null)
  const wheelDrivenScroll = useRef(false)

  const room = Math.max(0, POOL_CAP - currentCount)
  const value = raw === '' ? 0 : Math.max(0, Math.min(room, Number(raw) || 0))

  // Keep the wheel in sync when the count changes via typing (not while the
  // wheel itself is mid-scroll, so it doesn't fight the user's gesture).
  useEffect(() => {
    if (wheelDrivenScroll.current) return
    wheelRef.current?.scrollTo({ top: value * ROW_HEIGHT, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    if (wheelRef.current) wheelRef.current.scrollTop = value * ROW_HEIGHT
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleWheelScroll() {
    wheelDrivenScroll.current = true
    clearTimeout(scrollEndTimeout.current)
    scrollEndTimeout.current = setTimeout(() => {
      const el = wheelRef.current
      if (el) {
        const picked = Math.max(0, Math.min(room, Math.round(el.scrollTop / ROW_HEIGHT)))
        setRaw(String(picked))
      }
      wheelDrivenScroll.current = false
    }, 120)
  }

  function handleBlur() {
    setRaw(String(value))
  }

  async function submit(e) {
    e.preventDefault()
    setResult(null)
    const assigned = await requestLeads.mutateAsync({ count: value, niche })
    setResult(assigned)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="font-sans text-xs text-fg-secondary">
        Pull <span className="font-medium text-fg-primary">{nicheLabel(niche)}</span> leads from the shared
        unassigned pool into your own working queue. You have{' '}
        <span className="font-medium text-fg-primary">{currentCount}</span> of {POOL_CAP} New leads right now
        — room for {room} more.
      </p>
      <div className="flex items-start gap-4">
        <Field label="How many">
          <input
            type="number"
            min={0}
            max={room}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={handleBlur}
            className={inputClass()}
          />
        </Field>
        <div className="mt-1.5">
          <div
            ref={wheelRef}
            onScroll={handleWheelScroll}
            className="w-20 overflow-y-auto rounded-lg border border-line bg-base"
            style={{ height: WHEEL_HEIGHT, scrollSnapType: 'y mandatory', paddingBlock: WHEEL_PADDING }}
          >
            {Array.from({ length: room + 1 }, (_, n) => n).map((n) => (
              <div
                key={n}
                style={{ height: ROW_HEIGHT, scrollSnapAlign: 'center' }}
                className={clsx(
                  'flex items-center justify-center font-sans text-sm transition-opacity',
                  n === value ? 'font-semibold text-fg-primary opacity-100' : 'text-fg-secondary opacity-40'
                )}
              >
                {n}
              </div>
            ))}
          </div>
        </div>
      </div>
      {result !== null && (
        <p className={`font-sans text-sm ${result === 0 ? 'text-fg-secondary' : 'text-success'}`}>
          {result === 0
            ? `No ${nicheLabel(niche)} leads available in the pool right now.`
            : `Got ${result} lead${result === 1 ? '' : 's'}.`}
        </p>
      )}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button type="submit" disabled={room === 0 || value === 0 || requestLeads.isPending}>
          {requestLeads.isPending ? 'Requesting…' : 'Request'}
        </Button>
      </div>
    </form>
  )
}

function RequestLeadsButton({ niche, currentCount }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          'inline-flex items-center gap-2 rounded-full px-4 py-2 font-sans text-sm font-semibold transition-colors hover:opacity-90',
          STATUS_SOLID.new
        )}
      >
        <Plus size={15} /> Request Leads
      </button>
      {open && (
        <Modal title={`Request ${nicheLabel(niche)} Leads`} onClose={() => setOpen(false)}>
          <RequestLeadsForm niche={niche} currentCount={currentCount} onClose={() => setOpen(false)} />
        </Modal>
      )}
    </>
  )
}

export default function MyLeads() {
  const { profile } = useAuth()
  const { niche } = useBrand()
  const { data: leads } = useMyPool(profile?.id)
  if (!profile) return null

  const pool = leads || []
  // Total New count across both niches — the number `request_closer_leads`
  // caps against server-side, so the form's room math must use the same.
  const currentNewCount = pool.filter((l) => l.status === 'new').length

  return (
    <SetterOverview
      profile={profile}
      title="My Leads"
      niche={niche}
      // Prompt 563 — Request Leads is back beside the title (reverses Prompt
      // 555's move to its own row above the tiles). `compactStats` keeps the
      // tight header→tiles gap Prompts 559/562 landed on without `actionsRow`.
      headerRight={<RequestLeadsButton niche={niche} currentCount={currentNewCount} />}
      compactStats
      // Prompt 559/576 — marked-outcome leads (No Answer, Follow-up, Not
      // Interested, Appointment Booked) clear from My Leads at local
      // midnight, staying visible in the meantime alongside their
      // immediate appearance on My Pipeline (kept permanently there).
      clipMarkedToday
    />
  )
}
