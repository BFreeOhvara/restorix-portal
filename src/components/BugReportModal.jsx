import { useState } from 'react'
import Modal from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { useAuth } from '../hooks/useAuth'
import { useCreateBugReport } from '../hooks/useBugReports'

// Prompt 528 — sidebar bug-report button's modal. Submits to a real
// `bug_reports` table (RLS: reporter can insert/read own, admin can
// read/update all) with a simple admin-side list at /bug-reports, not a
// throwaway form with nowhere for the submission to go.
export default function BugReportModal({ onClose }) {
  const { profile } = useAuth()
  const [description, setDescription] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const createBugReport = useCreateBugReport()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim()) return
    try {
      await createBugReport.mutateAsync({ reporterId: profile.id, description: description.trim() })
      setSubmitted(true)
    } catch {
      // error surfaced below via createBugReport.isError
    }
  }

  if (submitted) {
    return (
      <Modal title="Report a Bug" onClose={onClose}>
        <p className="font-sans text-sm text-fg-secondary">Thanks — this has been sent to the admin team.</p>
        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={onClose}>Done</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Report a Bug" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="What happened?">
          <textarea
            className={inputClass('min-h-[120px] resize-none')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you were doing and what went wrong…"
            required
            autoFocus
          />
        </Field>
        {createBugReport.isError && (
          <p className="font-sans text-xs text-danger">
            Couldn't submit: {createBugReport.error?.message || 'something went wrong. Try again.'}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createBugReport.isPending || !description.trim()}>
            {createBugReport.isPending ? 'Sending…' : 'Submit'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
