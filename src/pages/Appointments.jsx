import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useMyDeal } from '../hooks/useDeals'
import { DayPaginator } from '../components/ui/DayPaginator'
import { STATUS_TINT } from '../components/ui/StatusBadge'
import { zonedDateStr, shiftDay } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'
import { isTestClient, PREVIEW_APPOINTMENTS, initials } from '../lib/clientPreview'

// Prompt 578 — the client Appointments page: the facility's own
// patient/consult appointments (NOT the closer-side send-appointment-
// reminders flow, which reminds a *sales lead* about a demo with a
// Restorix closer — a different table entirely). This has no real data
// model yet at all (downstream of intake_triage / missed_call_recovery +
// the `reminders` sub-agent, all placeholder). So the date navigator is
// real and always renders; the list under it is test-account-only sample
// content, and every real client sees an honest empty state per date.

function Avatar({ name }) {
  return (
    <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-muted">
      <span className="font-display text-xs font-semibold text-fg-primary">{initials(name)}</span>
    </div>
  )
}

export default function Appointments() {
  const { session, profile } = useAuth()
  const { data: deal, isLoading } = useMyDeal()
  const tz = profile?.timezone || DEFAULT_TIMEZONE
  const today = zonedDateStr(Date.now(), tz)
  const [date, setDate] = useState(today)

  const preview = isTestClient(session) && !!deal
  const daysAgo = useMemo(() => {
    // whole-day difference between `today` and the selected `date`
    let d = today
    let n = 0
    while (d !== date && n < 60) {
      d = shiftDay(d, -1)
      n += 1
    }
    return d === date ? n : null
  }, [today, date])

  const rows = preview && daysAgo === 0 ? PREVIEW_APPOINTMENTS : []

  if (isLoading) {
    return <p className="font-sans text-sm text-fg-secondary">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">Appointments</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">Who's booked, and whether they've confirmed.</p>
        </div>
        <DayPaginator date={date} onChange={setDate} timezone={tz} />
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-elevated">
        {rows.length === 0 ? (
          <p className="p-10 text-center font-sans text-sm text-fg-secondary">No appointments for this day.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {rows.map((a) => (
              <div key={a.id} className="flex items-center gap-3.5 border-b border-line px-[18px] py-[13px] last:border-0">
                <Avatar name={a.name} />
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-[13.5px] font-semibold text-fg-primary">{a.name}</p>
                  <p className="mt-px font-sans text-xs text-fg-faint">{a.detail}</p>
                </div>
                <span className={clsx('eyebrow inline-flex shrink-0 rounded-full px-2.5 py-1', STATUS_TINT[a.status])}>
                  {a.pill}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
