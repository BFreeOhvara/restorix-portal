import { ChevronLeft, ChevronRight } from 'lucide-react'
import { todayUTCStr, shiftDay } from '../../lib/dates'

function formatDayLabel(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

// Prompt 451 — shared date-by-date paginator for Activity + My Calls.
// "Next" disabled at today — not explicitly specified, but a future-dated
// empty view isn't useful and every other date-scoped view in this app
// (Overview, My Goals) already treats "today" as the forward edge.
export function DayPaginator({ date, onChange }) {
  const isToday = date === todayUTCStr()
  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-elevated p-1">
      <button
        onClick={() => onChange(shiftDay(date, -1))}
        className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary"
        title="Previous day"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="min-w-[110px] text-center font-sans text-xs font-medium text-fg-primary">
        {formatDayLabel(date)}{isToday ? ' · Today' : ''}
      </span>
      <button
        onClick={() => onChange(shiftDay(date, 1))}
        disabled={isToday}
        className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary disabled:opacity-30 disabled:hover:bg-transparent"
        title="Next day"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  )
}
