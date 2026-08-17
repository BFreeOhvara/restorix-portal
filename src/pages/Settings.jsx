import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Field, inputClass } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { SELECTABLE_TIMEZONES, DEFAULT_TIMEZONE } from '../lib/timezones'

// Prompt 453 — Settings got a real nav destination but had nothing genuine
// to put in it yet. Prompt 458 gives it its first real setting: timezone,
// now that "today" is computed per-user across the app instead of a
// single UTC/server boundary. Theme/integrations still don't exist —
// still nothing to show for those, so this page is no longer a pure
// placeholder but isn't a full tabbed settings shell either.
export default function Settings() {
  const { profile } = useAuth()
  if (!profile) return null

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl font-medium text-fg-primary">Settings</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">
        Account settings — password, name, and role live on Profile.
      </p>

      <div className="mt-6 rounded-card border border-line bg-elevated p-6">
        <TimezoneForm profile={profile} />
      </div>

      <div className="mt-6 rounded-card border border-line bg-elevated p-8 text-center">
        <p className="font-sans text-sm text-fg-secondary">
          Nothing else to configure yet — Restorix doesn't have a theme toggle or integrations
          built yet. This section will grow as real settings arrive.
        </p>
      </div>
    </div>
  )
}

function TimezoneForm({ profile }) {
  const { refreshProfile } = useAuth()
  const [timezone, setTimezone] = useState(profile.timezone || DEFAULT_TIMEZONE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = timezone !== (profile.timezone || DEFAULT_TIMEZONE)

  async function save(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('update_own_timezone', { p_timezone: timezone })
    setSaving(false)
    if (rpcError) { setError(rpcError.message || 'Could not save your timezone'); return }
    await refreshProfile()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="font-sans text-sm font-semibold text-fg-primary">Timezone</p>
      <p className="font-sans text-xs text-fg-secondary">
        Drives what "today" means everywhere in the app — Overview, My Goals, Stats, Activity, and My
        Calls all use this instead of server time.
      </p>
      <Field label="Timezone">
        <select className={inputClass()} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {SELECTABLE_TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
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
