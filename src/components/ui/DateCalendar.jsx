import { useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { shiftMonth } from '../../lib/dates'
import { daysInMonth, firstWeekday, formatMonthLabel } from './DateRangeCalendar'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Prompt 602 — single-date sibling to DateRangeCalendar, for My Recordings'
// jump-to-date popover. No pending-start/range/double-click — every click
// picks that date immediately. Same card chrome and date-math helpers as
// DateRangeCalendar so it reads as the same calendar visually, just a
// single-select variant instead of bending that component's range API.
//
// Prompt 603 — same `today` gate as DateRangeCalendar: next-month arrow
// disables once viewing the month containing today, dates after today
// within the viewed month render grayed out and inert, today's cell gets
// a ring marker. Optional/backward-compatible.
export function DateCalendar({ selected, onChange, initialMonth, today }) {
  const [viewMonth, setViewMonth] = useState(initialMonth)

  const count = daysInMonth(viewMonth)
  const leadBlanks = firstWeekday(viewMonth)
  const dates = Array.from({ length: count }, (_, i) => `${viewMonth}-${String(i + 1).padStart(2, '0')}`)
  const atCurrentMonth = today != null && viewMonth >= today.slice(0, 7)

  return (
    <div className="rounded-card border border-line bg-elevated p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setViewMonth((m) => shiftMonth(m, -1))}
          className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary"
          title="Previous month"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="font-sans text-sm font-medium text-fg-primary">{formatMonthLabel(viewMonth)}</span>
        <button
          onClick={() => setViewMonth((m) => shiftMonth(m, 1))}
          disabled={atCurrentMonth}
          className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          title="Next month"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center font-sans text-[11px] text-fg-faint">
        {WEEKDAY_LABELS.map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: leadBlanks }).map((_, i) => <div key={`blank-${i}`} />)}
        {dates.map((dateStr) => {
          const future = today != null && dateStr > today
          const isToday = dateStr === today
          return (
            <button
              key={dateStr}
              onClick={() => { if (!future) onChange(dateStr) }}
              disabled={future}
              className={clsx(
                'aspect-square rounded-md font-sans text-xs transition-colors',
                future && 'cursor-not-allowed text-fg-faint/50 hover:bg-transparent',
                !future && dateStr === selected && 'bg-accent font-semibold text-white',
                !future && dateStr !== selected && 'text-fg-primary hover:bg-surface',
                isToday && dateStr !== selected && 'ring-1 ring-inset ring-accent'
              )}
            >
              {Number(dateStr.slice(-2))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
