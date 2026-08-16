import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Link2, Copy, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { Field, inputClass } from '../components/ui/Field'
import { usePendingInvites, useCreateInvite, useRevokeInvite } from '../hooks/useInvites'

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

function InviteModal({ onClose }) {
  const [role, setRole] = useState('setter')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const createInvite = useCreateInvite()

  async function handleGenerate() {
    setError('')
    try {
      const token = await createInvite.mutateAsync(role)
      setLink(`${window.location.origin}/join/${token}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
  }

  return (
    <Modal title="Invite a new account" onClose={onClose}>
      {!link ? (
        <div className="space-y-4">
          <Field label="Role">
            <select className={inputClass()} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="setter">Setter</option>
              <option value="closer">Closer</option>
            </select>
          </Field>

          {error && <p className="font-sans text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleGenerate} disabled={createInvite.isPending}>
              {createInvite.isPending ? 'Generating…' : 'Generate link'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="font-sans text-sm text-fg-secondary">
            Send this link to the new {role}. It expires in 7 days and can only be used once.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-base px-3 py-2">
            <p className="flex-1 truncate font-mono text-xs text-fg-primary">{link}</p>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 rounded-md p-1.5 text-fg-secondary hover:bg-surface hover:text-fg-primary"
              title="Copy link"
            >
              <Copy size={14} />
            </button>
          </div>
          {copied && <p className="font-sans text-xs text-success">Copied to clipboard.</p>}

          <div className="flex justify-end pt-2">
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function PendingInvites() {
  const { data: invites, isLoading } = usePendingInvites()
  const revoke = useRevokeInvite()

  if (isLoading || !invites?.length) return null

  return (
    <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
      <div className="border-b border-line px-5 py-3">
        <p className="eyebrow">Pending invites</p>
      </div>
      <table className="w-full text-left">
        <tbody>
          {invites.map((inv) => (
            <tr key={inv.id} className="border-t border-line font-sans text-sm first:border-t-0">
              <td className="px-5 py-3 capitalize text-fg-secondary">{inv.role}</td>
              <td className="px-5 py-3 text-fg-faint">
                Expires {new Date(inv.expires_at).toLocaleDateString()}
              </td>
              <td className="px-5 py-3 text-right">
                <button
                  onClick={() => revoke.mutate(inv.id)}
                  className="rounded-md p-1.5 text-fg-faint hover:bg-surface hover:text-danger"
                  title="Revoke invite"
                >
                  <X size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Users() {
  const { data: users, isLoading } = useUsers()
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium text-fg-primary">Users</h1>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setShowInvite(true)}>
            <Link2 size={15} /> Invite
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={15} /> Create account
          </Button>
        </div>
      </div>

      <PendingInvites />

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
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  )
}
