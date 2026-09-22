import { useEffect, useRef, useState } from 'react'
import { Moon, Sun, SunMoon, Video, CheckCircle2, ShieldCheck } from 'lucide-react'
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
import { AvatarUpload, ROLE_LABEL } from './Profile'

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
// Prompt 621 — the closer view (only) is rebuilt as a real tabbed hub
// (floating sub-nav + per-topic cards), replacing the flat max-w-lg card
// stack Brayden called "thrown together". Design signed off in a mockup
// built from the app's own tokens: https://claude.ai/artifact/RoyToc72PPoHTaMTQnth2m
// Non-closer roles (setter/admin/client) are untouched — they only ever
// saw Timezone+Theme here and still do, same layout as before.
// Prompt 624 — 621's floating sub-nav + two-boxed-card panels replaced
// with a horizontal underline tab bar and single-column flowing sections
// (SettingsSection), per a second signed-off mockup with more density:
// https://claude.ai/artifact/DHyjHonUXeQbyQpw4Uws1n. Same fields/toggles/
// RPCs throughout — layout only, plus three honestly-locked "Soon"
// preview sections (no persistence, no schema, disabled controls).
export default function Settings() {
  const { profile } = useAuth()
  usePageHeader({ title: 'Settings', subtitle: 'Account settings — password, name, and role live on Profile.' })
  if (!profile) return null

  if (profile.role !== 'closer') {
    return (
      <div className="max-w-lg">
        <p className="eyebrow">General</p>
        <div className="mt-3 rounded-card border border-line bg-elevated p-6">
          <TimezoneForm profile={profile} />
        </div>

        <div className="mt-6 rounded-card border border-line bg-elevated p-6">
          <ThemeForm />
        </div>
      </div>
    )
  }

  return <CloserSettingsHub profile={profile} />
}

const CLOSER_TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'booking', label: 'Call & Booking' },
  { key: 'integrations', label: 'Integrations' },
]

function CloserSettingsHub({ profile }) {
  const [tab, setTab] = useState('profile')

  return (
    <div className="max-w-3xl">
      <div className="mb-8 flex items-center gap-1 overflow-x-auto border-b border-line">
        {CLOSER_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 font-sans text-sm transition-colors',
              tab === key
                ? 'border-accent font-semibold text-accent'
                : 'border-transparent text-fg-secondary hover:text-fg-primary'
            )}
          >
            {label}
          </button>
        ))}
        {/* Security stays disabled/unclickable until Prompt 620 has a real
            panel to show here — honestly locked, not faked. */}
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-4 py-2.5 font-sans text-sm text-fg-faint">
          <ShieldCheck size={15} />
          Security
          <span className="rounded-full border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-faint">
            620
          </span>
        </span>
      </div>

      {tab === 'profile' && <ProfilePanel profile={profile} />}
      {tab === 'appearance' && <AppearancePanel profile={profile} />}
      {tab === 'notifications' && <NotificationsPanel profile={profile} />}
      {tab === 'booking' && <BookingPanel profile={profile} />}
      {tab === 'integrations' && <IntegrationsPanel profile={profile} />}
    </div>
  )
}

function SettingsSection({ title, description, action, badge, last = false, children }) {
  return (
    <div className={clsx('py-6 first:pt-0', !last && 'border-b border-line')}>
      <div className={clsx('mb-4', action ? 'flex items-start justify-between gap-4' : undefined)}>
        <div>
          <p className="flex items-center gap-2 font-sans text-sm font-semibold text-fg-primary">
            {title}
            {badge}
          </p>
          {description && <p className="mt-1 font-sans text-xs text-fg-secondary">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function SoonBadge() {
  return (
    <span className="rounded-full border border-line-strong px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent-deep">
      Soon
    </span>
  )
}

// ---- Profile tab -----------------------------------------------------

function ProfilePanel({ profile }) {
  return (
    <div>
      <BasicInfoCard profile={profile} />
      <AccountCard profile={profile} />
    </div>
  )
}

// Prompt 621 — same display-name/phone RPCs Prompt 619 shipped, moved
// into a card with a real avatar/photo row above the fields (reusing
// Profile.jsx's own AvatarUpload/useUploadAvatar/useRemoveAvatar/
// AvatarCropModal exactly as-is) and its Save button relocated to the
// card header's top-right.
function BasicInfoCard({ profile }) {
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
    <form onSubmit={save}>
      <SettingsSection
        title="Photo & name"
        description="Shown on booking confirmations and inside the Meeting Room."
        action={
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        }
      >
        <div className="mb-5 border-b border-line pb-5">
          <AvatarUpload
            profile={profile}
            size={52}
            meta={
              <>
                <p className="font-sans text-sm font-semibold text-fg-primary">{profile.full_name}</p>
                <p className="font-sans text-xs text-fg-secondary">{ROLE_LABEL[profile.role] || profile.role}</p>
              </>
            }
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>
        {error && <p className="mt-3 font-sans text-sm text-danger">{error}</p>}
        {saved && <p className="mt-3 font-sans text-sm text-success">Saved</p>}
      </SettingsSection>
    </form>
  )
}

// Read-only for now — login/password/role move here once Security
// (Prompt 620) ships. No new fields, no edit capability. "Member since"
// added in Prompt 624 — profile.created_at is already returned by
// useAuth's `select('*')`, no new query needed.
function AccountCard({ profile }) {
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  return (
    <SettingsSection
      title="Account"
      description="Read-only for now — login and password move here once Security ships."
      last
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <span className="eyebrow">Role</span>
          <p className="mt-1.5">
            <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 font-sans text-xs font-semibold text-accent-deep">
              {ROLE_LABEL[profile.role] || profile.role}
            </span>
          </p>
        </div>
        <div>
          <span className="eyebrow">Username</span>
          <p className="mt-1.5 font-mono text-sm text-fg-secondary">{profile.username}</p>
        </div>
        <div>
          <span className="eyebrow">Member since</span>
          <p className="mt-1.5 font-sans text-sm text-fg-primary">{memberSince}</p>
        </div>
      </div>
    </SettingsSection>
  )
}

// ---- Appearance tab ----------------------------------------------------

function AppearancePanel({ profile }) {
  return (
    <div>
      <TimezoneForm profile={profile} headerAction />
      <ThemeForm last />
    </div>
  )
}

// ---- Notifications tab --------------------------------------------------

// Prompt 619 — toggle preferences only. No closer-facing notification
// channel (email/push/SMS-to-closer) exists anywhere in this codebase
// yet — the only reminder-sending edge function that exists today
// (send-appointment-reminders) texts the LEAD, not the closer, so there's
// nothing to wire these into. Storing the toggle now, flagged as a
// follow-up: once a real closer-notification sender exists, it should
// check notification_preferences before sending.
// Prompt 621 — split into "Leads" and "Calls" cards by what the toggle is
// actually about, same NotificationsForm logic/RPC, two render groups.
const LEAD_NOTIFICATION_TOGGLES = [
  { key: 'new_lead_assigned', label: 'New lead assigned', hint: 'When a lead is added to your pool.' },
]
const CALL_NOTIFICATION_TOGGLES = [
  { key: 'call_booked', label: 'Call booked', hint: 'When a strategy call is booked onto your calendar.' },
  { key: 'call_rescheduled_canceled', label: 'Call rescheduled or canceled', hint: 'When a booked call changes time or is canceled.' },
  { key: 'call_starting_soon', label: 'Call starting soon', hint: 'A heads-up shortly before a booked call starts.' },
]

// Prompt 624 — pure UI preview, no persistence/schema/wiring. Rendered
// with ToggleList's `disabled` mode: permanently-off, non-interactive
// switches, same honest-lock spirit as the Security tab.
const DELIVERY_CHANNEL_TOGGLES = [
  { key: 'email', label: 'Email', hint: 'Send alerts to your login email.' },
  { key: 'sms', label: 'SMS', hint: 'Text alerts to the phone number on your profile.' },
  { key: 'push', label: 'Push', hint: 'Browser/app push while the portal is open.' },
]

function NotificationsPanel({ profile }) {
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
    <div>
      <SettingsSection title="Leads" description="Sending isn't wired up yet — this saves your preference either way.">
        <ToggleList toggles={LEAD_NOTIFICATION_TOGGLES} prefs={prefs} savingKey={savingKey} onToggle={toggle} />
      </SettingsSection>
      <SettingsSection title="Calls" description="Sending isn't wired up yet — this saves your preference either way.">
        <ToggleList toggles={CALL_NOTIFICATION_TOGGLES} prefs={prefs} savingKey={savingKey} onToggle={toggle} />
      </SettingsSection>
      <SettingsSection
        title="Delivery channels"
        badge={<SoonBadge />}
        description="Choose where these alerts get sent once notification delivery is built."
        last
      >
        <ToggleList toggles={DELIVERY_CHANNEL_TOGGLES} disabled />
      </SettingsSection>
    </div>
  )
}

function ToggleList({ toggles, prefs, savingKey, onToggle, disabled = false }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {toggles.map(({ key, label, hint }) => (
        <div key={key} className="flex items-center justify-between gap-4 bg-surface px-4 py-3.5">
          <div>
            <p className={clsx('font-sans text-sm font-medium', disabled ? 'text-fg-faint' : 'text-fg-primary')}>{label}</p>
            <p className={clsx('mt-0.5 font-sans text-xs', disabled ? 'text-fg-faint' : 'text-fg-secondary')}>{hint}</p>
          </div>
          {disabled ? (
            <Switch checked={false} onChange={() => {}} disabled label={label} />
          ) : (
            <Switch
              checked={prefs[key] !== false}
              onChange={(value) => onToggle(key, value)}
              disabled={savingKey === key}
              label={label}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ---- Call & Booking tab -------------------------------------------------

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
// Prompt 621 — split into "Reminders" and "Meeting Room" cards, same
// CallBookingForm logic/RPC, two render groups.
function BookingPanel({ profile }) {
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
    <div>
      <SettingsSection title="Reminders" description="Not yet wired into automatic behavior.">
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
      </SettingsSection>
      <SettingsSection title="Meeting Room" description="Not yet wired into automatic behavior.">
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          <div className="flex items-center justify-between gap-4 bg-surface px-4 py-3.5">
            <div>
              <p className="font-sans text-sm font-medium text-fg-primary">Auto-open Meeting Room</p>
              <p className="mt-0.5 font-sans text-xs text-fg-secondary">Open the Meeting Room shortly before a call starts.</p>
            </div>
            <Switch checked={autoOpen} onChange={onAutoOpenChange} disabled={saving} label="Auto-open Meeting Room" />
          </div>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Availability windows"
        badge={<SoonBadge />}
        description="Set the hours you're generally available for booked calls — not built yet."
        last
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Earliest booking time">
            <input className={inputClass()} value="9:00 AM" disabled readOnly />
          </Field>
          <Field label="Latest booking time">
            <input className={inputClass()} value="6:00 PM" disabled readOnly />
          </Field>
        </div>
      </SettingsSection>
    </div>
  )
}

// ---- Integrations tab ---------------------------------------------------

// Prompt 621 — Zoom's existing Connect/Disconnect card (Prompt 530/617)
// unchanged, plus a new read-only "In-portal calling" card describing the
// Meeting SDK embed (Prompt 618/620) whose status text genuinely reflects
// the real connection state via the same useZoomConnection query (react-
// query dedupes the identical ['zoom-connection', closerId] key against
// ZoomForm's own call, so this isn't a second network request).
function IntegrationsPanel({ profile }) {
  return (
    <div>
      <ZoomForm profile={profile} />
      <InPortalCallingCard profile={profile} />
      <SettingsSection
        title="Calendar sync"
        badge={<SoonBadge />}
        description="Two-way sync with Google or Outlook calendar — not built yet."
        last
      />
    </div>
  )
}

function InPortalCallingCard({ profile }) {
  const { data: connection, isLoading } = useZoomConnection(profile.id)
  const connected = !!connection

  return (
    <SettingsSection
      title="In-portal calling"
      description="Booked calls open inside the Meeting Room using Zoom's Meeting SDK — no separate tab or app."
    >
      {isLoading ? (
        <p className="font-sans text-sm text-fg-secondary">Checking…</p>
      ) : (
        <div className={clsx('flex items-center gap-2 font-sans text-sm', connected ? 'text-success' : 'text-fg-secondary')}>
          {connected && <CheckCircle2 size={16} />}
          {connected ? 'Active — uses the Zoom account connected above' : 'Connect Zoom above to enable'}
        </div>
      )}
    </SettingsSection>
  )
}

// Prompt 530 — per-closer Zoom OAuth connect, per Prompt 529's confirmed
// design (each closer connects their own account, not a shared company
// credential). Same per-setting-card pattern as TimezoneForm/ThemeForm.
const ZOOM_STATUS_COPY = {
  connected: { tone: 'success', text: 'Zoom connected.' },
  denied: { tone: 'danger', text: 'Zoom connection was cancelled.' },
  expired: { tone: 'danger', text: "That connection link expired — try again." },
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
    <SettingsSection title="Zoom account" description="Connect your own Zoom account so meetings for your booked appointments run under you as host.">
      {zoomStatus && ZOOM_STATUS_COPY[zoomStatus] && (
        <p className={clsx('mb-3 font-sans text-sm', ZOOM_STATUS_COPY[zoomStatus].tone === 'success' ? 'text-success' : 'text-danger')}>
          {ZOOM_STATUS_COPY[zoomStatus].text}
        </p>
      )}
      {popupBlockedNotice && (
        <p className="mb-3 font-sans text-sm text-fg-secondary">Your browser blocked the popup — continuing without it…</p>
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
      {error && <p className="mt-3 font-sans text-sm text-danger">{error}</p>}
    </SettingsSection>
  )
}

const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: SunMoon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

// Prompt 624 — decorative two-tone swatch above each theme label, per the
// signed-off mockup. Hardcoded to the real token hex values in
// src/index.css (not read from CSS vars at runtime) — same "System"/
// "Light" swatch on purpose, matching the mockup exactly.
const THEME_SWATCH = {
  system: ['#e5ecea', '#ffffff'],
  light: ['#e5ecea', '#ffffff'],
  dark: ['#0d1512', '#1a2420'],
}

function ThemeForm({ last = false }) {
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
    <SettingsSection
      title="Theme"
      description="System follows your device's light/dark setting automatically. Light and Dark override it."
      last={last}
    >
      <div className="grid max-w-sm grid-cols-3 gap-2">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = themePreference === value
          const [top, bottom] = THEME_SWATCH[value]
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
              <span className="flex h-6 w-full overflow-hidden rounded-md border border-line">
                <span className="flex-1" style={{ backgroundColor: top }} />
                <span className="flex-1" style={{ backgroundColor: bottom }} />
              </span>
              <Icon size={18} />
              {saving === value ? 'Saving…' : label}
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
}

// `headerAction` — Prompt 621: same timezone RPC/state, rendered with the
// Save button in the card header's top-right (closer Appearance tab)
// instead of below the field (non-closer General section, unchanged).
function TimezoneForm({ profile, headerAction = false, last = false }) {
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

  const description = 'Drives what "today" means everywhere in the app — Overview, My Goals, Stats, Activity, and My Calls all use this instead of server time.'
  const timezoneField = (
    <Field label="Timezone">
      <select className={inputClass()} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
        {SELECTABLE_TIMEZONES.map((tz) => (
          <option key={tz.value} value={tz.value}>{tz.label}</option>
        ))}
      </select>
    </Field>
  )
  const saveButton = (
    <Button type="submit" disabled={!dirty || saving}>
      {saving ? 'Saving…' : 'Save changes'}
    </Button>
  )

  if (headerAction) {
    return (
      <form onSubmit={save}>
        <SettingsSection title="Timezone" description={description} action={saveButton} last={last}>
          {timezoneField}
          {error && <p className="mt-3 font-sans text-sm text-danger">{error}</p>}
          {saved && <p className="mt-3 font-sans text-sm text-success">Saved</p>}
        </SettingsSection>
      </form>
    )
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="font-sans text-sm font-semibold text-fg-primary">Timezone</p>
      <p className="font-sans text-xs text-fg-secondary">{description}</p>
      {timezoneField}
      {error && <p className="font-sans text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        {saveButton}
        {saved && <span className="font-sans text-sm text-success">Saved</span>}
      </div>
    </form>
  )
}
