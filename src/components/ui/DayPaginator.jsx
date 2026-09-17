import { ChevronLeft, ChevronRight } from 'lucide-react'
import { zonedDateStr, shiftDay } from '../../lib/dates'
import { DEFAULT_TIMEZONE } from '../../lib/timezones'

function formatDayLabel(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

// Prompt 451 — shared date-by-date paginator for Activity + My Calls.
// "Next" disabled at today — not explicitly specified, but a future-dated
// empty view isn't useful and every other date-scoped view in this app
// (Overview, My Goals) already treats "today" as the forward edge.
// Prompt 458: `timezone` decides what "today" means — the caller's own
// saved timezone, not UTC.
// Prompt 602 — optional `onLabelClick` (e.g. My Recordings' jump-to-date
// calendar) turns the label into a button instead of a plain span. Strictly
// opt-in: every other caller (Stats' Daily tab, Activity) omits it and gets
// pixel-identical behavior to before.
export function DayPaginator({ date, onChange, timezone, onLabelClick }) {
  const tz = timezone || DEFAULT_TIMEZONE
  const isToday = date === zonedDateStr(Date.now(), tz)
  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-elevated p-1">
      <button
        onClick={() => onChange(shiftDay(date, -1))}
        className="flex h-7 w-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface hover:text-fg-primary"
        title="Previous day"
      >
        <ChevronLeft size={15} />
      </button>
      {onLabelClick ? (
        <button
          onClick={onLabelClick}
          className="min-w-[110px] text-center font-sans text-xs font-medium text-fg-primary transition-colors hover:text-accent"
          title="Jump to date"
        >
          {formatDayLabel(date)}{isToday ? ' · Today' : ''}
        </button>
      ) : (
        <span className="min-w-[110px] text-center font-sans text-xs font-medium text-fg-primary">
          {formatDayLabel(date)}{isToday ? ' · Today' : ''}
        </span>
      )}
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
