import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Field, inputClass } from '../components/ui/Field'
import { Button } from '../components/ui/Button'

const ROLE_LABEL = { setter: 'Setter', closer: 'Closer', admin: 'Admin' }

// Prompt 453 — profile edit + password change. Scope kept to what
// `profiles` actually has a column for (full_name only — no email/phone/
// avatar exist in this schema) plus password change, since Prompt 428
// never built any change-password UI anywhere in the app. Full name saves
// via the `update_own_full_name` RPC rather than a direct table update +
// permissive self-update RLS policy — a bare `USING (auth.uid() = id)`
// UPDATE policy (the pattern ohvara-dashboard's own profiles table uses)
// has no column-level restriction, so a user could rewrite their own
// `role` through it. The RPC's signature is the whitelist instead.
export default function Profile() {
  const { profile } = useAuth()
  if (!profile) return null

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl font-medium text-fg-primary">Profile</h1>

      <div className="mt-6 rounded-card border border-line bg-elevated p-6">
        <p className="eyebrow !text-fg-faint">Role</p>
        <p className="mt-1 font-sans text-sm text-fg-primary">{ROLE_LABEL[profile.role] || profile.role}</p>

        <p className="eyebrow !text-fg-faint mt-4">Username</p>
        <p className="mt-1 font-mono text-sm text-fg-secondary">{profile.username}</p>
      </div>

      <div className="mt-6 rounded-card border border-line bg-elevated p-6">
        <NameForm profile={profile} />
      </div>

      <div className="mt-6 rounded-card border border-line bg-elevated p-6">
        <PasswordForm />
      </div>
    </div>
  )
}

function NameForm({ profile }) {
  const { refreshProfile } = useAuth()
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = fullName !== (profile.full_name || '')

  async function save(e) {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) { setError('Name cannot be empty'); return }
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('update_own_full_name', { p_full_name: fullName.trim() })
    setSaving(false)
    if (rpcError) { setError(rpcError.message || 'Could not save your name'); return }
    await refreshProfile()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="font-sans text-sm font-semibold text-fg-primary">Display name</p>
      <Field label="Full name">
        <input className={inputClass()} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </Field>
      {error && <p className="font-sans text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        {saved && <span className="font-sans text-sm text-success">Saved</span>}
      </div>
    </form>
  )
}

function PasswordForm() {
  const { session } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    setDone(false)
    if (!form.current) return setError('Enter your current password')
    if (form.next.length < 8) return setError('New password must be at least 8 characters')
    if (form.next !== form.confirm) return setError('New passwords do not match')

    setSaving(true)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: form.current,
    })
    if (authError) {
      setSaving(false)
      setError('Current password is incorrect')
      return
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: form.next })
    setSaving(false)
    if (updateError) { setError(updateError.message || 'Could not update your password'); return }
    setForm({ current: '', next: '', confirm: '' })
    setDone(true)
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="font-sans text-sm font-semibold text-fg-primary">Change password</p>
      <Field label="Current password">
        <input type="password" autoComplete="current-password" className={inputClass()} value={form.current} onChange={set('current')} required />
      </Field>
      <Field label="New password">
        <input type="password" autoComplete="new-password" placeholder="8+ characters" className={inputClass()} value={form.next} onChange={set('next')} required minLength={8} />
      </Field>
      <Field label="Confirm new password">
        <input type="password" autoComplete="new-password" className={inputClass()} value={form.confirm} onChange={set('confirm')} required />
      </Field>
      {error && <p className="font-sans text-sm text-danger">{error}</p>}
      {done && <p className="font-sans text-sm text-success">Password updated — use it next time you sign in.</p>}
      <Button type="submit" disabled={saving}>
        {saving ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  )
}
