import { ChevronLeft, ChevronRight } from 'lucide-react'
import { zonedDateStr, monthOf, shiftMonth } from '../../lib/dates'
import { DEFAULT_TIMEZONE } from '../../lib/timezones'

function formatMonthLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

// Prompt 536 — same visual chrome as DayPaginator/WeekPaginator (rounded-
// full pill, two icon buttons), just month-stepping instead of day/week.
// "Next" disabled once the selected month is the current month, same
// "no future data" reasoning those two already use.
export function MonthPaginator({ month, onChange, timezone }) {
  const tz = timezone || DEFAULT_TIMEZONE
  const isCurrentMonth = month === monthOf(zonedDateStr(Date.now(), tz))
  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-elevated p-1">
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary"
        title="Previous month"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="min-w-[130px] text-center font-sans text-xs font-medium text-fg-primary">
        {formatMonthLabel(month)}{isCurrentMonth ? ' · This Month' : ''}
      </span>
      <button
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={isCurrentMonth}
        className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary disabled:opacity-30 disabled:hover:bg-transparent"
        title="Next month"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  )
}
