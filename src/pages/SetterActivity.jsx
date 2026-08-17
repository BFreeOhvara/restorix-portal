import { useMemo, useState } from 'react'
import { useAllLeadsForStats, useReps, statsForUser } from '../hooks/useStats'
import { Field, inputClass } from '../components/ui/Field'

export default function SetterActivity() {
  const { data: leads, isLoading } = useAllLeadsForStats()
  const { data: reps } = useReps()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const setters = useMemo(() => {
    if (!leads || !reps) return []
    return reps
      .filter((r) => r.role === 'setter')
      .map((s) => ({ ...s, ...statsForUser(leads, s.id, start, end) }))
  }, [leads, reps, start, end])

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Setter Activity</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">See who's feeding your pipeline</p>

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
    </div>
  )
}
