import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { DateRangeCalendar } from './DateRangeCalendar'

// Prompt 606 — extracted out of Stats.jsx (where it originated across
// Prompt 536's several reopen rounds — see that file's history for the
// full design rationale) so TeamActivity's own All Time tab can reuse
// the exact same control instead of a second copy. Behavior/appearance
// unchanged from Stats.jsx's version.
export function formatRangeLabel(range) {
  const short = (d) => new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
  return range.start === range.end ? short(range.start) : `${short(range.start)} – ${short(range.end)}`
}

export function CustomDatePicker({ range, onChange, initialMonth, today }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const label = range ? formatRangeLabel(range) : 'Custom Date'

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className={`flex h-[38px] items-center justify-center rounded-full border border-line bg-elevated px-4 transition-colors hover:bg-surface ${range ? 'pr-7' : ''}`}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="min-w-[120px] text-center font-sans text-xs font-medium text-fg-primary"
        >
          {label}
        </button>
      </div>
      {range && (
        <button
          onClick={() => onChange(null)}
          aria-label="Clear custom date range"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 shrink-0 rounded-full p-1 text-fg-faint transition-colors hover:bg-elevated hover:text-fg-primary"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 shadow-lg">
          <p className="mb-2 rounded-card border border-line bg-elevated px-3 py-2 font-sans text-[11px] text-fg-secondary">
            Select a start or end date, or double-click a date for a single day.
          </p>
          <DateRangeCalendar
            range={range}
            onChange={(r) => { onChange(r); setOpen(false) }}
            initialMonth={initialMonth}
            today={today}
          />
        </div>
      )}
    </div>
  )
}
