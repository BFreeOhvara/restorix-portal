import { lazy, Suspense, useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Field, inputClass } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { useUploadAvatar, useRemoveAvatar } from '../hooks/useAvatar'

const AVATAR_SIZE = 56

// Prompt 491 — lazy, not a top-level import: react-easy-crop is only
// needed the moment someone actually opens the crop modal, same
// reasoning ohvara-dashboard's Prompt 422 already established.
const AvatarCropModal = lazy(() =>
  import('../components/ui/AvatarCropModal').then((m) => ({ default: m.AvatarCropModal }))
)

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
// Prompt 491 — avatar photo upload (ported from ohvara-dashboard's Prompt
// 422) now lives in the same first card, same whitelisted-RPC pattern as
// the name/timezone self-updates above.
// Prompt 495 — live review on 491's just-shipped avatar work, three
// reversals/fixes: (1) the pastel color picker is gone — users no longer
// choose their own initials-fallback color, it's assigned deterministically
// at signup instead (see migration avatar_color_deterministic, which also
// backfills every existing profile the same way, so the "avatar_color still
// gives initials-avatars visual variety" goal from 491 is met immediately,
// not just for future signups — recomputing to a real value isn't "wiping"
// the column, only nulling/removing it would be). (2) the plain "Remove
// photo" text link is replaced with a small X badge on the avatar itself,
// same visual language as the camera badge. (3) the camera/X badges'
// positioning bug fixed: the wrapping button had `display: block` with no
// explicit size, so its own box didn't reliably match the 56px Avatar's
// true circle — the badges' `-bottom-0.5 -right-0.5`/`-top-0.5 -right-0.5`
// offsets were computed against that wrong box. Given the button an
// explicit `width`/`height` matching `AVATAR_SIZE` instead of relying on
// block-level shrink-to-fit sizing to happen to match.
export default function Profile() {
  const { profile } = useAuth()
  if (!profile) return null

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl font-medium text-fg-primary">Profile</h1>

      <div className="mt-6 rounded-card border border-line bg-elevated p-6">
        <div className="flex items-start gap-4">
          <AvatarUpload profile={profile} />
          <div>
            <p className="eyebrow !text-fg-faint">Role</p>
            <p className="mt-1 font-sans text-sm text-fg-primary">{ROLE_LABEL[profile.role] || profile.role}</p>

            <p className="eyebrow !text-fg-faint mt-4">Username</p>
            <p className="mt-1 font-mono text-sm text-fg-secondary">{profile.username}</p>
          </div>
        </div>
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

// Click the avatar circle to pick a new photo; a crop/zoom modal opens
// before upload, then the same shared Avatar renders it everywhere it's
// used. When no photo is set, the initials fallback uses avatar_color,
// assigned deterministically at signup (see migration
// avatar_color_deterministic) — no user-facing picker as of Prompt 495.
// Removing a photo only ever touches avatar_url, never avatar_color, so
// the deterministic color is still there underneath afterward.
function AvatarUpload({ profile }) {
  const upload = useUploadAvatar()
  const remove = useRemoveAvatar()
  const { refreshProfile } = useAuth()
  const inputRef = useRef(null)
  const [error, setError] = useState('')
  const [pendingImage, setPendingImage] = useState(null) // object URL awaiting crop confirm

  const busy = upload.isPending || remove.isPending

  function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file) return
    setError('')
    setPendingImage(URL.createObjectURL(file))
  }

  function closeCropModal() {
    if (pendingImage) URL.revokeObjectURL(pendingImage)
    setPendingImage(null)
  }

  async function onCropConfirm(blob) {
    setError('')
    try {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      await upload.mutateAsync({ profileId: profile.id, file })
      await refreshProfile()
      closeCropModal()
    } catch (err) {
      setError(err.message || 'Could not upload your photo')
    }
  }

  async function onRemove(e) {
    e.stopPropagation()
    setError('')
    try {
      await remove.mutateAsync({ profileId: profile.id })
      await refreshProfile()
    } catch (err) {
      setError(err.message || 'Could not remove your photo')
    }
  }

  return (
    <div className="shrink-0">
      <div className="relative" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          title="Change profile photo"
          className="group relative rounded-full disabled:cursor-default"
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
        >
          <Avatar profile={profile} size={AVATAR_SIZE} className="border border-line" />
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
            {busy ? <Loader2 size={16} className="animate-spin text-white" /> : <Camera size={16} className="text-white" />}
          </div>
          {!busy && (
            <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-elevated bg-accent">
              <Camera size={11} className="text-white" />
            </div>
          )}
        </button>
        {profile.avatar_url && !busy && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove photo"
            className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-elevated bg-danger"
          >
            <X size={11} className="text-white" strokeWidth={2.5} />
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>

      {error && <p className="mt-1 max-w-[8rem] font-sans text-[11px] text-danger">{error}</p>}

      {pendingImage && (
        <Suspense fallback={null}>
          <AvatarCropModal
            imageSrc={pendingImage}
            onCancel={closeCropModal}
            onConfirm={onCropConfirm}
            saving={upload.isPending}
          />
        </Suspense>
      )}
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
