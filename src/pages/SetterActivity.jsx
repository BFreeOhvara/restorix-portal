import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { useAllLeadsForStats, useReps, statsForUser } from '../hooks/useStats'
import { useSendSetterInviteSms } from '../hooks/useInvites'
import { Field, inputClass } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import Modal from '../components/ui/Modal'

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
  const { data: leads, isLoading } = useAllLeadsForStats()
  const { data: reps } = useReps()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [showInvite, setShowInvite] = useState(false)

  const setters = useMemo(() => {
    if (!leads || !reps) return []
    return reps
      .filter((r) => r.role === 'setter')
      .map((s) => ({ ...s, ...statsForUser(leads, s.id, start, end) }))
  }, [leads, reps, start, end])

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-fg-primary">Setter Activity</h1>
          <p className="mt-1 font-sans text-sm text-fg-secondary">See who's feeding your pipeline</p>
        </div>
        <Button variant="secondary" onClick={() => setShowInvite(true)}>
          <Send size={15} /> Invite Setter
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <Field label="From">
          <input type="date" className={inputClass()} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={inputClass()} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        {(start || end) && (
          <button
            onClick={() => { setStart(''); setEnd('') }}
            className="pb-2 font-sans text-sm text-fg-secondary underline-offset-2 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : (
          <table className="w-full text-left">
            <thead className="eyebrow bg-surface">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Calls Logged</th>
                <th className="px-5 py-3">Calls Booked</th>
                <th className="px-5 py-3">Booking Rate</th>
              </tr>
            </thead>
            <tbody>
              {setters.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center font-sans text-sm text-fg-secondary">
                    No setters yet.
                  </td>
                </tr>
              ) : (
                setters.map((s) => (
                  <tr key={s.id} className="border-t border-line font-sans text-sm">
                    <td className="px-5 py-4 font-medium text-fg-primary">{s.full_name}</td>
                    <td className="px-5 py-4 text-fg-secondary">{s.logged}</td>
                    <td className="px-5 py-4 text-fg-secondary">{s.booked}</td>
                    <td className="px-5 py-4 text-fg-secondary">{s.bookingPct}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {showInvite && <InviteSetterModal onClose={() => setShowInvite(false)} />}
    </div>
  )
}
