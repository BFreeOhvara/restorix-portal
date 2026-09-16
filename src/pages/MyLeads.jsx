import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
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
  // Prompt 588 — the wheel is a popover, not a permanent fixture: it only
  // renders while the field group has focus/interaction.
  const [wheelOpen, setWheelOpen] = useState(false)
  const containerRef = useRef(null)
  const wheelRef = useRef(null)
  const scrollEndTimeout = useRef(null)
  // Prompt 588 — set only by a real user gesture on the wheel (mouse wheel,
  // touch, or a pointer down, e.g. dragging the scrollbar), never by our own
  // programmatic scrollTop writes below. `handleWheelScroll` only commits a
  // value back into `raw` while this is true, so syncing the wheel to a
  // freshly-typed value can't be misread as the user scrolling and echoed
  // back into the field once the (purely programmatic) scroll settles.
  const userScrollingRef = useRef(false)

  const room = Math.max(0, POOL_CAP - currentCount)
  const value = raw === '' ? 0 : Math.max(0, Math.min(room, Number(raw) || 0))
  // Mirrors `value` for the outside-click listener below, which is only
  // (re)attached when `wheelOpen` changes — without this it would close
  // over whatever `value` was at the moment the popover opened, clamping
  // to a stale number instead of whatever was last typed/scrolled to.
  const valueRef = useRef(value)
  valueRef.current = value

  // Keep the wheel positioned at the current value — both when it changes
  // via typing and the moment the popover opens.
  useEffect(() => {
    if (wheelRef.current) wheelRef.current.scrollTop = value * ROW_HEIGHT
  }, [value, wheelOpen])

  function markUserScrolling() {
    userScrollingRef.current = true
  }

  // Prompt 588 — a click that never focuses anything (e.g. the modal
  // backdrop) can't be caught by blur alone, so close on any outside click
  // too while the popover is open.
  useEffect(() => {
    if (!wheelOpen) return
    function handleDocMouseDown(e) {
      if (!containerRef.current?.contains(e.target)) {
        setWheelOpen(false)
        setRaw(String(valueRef.current))
      }
    }
    document.addEventListener('mousedown', handleDocMouseDown)
    return () => document.removeEventListener('mousedown', handleDocMouseDown)
  }, [wheelOpen])

  function handleWheelScroll() {
    if (!userScrollingRef.current) return
    clearTimeout(scrollEndTimeout.current)
    scrollEndTimeout.current = setTimeout(() => {
      const el = wheelRef.current
      if (el) {
        const picked = Math.max(0, Math.min(room, Math.round(el.scrollTop / ROW_HEIGHT)))
        setRaw(String(picked))
      }
      userScrollingRef.current = false
    }, 120)
  }

  function handleBlur() {
    setRaw(String(value))
  }

  // Prompt 588 — closes (and clamps) only when focus leaves the whole
  // field+wheel group, not when it moves from the input to the wheel.
  function handleGroupBlur(e) {
    if (containerRef.current?.contains(e.relatedTarget)) return
    setWheelOpen(false)
    handleBlur()
  }

  function handleGroupKeyDown(e) {
    if (e.key === 'Escape') {
      setWheelOpen(false)
      handleBlur()
      e.currentTarget.querySelector('input')?.blur()
    }
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
      <div ref={containerRef} className="relative" onBlur={handleGroupBlur} onKeyDown={handleGroupKeyDown}>
        <Field label="How many">
          <input
            type="number"
            min={0}
            max={room}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onFocus={() => setWheelOpen(true)}
            className={inputClass()}
          />
        </Field>
        {wheelOpen && (
          <div
            ref={wheelRef}
            onScroll={handleWheelScroll}
            onWheel={markUserScrolling}
            onTouchStart={markUserScrolling}
            onPointerDown={markUserScrolling}
            className="absolute left-0 top-full z-10 mt-1 w-24 overflow-y-auto rounded-lg border border-line bg-elevated shadow-lg"
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
        )}
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

// Prompt 598 — the header-row button (566-563 era) is gone; My Leads'
// Request Leads trigger is now a fixed-position circular bubble in the
// bottom-right corner (styled after the restorix.co chat-bubble widget),
// with a small dismissible tooltip callout on first load. Same modal/form
// underneath, unchanged — only the trigger's look/position changed.
function RequestLeadsBubble({ niche, currentCount }) {
  const [open, setOpen] = useState(false)
  const [tooltipOpen, setTooltipOpen] = useState(true)

  return (
    <>
      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2">
        {tooltipOpen && !open && (
          <div className="flex max-w-[220px] items-start gap-2 rounded-xl border border-line bg-elevated px-3 py-2 shadow-lg">
            <p className="font-sans text-xs text-fg-secondary">This is where you request leads.</p>
            <button
              type="button"
              onClick={() => setTooltipOpen(false)}
              className="shrink-0 rounded-full p-0.5 text-fg-secondary hover:text-fg-primary"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setTooltipOpen(false)
          }}
          aria-label="Request Leads"
          className={clsx(
            'flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105',
            STATUS_SOLID.new
          )}
        >
          <Plus size={26} />
        </button>
      </div>
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
    <>
      {/* Prompt 598 — page-scoped negative top margin, same technique 597
          used on My Pipeline: cancels part of Layout's shared <main> py-8
          for this route only (that padding itself is untouched — every
          other page, including /overview, still gets its full 32px).
          Removing the header row alone didn't fully close My Leads' page
          scroll, so this recovers the rest of the reclaimed space. */}
      <div className="-mt-4">
        <SetterOverview
          profile={profile}
          title="My Leads"
          niche={niche}
          // Prompt 598 — the header-right button row is gone; Request Leads
          // moved to a floating bubble (below), reclaiming that row's
          // vertical space. `compactStats` keeps the tight header→tiles gap
          // Prompts 559/562 landed on now that there's no header-right row
          // at all.
          showHeaderRow={false}
          compactStats
          // Prompt 559/576 — marked-outcome leads (No Answer, Follow-up, Not
          // Interested, Appointment Booked) clear from My Leads at local
          // midnight, staying visible in the meantime alongside their
          // immediate appearance on My Pipeline (kept permanently there).
          clipMarkedToday
        />
      </div>
      <RequestLeadsBubble niche={niche} currentCount={currentNewCount} />
    </>
  )
}
