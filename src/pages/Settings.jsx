import { useEffect, useRef, useState } from 'react'
import { Moon, Sun, SunMoon, Video, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { useZoomConnection, useConnectZoom, useDisconnectZoom } from '../hooks/useZoom'
import { Field, inputClass } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Switch } from '../components/ui/Switch'
import { SELECTABLE_TIMEZONES, DEFAULT_TIMEZONE } from '../lib/timezones'
import { usePageHeader } from '../components/Layout'

// Prompt 453 — Settings got a real nav destination but had nothing genuine
// to put in it yet. Prompt 458 gives it its first real setting: timezone,
// now that "today" is computed per-user across the app instead of a
// single UTC/server boundary. Prompt 502 gives it its second: theme,
// replacing the placeholder card that used to say Restorix doesn't have
// one yet.
// Prompt 619 — Brayden: the page "feels lackluster" with just three
// cards. This is a closer-only pass (Profile/Notifications/Call &
// Booking) — other roles come later once the closer dashboard is done.
// Timezone/Theme stay exactly as-is and ungated. Auth/login/password/
// email/2FA deliberately out of scope — that's a separate, larger prompt
// Brayden is sequencing after this one.
export default function Settings() {
  const { profile } = useAuth()
  usePageHeader({ title: 'Settings', subtitle: 'Account settings — password, name, and role live on Profile.' })
  if (!profile) return null

  return (
    <div className="max-w-lg">
      <p className="eyebrow">General</p>
      <div className="mt-3 rounded-card border border-line bg-elevated p-6">
        <TimezoneForm profile={profile} />
      </div>

      <div className="mt-6 rounded-card border border-line bg-elevated p-6">
        <ThemeForm />
      </div>

      {profile.role === 'closer' && (
        <>
          <p className="eyebrow mt-8">Closer</p>
          <div className="mt-3 rounded-card border border-line bg-elevated p-6">
            <ZoomForm profile={profile} />
          </div>

          <div className="mt-6 rounded-card border border-line bg-elevated p-6">
            <ProfileForm profile={profile} />
          </div>

          <div className="mt-6 rounded-card border border-line bg-elevated p-6">
            <NotificationsForm profile={profile} />
          </div>

          <div className="mt-6 rounded-card border border-line bg-elevated p-6">
            <CallBookingForm profile={profile} />
          </div>
        </>
      )}
    </div>
  )
}

// Prompt 619 — display name + phone, shown on booking confirmations and
// inside the Meeting Room; not a login credential (that's out of scope
// here, see the file-level note above). Same explicit-Save pattern as
// TimezoneForm since these are free-text fields, not one-click choices.
function ProfileForm({ profile }) {
  const { refreshProfile } = useAuth()
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = fullName !== (profile.full_name || '') || phone !== (profile.phone || '')

  async function save(e) {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) { setError('Name cannot be empty'); return }
    setSaving(true)
    const { error: nameError } = await supabase.rpc('update_own_full_name', { p_full_name: fullName })
    if (nameError) {
      setSaving(false)
      setError(nameError.message || 'Could not save your profile')
      return
    }
    const { error: phoneError } = await supabase.rpc('update_own_phone', { p_phone: phone })
    setSaving(false)
    if (phoneError) { setError(phoneError.message || 'Could not save your profile'); return }
    await refreshProfile()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <p className="font-sans text-sm font-semibold text-fg-primary">Profile & Display</p>
        <p className="mt-1 font-sans text-xs text-fg-secondary">
          Shown on booking confirmations and inside the Meeting Room.
        </p>
      </div>
      <Field label="Display name">
        <input className={inputClass()} value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <Field label="Phone number">
        <input
          className={inputClass()}
          type="tel"
          placeholder="(555) 555-5555"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
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

// Prompt 619 — toggle preferences only. No closer-facing notification
// channel (email/push/SMS-to-closer) exists anywhere in this codebase
// yet — the only reminder-sending edge function that exists today
// (send-appointment-reminders) texts the LEAD, not the closer, so there's
// nothing to wire these into. Storing the toggle now, flagged as a
// follow-up: once a real closer-notification sender exists, it should
// check notification_preferences before sending.
const NOTIFICATION_TOGGLES = [
  { key: 'new_lead_assigned', label: 'New lead assigned', hint: 'When a lead is added to your pool.' },
  { key: 'call_booked', label: 'Call booked', hint: 'When a strategy call is booked onto your calendar.' },
  { key: 'call_rescheduled_canceled', label: 'Call rescheduled or canceled', hint: 'When a booked call changes time or is canceled.' },
  { key: 'call_starting_soon', label: 'Call starting soon', hint: 'A heads-up shortly before a booked call starts.' },
]

function NotificationsForm({ profile }) {
  const { refreshProfile } = useAuth()
  const [prefs, setPrefs] = useState(profile.notification_preferences || {})
  const [savingKey, setSavingKey] = useState(null)

  async function toggle(key, value) {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    setSavingKey(key)
    const { error } = await supabase.rpc('update_own_notification_preferences', { p_notification_preferences: next })
    setSavingKey(null)
    if (error) { setPrefs(prefs); return }
    await refreshProfile()
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-sans text-sm font-semibold text-fg-primary">Notifications</p>
        <p className="mt-1 font-sans text-xs text-fg-secondary">
          Choose what you want to be notified about. Sending isn't wired up for every one of these yet — this saves
          your preference either way.
        </p>
      </div>
      <div className="space-y-3">
        {NOTIFICATION_TOGGLES.map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div>
              <p className="font-sans text-sm text-fg-primary">{label}</p>
              <p className="font-sans text-xs text-fg-secondary">{hint}</p>
            </div>
            <Switch
              checked={prefs[key] !== false}
              onChange={(value) => toggle(key, value)}
              disabled={savingKey === key}
              label={label}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

const REMINDER_LEAD_TIMES = [
  { value: '15m', label: '15 minutes before' },
  { value: '30m', label: '30 minutes before' },
  { value: '1h', label: '1 hour before' },
]

// Prompt 619 — stored preferences only, flagged per the prompt's own
// scope: default reminder lead time doesn't map onto the existing
// send-appointment-reminders function (that fires fixed 24h/1h/15m
// thresholds to the LEAD's phone, unrelated to a closer preference), and
// wiring a real "auto-open Meeting Room shortly before a call starts"
// would need a global watcher (running outside the Meeting Room page,
// deduping so it doesn't re-open a call already dismissed) — a real
// feature addition, not a toggle-sized change. Shipping the toggle +
// storage now rather than guessing at that design.
function CallBookingForm({ profile }) {
  const { refreshProfile } = useAuth()
  const [leadTime, setLeadTime] = useState(profile.call_reminder_lead_time || '15m')
  const [autoOpen, setAutoOpen] = useState(!!profile.auto_open_meeting_room)
  const [saving, setSaving] = useState(false)

  async function persist(nextLeadTime, nextAutoOpen) {
    setSaving(true)
    const { error } = await supabase.rpc('update_own_call_preferences', {
      p_call_reminder_lead_time: nextLeadTime,
      p_auto_open_meeting_room: nextAutoOpen,
    })
    setSaving(false)
    if (!error) await refreshProfile()
  }

  function onLeadTimeChange(value) {
    setLeadTime(value)
    persist(value, autoOpen)
  }

  function onAutoOpenChange(value) {
    setAutoOpen(value)
    persist(leadTime, value)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-sans text-sm font-semibold text-fg-primary">Call & Booking</p>
        <p className="mt-1 font-sans text-xs text-fg-secondary">Preferences only for now — not yet wired into automatic behavior.</p>
      </div>
      <Field label="Default reminder lead time">
        <select
          className={inputClass()}
          value={leadTime}
          onChange={(e) => onLeadTimeChange(e.target.value)}
          disabled={saving}
        >
          {REMINDER_LEAD_TIMES.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </Field>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-sans text-sm text-fg-primary">Auto-open Meeting Room</p>
          <p className="font-sans text-xs text-fg-secondary">Open the Meeting Room shortly before a call starts.</p>
        </div>
        <Switch checked={autoOpen} onChange={onAutoOpenChange} disabled={saving} label="Auto-open Meeting Room" />
      </div>
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

// Prompt 617 — the popup navigates through Zoom itself, then lands on
// zoom-oauth-callback (this function's own origin) which posts the result
// back before closing. Hardcoded the same way that function's own
// ZOOM_REDIRECT_URI/APP_SETTINGS_URL are.
const ZOOM_CALLBACK_ORIGIN = 'https://avgvmzshujwphneykuvu.supabase.co'

function ZoomForm({ profile }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: connection, isLoading, refetch } = useZoomConnection(profile.id)
  const connectZoom = useConnectZoom()
  const disconnectZoom = useDisconnectZoom()
  const [error, setError] = useState('')
  const [waitingForPopup, setWaitingForPopup] = useState(false)
  const [popupBlockedNotice, setPopupBlockedNotice] = useState(false)
  const popupRef = useRef(null)
  const popupPollRef = useRef(null)

  // The zoom-oauth-callback edge function falls back to a plain redirect
  // back here (with ?zoom=connected/denied/expired/error) when there's no
  // window.opener to postMessage — e.g. the popup was blocked and this
  // component fell back to a full-page redirect itself, or a browser tore
  // down the opener relationship. Surface it once, then clear it from the
  // URL so a refresh doesn't re-show a stale result.
  const zoomStatus = searchParams.get('zoom')
  useEffect(() => {
    if (!zoomStatus) return
    if (zoomStatus === 'connected') refetch()
    const next = new URLSearchParams(searchParams)
    next.delete('zoom')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomStatus])

  function stopWatchingPopup() {
    setWaitingForPopup(false)
    if (popupPollRef.current) {
      clearInterval(popupPollRef.current)
      popupPollRef.current = null
    }
    popupRef.current = null
  }

  // Prompt 617 — the popup's result arrives via postMessage instead of
  // (only) a full-page redirect back to this URL. Checked against the
  // callback function's own origin, not window.location.origin — the
  // message is sent FROM that origin, so event.origin reflects the
  // sender, not this page.
  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== ZOOM_CALLBACK_ORIGIN) return
      const data = event.data
      if (!data || data.type !== 'zoom-oauth-result') return
      try { popupRef.current?.close() } catch { /* already closed */ }
      stopWatchingPopup()
      if (data.ok) {
        setError('')
        refetch()
      } else {
        setError(ZOOM_STATUS_COPY[data.status]?.text || "Couldn't connect Zoom — try again.")
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => stopWatchingPopup, [])

  async function connect() {
    setError('')
    setPopupBlockedNotice(false)
    try {
      const url = await connectZoom.mutateAsync()
      const popup = window.open(url, 'zoom-connect', 'width=520,height=720')
      if (!popup) {
        // Blocked — fall back to the pre-617 full-page redirect rather
        // than leaving the click as a silent no-op. Delayed a beat so the
        // notice actually paints before the tab navigates away.
        setPopupBlockedNotice(true)
        setTimeout(() => { window.location.href = url }, 300)
        return
      }
      popupRef.current = popup
      setWaitingForPopup(true)
      popupPollRef.current = setInterval(() => {
        if (popup.closed) {
          // Closed manually without finishing — quietly reset, no error
          // toast for a plain cancel.
          stopWatchingPopup()
        }
      }, 500)
    } catch (e) {
      setError(e.message || 'Could not start the Zoom connection')
    }
  }

  async function disconnect() {
    setError('')
    try {
      await disconnectZoom.mutateAsync(profile.id)
      refetch()
    } catch (e) {
      setError(e.message || 'Could not disconnect Zoom')
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
      {popupBlockedNotice && (
        <p className="font-sans text-sm text-fg-secondary">Your browser blocked the popup — continuing without it…</p>
      )}

      {isLoading ? (
        <p className="font-sans text-sm text-fg-secondary">Checking…</p>
      ) : connection ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-sans text-sm text-success">
            <CheckCircle2 size={16} />
            Connected{connection.zoom_email ? ` as ${connection.zoom_email}` : ''}
          </div>
          <Button type="button" variant="secondary" onClick={disconnect} disabled={disconnectZoom.isPending}>
            {disconnectZoom.isPending ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={connect} disabled={connectZoom.isPending || waitingForPopup}>
          <Video size={15} />
          {waitingForPopup ? 'Waiting for Zoom…' : connectZoom.isPending ? 'Connecting…' : 'Connect Zoom'}
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
