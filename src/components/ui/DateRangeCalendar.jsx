import { useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { shiftMonth } from '../../lib/dates'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function daysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function firstWeekday(monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
}

function formatMonthLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

// Prompt 536 — custom date-range picker for Stats' All Time tab, replacing
// the old two native FROM/TO inputs. Click any date first, click a second
// to complete the range (order-independent — sorted into start/end
// regardless of click order); double-click one date to select just that
// single day as both ends.
//
// Uses the native click event's `e.detail` (2 on the second click of a
// real double-click, per the DOM spec) rather than a setTimeout-based
// click/dblclick debounce — every single click stays instantly responsive
// instead of waiting out an artificial delay to rule out a second click.
// `range`/`onChange` are controlled by the parent; `viewMonth` (which
// month is currently displayed) is local — browsing months while picking
// shouldn't require re-selecting anything.
export function DateRangeCalendar({ range, onChange, initialMonth }) {
  const [viewMonth, setViewMonth] = useState(initialMonth)
  const [pendingStart, setPendingStart] = useState(null)

  const count = daysInMonth(viewMonth)
  const leadBlanks = firstWeekday(viewMonth)
  const dates = Array.from({ length: count }, (_, i) => `${viewMonth}-${String(i + 1).padStart(2, '0')}`)

  function handleClick(dateStr, e) {
    if (e.detail >= 2) {
      setPendingStart(null)
      onChange({ start: dateStr, end: dateStr })
      return
    }
    if (!pendingStart) {
      setPendingStart(dateStr)
      return
    }
    const start = pendingStart < dateStr ? pendingStart : dateStr
    const end = pendingStart < dateStr ? dateStr : pendingStart
    setPendingStart(null)
    onChange({ start, end })
  }

  function cellState(dateStr) {
    if (pendingStart === dateStr) return 'selected'
    if (!range) return 'none'
    if (dateStr === range.start && dateStr === range.end) return 'selected'
    if (dateStr === range.start || dateStr === range.end) return 'selected'
    if (dateStr > range.start && dateStr < range.end) return 'inRange'
    return 'none'
  }

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
          className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary"
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
          const state = cellState(dateStr)
          return (
            <button
              key={dateStr}
              onClick={(e) => handleClick(dateStr, e)}
              className={clsx(
                'aspect-square rounded-md font-sans text-xs transition-colors',
                state === 'none' && 'text-fg-primary hover:bg-surface',
                state === 'inRange' && 'bg-accent/15 text-fg-primary',
                state === 'selected' && 'bg-accent font-semibold text-white'
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
