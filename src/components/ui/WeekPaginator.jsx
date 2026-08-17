import { ChevronLeft, ChevronRight } from 'lucide-react'
import { todayUTCStr, mondayOf, shiftDay, shiftWeek } from '../../lib/dates'

function formatShort(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

// Prompt 450 — same visual chrome as DayPaginator (rounded-full pill,
// two icon buttons) so the app reads as one consistent date-nav pattern,
// just week-stepping instead of day-stepping. `monday` is always a
// Monday string (the week's anchor); "Next" disabled once the selected
// week already contains today, same "no future data" reasoning as
// DayPaginator's today-edge disable.
export function WeekPaginator({ monday, onChange }) {
  const isCurrentWeek = monday === mondayOf(todayUTCStr())
  const friday = shiftDay(monday, 4)
  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-elevated p-1">
      <button
        onClick={() => onChange(shiftWeek(monday, -1))}
        className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary"
        title="Previous week"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="min-w-[132px] text-center font-sans text-xs font-medium text-fg-primary">
        {formatShort(monday)} – {formatShort(friday)}{isCurrentWeek ? ' · This Week' : ''}
      </span>
      <button
        onClick={() => onChange(shiftWeek(monday, 1))}
        disabled={isCurrentWeek}
        className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary disabled:opacity-30 disabled:hover:bg-transparent"
        title="Next week"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  )
}
