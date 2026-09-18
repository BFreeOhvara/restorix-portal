import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useAllLeadsForStats, useReps, statsForUser } from '../hooks/useStats'
import { useSendSetterInviteSms } from '../hooks/useInvites'
import { Field, inputClass } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { DayPaginator } from '../components/ui/DayPaginator'
import { MonthPaginator } from '../components/ui/MonthPaginator'
import { CustomDatePicker, formatRangeLabel } from '../components/ui/CustomDatePicker'
import { PillToggle } from '../components/ui/PillToggle'
import { zonedDateStr, zonedDayRange, monthOf, firstOfMonth, lastOfMonth } from '../lib/dates'
import { DEFAULT_TIMEZONE } from '../lib/timezones'
import { usePageHeader } from '../components/Layout'

// Prompt 606 — same Daily/Monthly/All Time period toggle as Stats.jsx
// (PERIOD_TABS there, unexported), kept as a separate small literal here
// rather than exporting/importing a 5-line const across pages.
const PERIOD_TABS = [
  { key: 'daily', label: 'Daily' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'allTime', label: 'All Time' },
]

// Prompt 533 reopen — moved off Settings onto this page (where a closer
// already looks at their setters), top-right button same visual weight as
// admin's own "Invite" button on Users.jsx. useSendSetterInviteSms and the
// send-invite-sms edge function are unchanged from the original round —
// this is a placement/UI move only.
function InviteSetterModal({ onClose }) {
  const [phone, setPhone] = useState('')
  const [sentTo, setSentTo] = useState('')
  const sendInvite = useSendSetterInviteSms()

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const { phone: normalized } = await sendInvite.mutateAsync({ phone })
      setSentTo(normalized)
      setPhone('')
    } catch {
      // error surfaced below via sendInvite.error
    }
  }

  return (
    <Modal title="Invite a setter" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="font-sans text-sm text-fg-secondary">
          Text a new setter a link to set up their own account. Expires in 7 days, one-time use.
        </p>

        <Field label="Phone number">
          <input
            type="tel"
            className={inputClass()}
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setSentTo('') }}
            placeholder="(555) 123-4567"
            required
          />
        </Field>

        {sendInvite.error && <p className="font-sans text-sm text-danger">{sendInvite.error.message}</p>}
        {sentTo && !sendInvite.isPending && (
          <p className="font-sans text-sm text-success">Invite sent to {sentTo}.</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" disabled={sendInvite.isPending}>
            <Send size={15} />
            {sendInvite.isPending ? 'Sending…' : 'Send invite'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function SetterActivity() {
  const { profile } = useAuth()
  const { data: leads, isLoading } = useAllLeadsForStats()
  const { data: reps } = useReps()
  const [showInvite, setShowInvite] = useState(false)

  // Prompt 606 — From/To replaced with Stats.jsx's own Daily/Monthly/All
  // Time period toggle. `tz` is the viewing closer's own timezone, used
  // only to decide what "today"/"this month" means for the paginators'
  // forward-navigation limit — same role it plays on Stats.jsx. Each
  // setter's own row is still zoned to THAT setter's own saved timezone
  // below, not this one.
  const tz = profile?.timezone || DEFAULT_TIMEZONE
  const today = zonedDateStr(Date.now(), tz)
  const [periodTab, setPeriodTab] = useState('daily')
  const [dayDate, setDayDate] = useState(() => zonedDateStr(Date.now(), tz))
  const [monthStr, setMonthStr] = useState(() => monthOf(zonedDateStr(Date.now(), tz)))
  const [customRange, setCustomRange] = useState(null)

  const periodTabs = useMemo(
    () => PERIOD_TABS.map((t) => (t.key === 'allTime' && customRange ? { ...t, label: formatRangeLabel(customRange) } : t)),
    [customRange]
  )

  // Plain YYYY-MM-DD start/end for whichever period is active, same shape
  // Stats.jsx's rawRange produces — Daily/Monthly always resolve to a real
  // pair, All Time with nothing picked falls through to empty strings,
  // which statsForUser/inRange already treat as "no filter = all time".
  const rawRange = useMemo(() => {
    if (periodTab === 'monthly') return { rawStart: firstOfMonth(monthStr), rawEnd: lastOfMonth(monthStr) }
    if (periodTab === 'allTime') return { rawStart: customRange?.start || '', rawEnd: customRange?.end || '' }
    return { rawStart: dayDate, rawEnd: dayDate }
  }, [periodTab, dayDate, monthStr, customRange])

  // Prompt 606 — mirrors Stats.jsx's rollup.setters exactly: each row is
  // zoned to THAT setter's own saved timezone, not the viewing closer's,
  // so the same nominal period means the same calendar day(s) in each
  // setter's own zone.
  const setters = useMemo(() => {
    if (!leads || !reps) return []
    const { rawStart, rawEnd } = rawRange
    return reps
      .filter((r) => r.role === 'setter')
      .map((s) => {
        const repTz = s.timezone || DEFAULT_TIMEZONE
        const start = rawStart ? zonedDayRange(rawStart, repTz).start : ''
        const end = rawEnd ? zonedDayRange(rawEnd, repTz).end : ''
        return { ...s, ...statsForUser(leads, s.id, start, end) }
      })
  }, [leads, reps, rawRange])

  usePageHeader({ title: 'Setter Activity', subtitle: 'See who\'s feeding your pipeline' })

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PillToggle options={periodTabs} active={periodTab} onChange={setPeriodTab} />
          {periodTab === 'daily' && <DayPaginator date={dayDate} onChange={setDayDate} timezone={tz} />}
          {periodTab === 'monthly' && <MonthPaginator month={monthStr} onChange={setMonthStr} timezone={tz} />}
          {periodTab === 'allTime' && (
            <CustomDatePicker
              range={customRange}
              onChange={setCustomRange}
              initialMonth={monthOf(customRange?.start || dayDate)}
              today={today}
            />
          )}
        </div>
        <Button onClick={() => setShowInvite(true)}>
          <Send size={15} /> Invite Setter
        </Button>
      </div>

      {/* Prompt 606 — box quantized to the app's established header (43px)
          + whole-row pattern (Overview/My Recordings), 8 rows at this
          table's own 63px row height (same px-5 py-4 cell padding those
          tables use at their un-shrunk row height) — the same 547px box
          already live-verified to fit with zero page scroll at 1366×768
          on a page with one control row above it (My Recordings, Prompt
          602/603). Could not live-verify THIS page's own real numbers
          this session — no `.env.local` in this checkout, same blocker as
          Prompt 605 — so this is the best-grounded number available
          rather than a fresh guess; flag to Brayden to confirm at his
          real window size and grow it further if there's more room now
          that the two old rows are merged into one. */}
      <div className="mt-6 h-[547px] overflow-hidden rounded-card border border-line bg-elevated">
        <div className="h-full overflow-y-auto">
          <table className={clsx('w-full text-left', setters.length > 0 && 'border-b border-line')}>
            <thead className="eyebrow sticky top-0 z-10 bg-surface">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Calls Logged</th>
                <th className="px-5 py-3">Calls Booked</th>
                <th className="px-5 py-3">Booking Rate</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="h-[504px] px-8 text-center align-middle font-sans text-sm text-fg-secondary">
                    Loading…
                  </td>
                </tr>
              ) : setters.length === 0 ? (
                <tr>
                  <td colSpan={4} className="h-[504px] px-8 text-center align-middle font-sans text-sm text-fg-secondary">
                    No setters yet.
                  </td>
                </tr>
              ) : (
                setters.map((s) => (
                  <tr key={s.id} className="h-[63px] border-t border-line font-sans text-sm">
                    <td className="px-5 py-4 font-medium text-fg-primary">{s.full_name}</td>
                    <td className="px-5 py-4 text-fg-secondary">{s.logged}</td>
                    <td className="px-5 py-4 text-fg-secondary">{s.booked}</td>
                    <td className="px-5 py-4 text-fg-secondary">{s.bookingPct}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showInvite && <InviteSetterModal onClose={() => setShowInvite(false)} />}
    </div>
  )
}
