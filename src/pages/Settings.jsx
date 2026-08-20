import { useState } from 'react'
import { Moon, Sun, SunMoon } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { Field, inputClass } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { SELECTABLE_TIMEZONES, DEFAULT_TIMEZONE } from '../lib/timezones'

// Prompt 453 — Settings got a real nav destination but had nothing genuine
// to put in it yet. Prompt 458 gives it its first real setting: timezone,
// now that "today" is computed per-user across the app instead of a
// single UTC/server boundary. Prompt 502 gives it its second: theme,
// replacing the placeholder card that used to say Restorix doesn't have
// one yet.
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

      <div className="mt-6 rounded-card border border-line bg-elevated p-6">
        <ThemeForm />
      </div>
    </div>
  )
}

const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: SunMoon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

function ThemeForm() {
  const { refreshProfile } = useAuth()
  const { themePreference, setThemePreference } = useTheme()
  const [saving, setSaving] = useState(null)

  async function choose(value) {
    if (value === themePreference || saving) return
    setSaving(value)
    await setThemePreference(value)
    await refreshProfile()
    setSaving(null)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-sans text-sm font-semibold text-fg-primary">Theme</p>
        <p className="mt-1 font-sans text-xs text-fg-secondary">
          System follows your device's light/dark setting automatically. Light and Dark override it.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = themePreference === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              disabled={saving !== null}
              className={clsx(
                'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 font-sans text-sm transition-colors disabled:cursor-not-allowed',
                active
                  ? 'border-accent bg-accent/10 font-semibold text-accent'
                  : 'border-line text-fg-secondary hover:border-fg-primary/40 hover:text-fg-primary'
              )}
            >
              <Icon size={18} />
              {saving === value ? 'Saving…' : label}
            </button>
          )
        })}
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
