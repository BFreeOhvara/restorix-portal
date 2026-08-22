import { useEffect, useState } from 'react'
import { Moon, Sun, SunMoon, Video, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { useZoomConnection, useConnectZoom } from '../hooks/useZoom'
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

      {profile.role === 'closer' && (
        <div className="mt-6 rounded-card border border-line bg-elevated p-6">
          <ZoomForm profile={profile} />
        </div>
      )}
    </div>
  )
}

// Prompt 530 — per-closer Zoom OAuth connect, per Prompt 529's confirmed
// design (each closer connects their own account, not a shared company
// credential). Same per-setting-card pattern as TimezoneForm/ThemeForm.
const ZOOM_STATUS_COPY = {
  connected: { tone: 'success', text: 'Zoom connected.' },
  denied: { tone: 'danger', text: 'Zoom connection was cancelled.' },
  expired: { tone: 'danger', text: 'That connection link expired — try again.' },
  error: { tone: 'danger', text: "Couldn't connect Zoom — try again, or ask an admin to check the setup." },
}

function ZoomForm({ profile }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: connection, isLoading, refetch } = useZoomConnection(profile.id)
  const connectZoom = useConnectZoom()
  const [error, setError] = useState('')

  // The zoom-oauth-callback edge function redirects back here with
  // ?zoom=connected/denied/expired/error — surface it once, then clear
  // it from the URL so a refresh doesn't re-show a stale result.
  const zoomStatus = searchParams.get('zoom')
  useEffect(() => {
    if (!zoomStatus) return
    if (zoomStatus === 'connected') refetch()
    const next = new URLSearchParams(searchParams)
    next.delete('zoom')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomStatus])

  async function connect() {
    setError('')
    try {
      const url = await connectZoom.mutateAsync()
      window.location.href = url
    } catch (e) {
      setError(e.message || 'Could not start the Zoom connection')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-sans text-sm font-semibold text-fg-primary">Zoom</p>
        <p className="mt-1 font-sans text-xs text-fg-secondary">
          Connect your own Zoom account so meetings for your booked appointments run under you as host.
        </p>
      </div>

      {zoomStatus && ZOOM_STATUS_COPY[zoomStatus] && (
        <p className={clsx('font-sans text-sm', ZOOM_STATUS_COPY[zoomStatus].tone === 'success' ? 'text-success' : 'text-danger')}>
          {ZOOM_STATUS_COPY[zoomStatus].text}
        </p>
      )}

      {isLoading ? (
        <p className="font-sans text-sm text-fg-secondary">Checking…</p>
      ) : connection ? (
        <div className="flex items-center gap-2 font-sans text-sm text-success">
          <CheckCircle2 size={16} />
          Connected{connection.zoom_email ? ` as ${connection.zoom_email}` : ''}
        </div>
      ) : (
        <Button type="button" onClick={connect} disabled={connectZoom.isPending}>
          <Video size={15} />
          {connectZoom.isPending ? 'Redirecting…' : 'Connect Zoom'}
        </Button>
      )}
      {error && <p className="font-sans text-sm text-danger">{error}</p>}
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
