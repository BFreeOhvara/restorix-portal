import { useState } from 'react'
import Modal from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { useAddLead } from '../hooks/useLeads'

export default function AddLeadModal({ onClose }) {
  const [form, setForm] = useState({ facility_name: '', contact_name: '', phone: '', notes: '' })
  const addLead = useAddLead()

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await addLead.mutateAsync(form)
    onClose()
  }

  return (
    <Modal title="Add lead" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Facility name">
          <input className={inputClass()} value={form.facility_name} onChange={set('facility_name')} required />
        </Field>
        <Field label="Contact name">
          <input className={inputClass()} value={form.contact_name} onChange={set('contact_name')} />
        </Field>
        <Field label="Phone">
          <input className={inputClass()} value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Notes">
          <textarea className={inputClass()} rows={3} value={form.notes} onChange={set('notes')} />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={addLead.isPending}>
            {addLead.isPending ? 'Adding…' : 'Add lead'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
