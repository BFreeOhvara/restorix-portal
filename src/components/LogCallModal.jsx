import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import clsx from 'clsx'
import Modal from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { Button } from './ui/Button'
import { STATUS_SOLID, STATUS_TINT } from './ui/StatusBadge'
import { useLogCall } from '../hooks/useLeads'
import { useCreateCall, useUpdateCall } from '../hooks/useCalls'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const OUTCOMES = [
  { value: 'no_answer', label: 'No Answer' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'appointment_booked', label: 'Appointment Booked' },
]

function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtCallTime(total) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Click-to-call via Twilio Voice — mirrors ohvara-dashboard's CallModal
// pattern (browser Device + twilio-token/twilio-voice-webhook edge
// functions), trimmed to just dial/mute/hang-up since Restorix has no
// call-grading or recording pipeline to feed. Falls back to a tel: link
// if the Twilio Device never registers (not configured, or offline).
// `onAttempt` (Prompt 446) fires the moment a real dial actually goes out —
// either path counts, since the point is proving a call was placed through
// the system, not requiring it to connect (No Answer is a valid outcome
// after a real attempt). `onCallSid` (Prompt 447) reports the Twilio
// CallSid once a real (non-tel:) call connects, so the calls row created
// on attempt can be correlated to its recording later.
// `onCallConcluded` (Prompt 520) reports the real moment a call is over —
// via the Twilio Voice SDK's own `disconnect`/`cancel`/`error` events on
// the live call object, not a timer. Investigated first, per the prompt's
// own explicit instruction, before building anything: this component
// already has a genuine live signal for the Twilio-Device path (the SDK
// fires real WebRTC call-state events in the browser the instant the
// underlying call actually ends — a stronger signal than a server
// webhook round-trip would even be). The tel: fallback path (Twilio
// Device never registered) has zero programmatic feedback once the OS
// phone app takes over — no event, no polling target, nothing to gate
// on — so it deliberately is NOT given the stricter gate; see the
// `onClick` on the tel: `<a>` below and Prompt 520's own CURRENT STATE
// entry for the full reasoning, flagged rather than faked.
function CallSection({ lead, onAttempt, onCallSid, onCallConcluded }) {
  const [deviceReady, setDeviceReady] = useState(false)
  const [callState, setCallState] = useState('idle')
  const [muted, setMuted] = useState(false)
  const [callSeconds, setCallSeconds] = useState(0)
  const deviceRef = useRef(null)
  const callRef = useRef(null)
  const hasConnectedRef = useRef(false)

  // Fires exactly once per real call cycle, the instant it's genuinely
  // over — only after having actually reached 'connecting'/'in-call' at
  // least once, so the initial mount (idle) can't spuriously conclude a
  // call that was never placed.
  useEffect(() => {
    if (callState === 'connecting' || callState === 'in-call') hasConnectedRef.current = true
    if (hasConnectedRef.current && (callState === 'idle' || callState === 'error')) {
      onCallConcluded?.()
    }
  }, [callState, onCallConcluded])

  useEffect(() => {
    let cancelled = false
    let device = null
    async function init() {
      try {
        const { Device } = await import('@twilio/voice-sdk')
        const { data, error } = await supabase.functions.invoke('twilio-token')
        if (error || !data?.token) return
        if (cancelled) return
        device = new Device(data.token, { codecPreferences: ['opus', 'pcmu'] })
        device.on('registered', () => { if (!cancelled) setDeviceReady(true) })
        device.on('error', (e) => {
          console.error('[Twilio Device] error:', e?.message || e?.code || e)
          if (!cancelled) setCallState((prev) => (prev !== 'idle' ? 'error' : prev))
        })
        deviceRef.current = device
        device.register()
      } catch (e) {
        console.error('[twilio-token] failed:', e)
      }
    }
    init()
    return () => {
      cancelled = true
      try { callRef.current?.disconnect() } catch { /* already gone */ }
      try { device?.destroy() } catch { /* already gone */ }
    }
  }, [lead.id])

  useEffect(() => {
    if (callState !== 'in-call') return
    const t = setInterval(() => setCallSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [callState])

  async function startCall() {
    const device = deviceRef.current
    if (!device || !lead.phone) return
    onAttempt()
    setMuted(false)
    setCallSeconds(0)
    setCallState('connecting')
    try {
      const call = await device.connect({ params: { To: lead.phone } })
      callRef.current = call
      call.on('accept', () => {
        setCallState('in-call')
        onCallSid?.(call.parameters?.CallSid || null)
      })
      call.on('disconnect', () => { callRef.current = null; setMuted(false); setCallState('idle') })
      call.on('cancel', () => { callRef.current = null; setCallState('idle') })
      call.on('error', (e) => { console.error('[Twilio call] error:', e?.message || e); callRef.current = null; setCallState('error') })
    } catch (e) {
      console.error('[Twilio startCall] failed:', e?.message || e)
      setCallState('error')
    }
  }

  function toggleMute() {
    const call = callRef.current
    if (!call) return
    const next = !muted
    call.mute(next)
    setMuted(next)
  }

  function hangUp() {
    try { callRef.current?.disconnect() } catch { /* disconnect handler resets state */ }
  }

  const telHref = lead.phone ? `tel:${lead.phone.replace(/\D/g, '')}` : null
  if (!telHref) {
    return (
      <div className="flex h-11 items-center justify-center rounded-lg border border-line bg-base font-sans text-sm text-fg-faint">
        No phone number on file
      </div>
    )
  }

  if (callState === 'in-call') {
    return (
      <div className="space-y-2">
        <div className="flex h-10 items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/10 font-sans text-sm font-medium text-success">
          <span className="h-2 w-2 rounded-full bg-success" />
          Connected · <span className="font-mono">{fmtCallTime(callSeconds)}</span>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={toggleMute}>
            {muted ? <MicOff size={14} /> : <Mic size={14} />} {muted ? 'Unmute' : 'Mute'}
          </Button>
          <Button type="button" variant="danger" className="flex-1" onClick={hangUp}>
            <PhoneOff size={14} /> Hang Up
          </Button>
        </div>
      </div>
    )
  }

  if (callState === 'connecting') {
    return (
      <Button type="button" variant="secondary" className="w-full" disabled>
        Connecting…
      </Button>
    )
  }

  if (deviceReady) {
    return (
      <div>
        <Button type="button" className="w-full" onClick={startCall}>
          <Phone size={14} /> Call {lead.phone}
        </Button>
        {callState === 'error' && (
          <p className="mt-1.5 text-center font-sans text-xs text-danger">
            Call failed — try again, or use <a href={telHref} className="text-accent underline">your phone</a>.
          </p>
        )}
      </div>
    )
  }

  return (
    <a
      href={telHref}
      // Prompt 520: the Twilio Device never registered, so this hands off
      // to the OS's own phone app with zero way for the browser to know
      // if or when that call ends — no event, nothing to poll. Genuinely
      // no real signal exists here (confirmed by investigation, not
      // assumed), so this path deliberately does NOT get the stricter
      // Save gate other than what already existed (fires both callbacks
      // together, same as before this prompt) rather than leaving Save
      // permanently locked with nothing that could ever unlock it.
      onClick={() => { onAttempt(); onCallConcluded?.() }}
      className="flex h-11 items-center justify-center gap-2 rounded-full bg-accent font-sans text-sm font-semibold text-white"
    >
      <Phone size={14} /> Call {lead.phone}
    </a>
  )
}

export default function LogCallModal({ lead, onClose }) {
  const { profile } = useAuth()
  const [outcome, setOutcome] = useState('')
  // Always starts blank (Prompt 442) — this is a note for *this* call, not
  // an editor for whatever's already stored on the lead from a prior one.
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState(toLocalInputValue(new Date()))
  // Prompt 446: outcomes are gated behind an actual dial attempt, so nobody
  // can log "No Answer" without ever having called. Starts already unlocked
  // when there's no phone number at all — there's nothing to attempt, so
  // gating would just brick the modal for a data-quality problem the setter
  // didn't cause.
  const [hasAttempted, setHasAttempted] = useState(!lead.phone)
  // Prompt 520 — separate from `hasAttempted` above: that gate unlocks
  // the OUTCOME buttons the instant a dial goes out (so a setter can
  // pre-select a likely outcome and type notes live during the call,
  // explicitly still wanted per this prompt's own preamble); this one
  // gates SAVE specifically, and only unlocks once CallSection reports
  // the call has actually ended (real Twilio Voice SDK call-state
  // events — see CallSection's own comment for why, and why the tel:
  // fallback path is deliberately exempted rather than permanently
  // locking Save with no way to ever unlock it).
  const [callConcluded, setCallConcluded] = useState(!lead.phone)
  const logCall = useLogCall()
  const createCall = useCreateCall()
  const updateCall = useUpdateCall()
  // Prompt 447: My Calls' one row per real dial attempt, created the
  // moment the attempt fires (same signal 446 gates outcomes on) rather
  // than at Save time, since Save might happen much later or the setter
  // might close the modal without ever picking an outcome.
  const [callRowId, setCallRowId] = useState(null)
  const attemptedAtRef = useRef(null)

  function handleAttempt() {
    if (hasAttempted) return
    setHasAttempted(true)
    attemptedAtRef.current = Date.now()
    createCall.mutate(
      { leadId: lead.id, setterId: profile.id },
      { onSuccess: (row) => setCallRowId(row.id) }
    )
  }

  function handleCallSid(sid) {
    if (callRowId && sid) updateCall.mutate({ id: callRowId, patch: { twilio_call_sid: sid } })
  }

  // Prompt 515 Part 3 — was an unguarded `await ... mutateAsync(...)` with no
  // try/catch: a failed save (any cause — RLS, a network blip, a future
  // constraint violation) threw past `onClose()`, so the modal just sat
  // there looking stuck with nothing telling the setter it didn't save.
  // Found this live: a real pre-existing `follow_up_queue` RLS gap
  // (`handle_lead_pipeline` isn't SECURITY DEFINER, unlike every other
  // pipeline function — flagged separately for a DDL fix) currently makes
  // every Follow-up save fail this exact way. This fix doesn't touch that
  // root cause, but no save should ever fail silently regardless of cause.
  async function handleSubmit(e) {
    e.preventDefault()
    if (!outcome) return

    const patch = { status: outcome, notes }
    if (outcome === 'follow_up') patch.follow_up_at = new Date(when).toISOString()
    if (outcome === 'appointment_booked') patch.strategy_call_at = new Date(when).toISOString()

    try {
      await logCall.mutateAsync({ id: lead.id, ...patch })
    } catch {
      return
    }

    if (callRowId) {
      const duration_seconds = attemptedAtRef.current
        ? Math.round((Date.now() - attemptedAtRef.current) / 1000)
        : null
      updateCall.mutate({ id: callRowId, patch: { outcome, duration_seconds } })
    }

    onClose()
  }

  return (
    <Modal title={`Log call — ${lead.facility_name}`} onClose={onClose} width="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <CallSection
          lead={lead}
          onAttempt={handleAttempt}
          onCallSid={handleCallSid}
          onCallConcluded={() => setCallConcluded(true)}
        />

        <Field label="Outcome">
          {!hasAttempted && (
            <p className="mb-2 font-sans text-xs text-fg-faint">Call the lead to unlock outcomes.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {OUTCOMES.map((o) => (
              <button
                type="button"
                key={o.value}
                disabled={!hasAttempted}
                onClick={() => setOutcome(o.value)}
                className={clsx(
                  'rounded-lg px-3 py-2 font-sans text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  outcome === o.value ? STATUS_SOLID[o.value] : clsx(STATUS_TINT[o.value], hasAttempted && 'hover:opacity-85')
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        {outcome === 'follow_up' && (
          <Field label="Follow-up date & time">
            <input
              type="datetime-local"
              className={inputClass()}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </Field>
        )}

        {outcome === 'appointment_booked' && (
          <Field label="Strategy call date & time">
            <input
              type="datetime-local"
              className={inputClass()}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </Field>
        )}

        <Field label="Notes">
          <textarea
            className={inputClass()}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened on the call…"
          />
        </Field>

        {outcome && !callConcluded && (
          <p className="font-sans text-xs text-fg-faint">Save unlocks once the call actually ends.</p>
        )}

        {logCall.isError && (
          <p className="font-sans text-sm text-danger">
            Couldn't save: {logCall.error?.message || 'something went wrong. Try again.'}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!outcome || !callConcluded || logCall.isPending}>
            {logCall.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
