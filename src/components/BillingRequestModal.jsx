import { useState } from 'react'
import Modal from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { useAuth } from '../hooks/useAuth'
import { useSubmitBillingRequest } from '../hooks/useBillingRequests'

// Prompt 611 — no payment processor exists in this app (no Stripe, no card
// fields anywhere). This is deliberately a "notify the team" request only,
// same shape as BugReportModal.jsx: submit to billing_requests, team
// follows up manually (e.g. a phone call to get updated card info).
export default function BillingRequestModal({ onClose }) {
  const { profile } = useAuth()
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const submitRequest = useSubmitBillingRequest()

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      await submitRequest.mutateAsync({ clientProfileId: profile.id, note: note.trim() })
      setSubmitted(true)
    } catch {
      // error surfaced below via submitRequest.isError
    }
  }

  if (submitted) {
    return (
      <Modal title="Request payment method change" onClose={onClose}>
        <p className="font-sans text-sm text-fg-secondary">Request sent — we'll be in touch.</p>
        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={onClose}>Done</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Request payment method change" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="font-sans text-sm text-fg-secondary">
          We'll reach out to update your payment method — no card details are collected here.
        </p>
        <Field label="Note (optional)">
          <textarea
            className={inputClass('min-h-[100px] resize-none')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything we should know before we call?"
          />
        </Field>
        {submitRequest.isError && (
          <p className="font-sans text-xs text-danger">
            Couldn't submit: {submitRequest.error?.message || 'something went wrong. Try again.'}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitRequest.isPending}>
            {submitRequest.isPending ? 'Sending…' : 'Submit'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
