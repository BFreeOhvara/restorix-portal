import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { Field, inputClass } from '../components/ui/Field'

function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at')
      if (error) throw error
      return data
    },
  })
}

function CreateUserModal({ onClose }) {
  const [form, setForm] = useState({ username: '', full_name: '', password: '', role: 'setter' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create user')
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Create account" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name">
          <input className={inputClass()} value={form.full_name} onChange={set('full_name')} required />
        </Field>
        <Field label="Username">
          <input
            className={inputClass()}
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
            pattern="[a-z0-9_\-]+"
            title="Lowercase letters, numbers, underscores, and hyphens only"
            required
          />
        </Field>
        <Field label="Temporary password">
          <input className={inputClass()} value={form.password} onChange={set('password')} required minLength={8} />
        </Field>
        <Field label="Role">
          <select className={inputClass()} value={form.role} onChange={set('role')}>
            <option value="setter">Setter</option>
            <option value="closer">Closer</option>
            <option value="admin">Admin</option>
          </select>
        </Field>

        {error && <p className="font-sans text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create account'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Users() {
  const { data: users, isLoading } = useUsers()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium text-fg-primary">Users</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={15} /> Create account
        </Button>
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : (
          <table className="w-full text-left">
            <thead className="eyebrow bg-surface">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Username</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} className="border-t border-line font-sans text-sm">
                  <td className="px-5 py-4 font-medium text-fg-primary">{u.full_name}</td>
                  <td className="px-5 py-4 text-fg-secondary">{u.username}</td>
                  <td className="px-5 py-4 capitalize text-fg-secondary">{u.role}</td>
                  <td className="px-5 py-4">
                    <span className={`eyebrow ${u.is_active ? '!text-success' : '!text-danger'}`}>
                      {u.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
