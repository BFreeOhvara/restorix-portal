import { useMemo, useState } from 'react'
import { Send, X } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { useAllLeadsForStats, useReps, statsForUser, statsForCloser } from '../hooks/useStats'
import { useSendRepInviteSms } from '../hooks/useInvites'
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

// Prompt 628 — which leaderboard the table shows. Doubles as the invite
// modal's own role tabs (same two roles, same labels), so one literal
// serves both rather than two that could drift apart.
const ROLE_TABS = [
  { key: 'setter', label: 'Setter' },
  { key: 'closer', label: 'Closer' },
]

// Prompt 628 — column headers per view. The Setter set is verbatim what
// this table has shown since Prompt 606; the Closer set mirrors its shape
// (Name + 3 metrics) off statsForCloser's existing output.
const COLUMNS = {
  setter: ['Name', 'Calls Logged', 'Calls Booked', 'Booking Rate'],
  closer: ['Name', 'Booked', 'Closed', 'Close Rate'],
}

// Prompt 533 reopen — moved off Settings onto this page (where a closer
// already looks at their setters). Prompt 628 — the trigger is now a
// floating bubble (see InviteRepBubble) rather than a toolbar button, and
// the modal gained Setter/Closer tabs: closers can now invite closers too,
// which required widening the invites_insert_closer RLS policy and
// send-invite-sms's allowed-role check, not just this UI.
function InviteRepModal({ onClose }) {
  const [role, setRole] = useState('setter')
  const [phone, setPhone] = useState('')
  const [sentTo, setSentTo] = useState('')
  const sendInvite = useSendRepInviteSms()

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const { phone: normalized } = await sendInvite.mutateAsync({ phone, role })
      setSentTo(normalized)
      setPhone('')
    } catch {
      // error surfaced below via sendInvite.error
    }
  }

  // Switching tabs clears any in-flight result/error so a "sent" message
  // from the Setter tab can't linger as if it applied to the Closer one.
  function handleRoleChange(next) {
    if (next === role) return
    setRole(next)
    setSentTo('')
    sendInvite.reset()
  }

  return (
    <Modal title="Invite a rep" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PillToggle options={ROLE_TABS} active={role} onChange={handleRoleChange} stretch />

        <p className="font-sans text-sm text-fg-secondary">
          Text a new {role} a link to set up their own account. Expires in 7 days, one-time use.
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

// Prompt 628 — same floating-bubble pattern as MyLeads.jsx's
// RequestLeadsBubble (fixed bottom-right, h-14 w-14 round button,
// dismissible first-load callout with the same arrow tail). Deliberately a
// second small copy rather than an extraction: the two differ in icon,
// color and modal, and MyLeads is a setter page this prompt isn't scoped
// to touch. Colors here are this page's own primary Button styling
// (bg-accent + its hover ramp), not RequestLeadsBubble's status-new.
function InviteRepBubble() {
  const [open, setOpen] = useState(false)
  const [tooltipOpen, setTooltipOpen] = useState(true)

  return (
    <>
      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3">
        {tooltipOpen && !open && (
          <div className="relative flex max-w-[260px] items-start gap-3 rounded-xl border border-line bg-elevated px-4 py-3 shadow-lg">
            <p className="font-sans text-sm text-fg-secondary">Invite a setter or closer to your team</p>
            <button
              type="button"
              onClick={() => setTooltipOpen(false)}
              className="shrink-0 rounded-full p-0.5 text-fg-secondary hover:text-fg-primary"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
            <div
              className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-line bg-elevated"
              aria-hidden="true"
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setTooltipOpen(false)
          }}
          aria-label="Invite a rep"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform hover:scale-105 hover:bg-accent-deep dark:hover:bg-accent-bright"
        >
          <Send size={24} />
        </button>
      </div>
      {open && <InviteRepModal onClose={() => setOpen(false)} />}
    </>
  )
}

export default function SetterActivity() {
  const { profile } = useAuth()
  const { data: leads, isLoading } = useAllLeadsForStats()
  const { data: reps } = useReps()

  // Prompt 628 — which leaderboard is showing. Setter is the default, i.e.
  // unchanged from what this page has always opened on.
  const [roleTab, setRoleTab] = useState('setter')

  // Prompt 606 — From/To replaced with Stats.jsx's own Daily/Monthly/All
  // Time period toggle. `tz` is the viewing closer's own timezone, used
  // only to decide what "today"/"this month" means for the paginators'
  // forward-navigation limit — same role it plays on Stats.jsx. Each
  // rep's own row is still zoned to THAT rep's own saved timezone
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
  // zoned to THAT rep's own saved timezone, not the viewing closer's, so
  // the same nominal period means the same calendar day(s) in each rep's
  // own zone.
  // Prompt 628 — that same per-rep zoning now drives both leaderboards;
  // only the role filter and the stats function differ. statsForCloser is
  // the exact function Overview/Commissions already use, reused as-is.
  const rows = useMemo(() => {
    if (!leads || !reps) return []
    const { rawStart, rawEnd } = rawRange
    const statsFor = roleTab === 'closer' ? statsForCloser : statsForUser
    return reps
      .filter((r) => r.role === roleTab)
      .map((r) => {
        const repTz = r.timezone || DEFAULT_TIMEZONE
        const start = rawStart ? zonedDayRange(rawStart, repTz).start : ''
        const end = rawEnd ? zonedDayRange(rawEnd, repTz).end : ''
        return { ...r, ...statsFor(leads, r.id, start, end) }
      })
  }, [leads, reps, rawRange, roleTab])

  usePageHeader({ title: 'Setter Activity', subtitle: 'See who\'s feeding your pipeline' })

  return (
    <div>
      {/* Prompt 628 — two toolbar rows: the new Setter/Closer leaderboard
          toggle takes the top-left slot the period toggle used to hold,
          with the date navigator opposite it on the right (where the
          "Invite Setter" button used to sit — that trigger is now the
          floating bubble below). The period toggle drops to its own row
          underneath, same left alignment. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <PillToggle options={ROLE_TABS} active={roleTab} onChange={setRoleTab} />
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

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <PillToggle options={periodTabs} active={periodTab} onChange={setPeriodTab} />
      </div>

      {/* Prompt 606 — box quantized to the app's established header (43px)
          + whole-row pattern (Overview/My Recordings) at this table's own
          63px row height. Prompt 628 — grown from 547px to 673px (43px
          header + 10 whole rows) because Brayden reported visible empty
          space below it; the loading/empty cell height tracks it at
          630px. Same caveat as 606: this is a quantized best fit, NOT
          live-verified against a real screen — it still needs a human
          eyeball, especially now that the toolbar above it is two rows
          tall instead of one. */}
      <div className="mt-6 h-[673px] overflow-hidden rounded-card border border-line bg-elevated">
        <div className="h-full overflow-y-auto">
          <table className={clsx('w-full text-left', rows.length > 0 && 'border-b border-line')}>
            <thead className="eyebrow sticky top-0 z-10 bg-surface">
              <tr>
                {COLUMNS[roleTab].map((label) => (
                  <th key={label} className="px-5 py-3">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="h-[630px] px-8 text-center align-middle font-sans text-sm text-fg-secondary">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="h-[630px] px-8 text-center align-middle font-sans text-sm text-fg-secondary">
                    No {roleTab}s yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="h-[63px] border-t border-line font-sans text-sm">
                    <td className="px-5 py-4 font-medium text-fg-primary">{r.full_name}</td>
                    {roleTab === 'closer' ? (
                      <>
                        <td className="px-5 py-4 text-fg-secondary">{r.assigned}</td>
                        <td className="px-5 py-4 text-fg-secondary">{r.closed}</td>
                        {/* closeRate already arrives formatted ("62%" / "—")
                            from pct() in useStats.js — rendered as-is. */}
                        <td className="px-5 py-4 text-fg-secondary">{r.closeRate}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-5 py-4 text-fg-secondary">{r.logged}</td>
                        <td className="px-5 py-4 text-fg-secondary">{r.booked}</td>
                        <td className="px-5 py-4 text-fg-secondary">{r.bookingPct}%</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <InviteRepBubble />
    </div>
  )
}
