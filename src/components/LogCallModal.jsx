import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Phone, PhoneOff, Video, Copy, CheckCircle2, Loader2, Clock } from 'lucide-react'
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
//
// Prompt 522 — Brayden found this gate could be WRONG: the browser-side
// leg disconnected while his real phone call was still live, meaning
// `call.on('disconnect')` had already fired (and Save had unlocked)
// before the real call was actually over. Root-caused via the SDK's own
// docs, not guessed: `maxCallSignalingTimeoutMs` — the option that
// enables Signaling Reconnection (an SDK feature added specifically for
// "the websocket blipped but the call itself is still bridging") —
// defaults to `0` when omitted, which Twilio's own docs state plainly:
// "the default value of 0 means signaling reconnection may not occur."
// This Device was never passing that option, so a transient signaling
// hiccup (common on a real home/mobile network, exactly Brayden's test
// conditions) skipped straight to a hard client-side disconnect with no
// recovery attempt — even though Twilio's servers don't necessarily tear
// down the actual bridged call until that same window would have
// elapsed, which is exactly why his phone stayed live after the
// dashboard didn't. Fix: opt in with `maxCallSignalingTimeoutMs: 30000`
// (Twilio's own documented max reconnection window) and add a real
// `reconnecting`/`reconnected` state so a transient blip shows
// "Reconnecting…" instead of either silently doing nothing or (as
// before) misreporting itself as fully disconnected. `reconnecting` is
// deliberately its own `callState`, distinct from `idle`/`error` — the
// conclusion effect below only fires on those two, so a reconnect
// attempt can never prematurely unlock Save.
function CallSection({ lead, onAttempt, onCallSid, onCallConcluded }) {
  // Prompt 522 — was a single `deviceReady` boolean that started `false`
  // and the render logic fell straight to the tel: fallback whenever it
  // was still false, with zero distinction between "registration is
  // still in flight" and "registration definitively will not happen."
  // `device.register()` is async (a real WebSocket handshake) and this
  // component mounts a brand-new Device from scratch on every single
  // modal open — so a normal-speed registration that just hadn't
  // finished yet by the time this rendered was indistinguishable from a
  // real failure, and silently fell back to the zero-feedback tel: path.
  // This is Brayden's own reported "first attempt fell back to tel:,
  // very next attempt on the same page worked" — consistent with a pure
  // timing race, not an actual intermittent failure. `deviceStatus`
  // replaces the boolean with a real 3-state model: 'connecting' shows a
  // real loading affordance instead of jumping to the degraded path,
  // 'ready' is the old `deviceReady === true`, 'unavailable' is a
  // genuine registration error OR an 8s timeout (so a hang can't leave
  // the setter stuck on a spinner forever) — only 'unavailable' falls
  // back to tel:.
  const [deviceStatus, setDeviceStatus] = useState('connecting')
  const [callState, setCallState] = useState('idle')
  const [muted, setMuted] = useState(false)
  const [callSeconds, setCallSeconds] = useState(0)
  const deviceRef = useRef(null)
  const callRef = useRef(null)
  const hasConnectedRef = useRef(false)
  // Prompt 524 — real STUN/TURN credentials from twilio-token's new NTS
  // fetch, needed at connect() time (see rtcConfiguration below) but
  // only available from the async init() effect — a ref survives that
  // gap without forcing a re-render.
  const iceServersRef = useRef(null)

  // Fires exactly once per real call cycle, the instant it's genuinely
  // over — only after having actually reached 'connecting'/'in-call' at
  // least once, so the initial mount (idle) can't spuriously conclude a
  // call that was never placed. 'reconnecting' is deliberately excluded
  // here (see the component-level comment above) — only a real 'idle'
  // (clean disconnect/cancel) or 'error' concludes the call.
  useEffect(() => {
    if (callState === 'connecting' || callState === 'in-call' || callState === 'reconnecting') hasConnectedRef.current = true
    if (hasConnectedRef.current && (callState === 'idle' || callState === 'error')) {
      onCallConcluded?.()
    }
  }, [callState, onCallConcluded])

  useEffect(() => {
    let cancelled = false
    let device = null
    let registrationTimeout = null
    async function init() {
      try {
        const { Device } = await import('@twilio/voice-sdk')
        const { data, error } = await supabase.functions.invoke('twilio-token')
        if (error || !data?.token) {
          if (!cancelled) setDeviceStatus('unavailable')
          return
        }
        if (cancelled) return
        iceServersRef.current = Array.isArray(data.iceServers) && data.iceServers.length ? data.iceServers : null
        if (!iceServersRef.current) {
          console.warn('[twilio-token] no ICE servers returned — call will attempt host-only candidates, likely to fail on most real networks')
        }
        // Prompt 522: `maxCallSignalingTimeoutMs` opts into Signaling
        // Reconnection — without it (default 0), a transient websocket
        // blip skips straight to a hard disconnect with no recovery
        // attempt. 30000 is Twilio's own documented max reconnection
        // window (docs.twilio.com/voice/sdks/javascript/edges).
        device = new Device(data.token, { codecPreferences: ['opus', 'pcmu'], maxCallSignalingTimeoutMs: 30000 })
        device.on('registered', () => {
          if (cancelled) return
          clearTimeout(registrationTimeout)
          setDeviceStatus('ready')
        })
        device.on('error', (e) => {
          // Prompt 523: log the numeric Twilio error code alongside the
          // message — code alone (e.g. 53405 = Media.ConnectionError,
          // the documented ICE/media-connection-failed class) is what
          // actually distinguishes a signaling issue from a media/ICE
          // issue; message text alone doesn't reliably do that.
          console.error('[Twilio Device] error:', { code: e?.code, message: e?.message, causes: e?.causes, solutions: e?.solutions } , e)
          if (cancelled) return
          setCallState((prev) => (prev !== 'idle' ? 'error' : prev))
          setDeviceStatus((prev) => (prev === 'ready' ? prev : 'unavailable'))
        })
        deviceRef.current = device
        device.register()
        // A registration that never resolves (network issue that isn't a
        // clean error, a misconfigured account, etc.) would otherwise
        // leave `deviceStatus` at 'connecting' forever — fall back after
        // a real timeout rather than spin indefinitely.
        registrationTimeout = setTimeout(() => {
          if (!cancelled) setDeviceStatus((prev) => (prev === 'connecting' ? 'unavailable' : prev))
        }, 8000)
      } catch (e) {
        console.error('[twilio-token] failed:', e)
        if (!cancelled) setDeviceStatus('unavailable')
      }
    }
    init()
    return () => {
      cancelled = true
      clearTimeout(registrationTimeout)
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
      // Prompt 524: rtcConfiguration is a per-connect() option, not a
      // Device-constructor one (confirmed in the SDK's own device.ts —
      // Call.Options.rtcConfiguration there reads from connect()'s own
      // argument, never from the Device's own options) — has to be
      // passed here, every call, not just once at Device construction.
      const rtcConfiguration = iceServersRef.current ? { iceServers: iceServersRef.current } : undefined
      const call = await device.connect({ params: { To: lead.phone }, rtcConfiguration })
      callRef.current = call
      call.on('accept', () => {
        setCallState('in-call')
        onCallSid?.(call.parameters?.CallSid || null)
      })
      call.on('disconnect', () => { callRef.current = null; setMuted(false); setCallState('idle') })
      call.on('cancel', () => { callRef.current = null; setCallState('idle') })
      // Prompt 523: same reasoning as the Device-level handler above —
      // capture `code` explicitly so a real repro's console output can
      // confirm whether this is a 53405-range media/ICE failure (per
      // Twilio's own @twilio/voice-errors data: 53=WebRTC, 4=Media,
      // 5=ConnectionError, "Media connection failed") vs. a 31xxx
      // signaling-class error, instead of guessing from message text.
      call.on('error', (e) => {
        console.error('[Twilio call] error:', { code: e?.code, message: e?.message, causes: e?.causes, solutions: e?.solutions }, e)
        callRef.current = null
        setCallState('error')
      })
      // Prompt 522: the actual fix — a lost signaling/media connection
      // now shows as 'reconnecting' (SDK attempts real ICE/signaling
      // recovery for up to 30s, per maxCallSignalingTimeoutMs above)
      // instead of the SDK either doing nothing or (pre-fix) jumping
      // straight to a misleading 'disconnect'.
      call.on('reconnecting', (twilioError) => {
        console.warn('[Twilio call] reconnecting:', twilioError?.message || twilioError)
        setCallState('reconnecting')
      })
      call.on('reconnected', () => setCallState('in-call'))
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

  // Prompt 522 — a real, distinct state: the call isn't over, the SDK is
  // actively trying to recover a lost signaling/media connection (up to
  // 30s). Deliberately NOT treated as 'in-call' (the timer/mute/hangup
  // panel would be misleading while audio may not be flowing) and NOT
  // treated as concluded (see the conclusion effect above) — Hang Up
  // stays available in case the setter wants to give up on the recovery
  // attempt rather than wait it out.
  if (callState === 'reconnecting') {
    return (
      <div className="space-y-2">
        <div className="flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-muted font-sans text-sm font-medium text-fg-secondary">
          <span className="h-2 w-2 animate-pulse rounded-full bg-fg-faint" />
          Reconnecting…
        </div>
        <Button type="button" variant="danger" className="w-full" onClick={hangUp}>
          <PhoneOff size={14} /> Hang Up
        </Button>
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

  if (deviceStatus === 'connecting') {
    return (
      <Button type="button" variant="secondary" className="w-full" disabled>
        Connecting to dialer…
      </Button>
    )
  }

  if (deviceStatus === 'ready') {
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
  // Prompt 525 — root cause of "My Recordings" showing "No recording" for
  // real, successfully-connected calls: `handleCallSid` closed over
  // `callRowId` state, but `call.on('accept', ...)` (which fires
  // `onCallSid`) gets registered synchronously right after
  // `device.connect()` resolves — essentially immediately after
  // `onAttempt()` — while `createCall.mutate`'s INSERT round-trip that
  // sets `callRowId` is still in flight. That closure captures whatever
  // `callRowId` was at click time, which is always still `null` at that
  // point, so the CallSid write silently no-op'd on every real call —
  // invisible before Prompt 524's ICE fix, since calls almost never
  // reached 'accept' at all. `twilio_call_sid` is exactly what the
  // deployed `twilio-voice-webhook`'s recording-status-callback
  // correlates a finished recording back to a `calls` row by (confirmed
  // via the real deployed function source, not the stale local file) —
  // with it never written, a recording Twilio genuinely captured could
  // never be matched to the row that shows it. `callRowIdRef` plus a
  // pending-SID buffer makes this correct regardless of which side of
  // the race resolves first.
  const callRowIdRef = useRef(null)
  const pendingCallSidRef = useRef(null)
  // Prompt 530 — Appointment Booked creates a real Zoom meeting on save
  // (per Prompt 529's confirmed design), not a manual follow-up step.
  // 'idle' | 'creating' | 'done'; zoomResult is { join_url } | { pending: true } | { error }.
  const [zoomState, setZoomState] = useState('idle')
  const [zoomResult, setZoomResult] = useState(null)

  function handleAttempt() {
    if (hasAttempted) return
    setHasAttempted(true)
    attemptedAtRef.current = Date.now()
    createCall.mutate(
      { leadId: lead.id, setterId: profile.id },
      { onSuccess: (row) => {
          callRowIdRef.current = row.id
          setCallRowId(row.id)
          if (pendingCallSidRef.current) {
            updateCall.mutate({ id: row.id, patch: { twilio_call_sid: pendingCallSidRef.current } })
            pendingCallSidRef.current = null
          }
        } }
    )
  }

  function handleCallSid(sid) {
    if (!sid) return
    if (callRowIdRef.current) {
      updateCall.mutate({ id: callRowIdRef.current, patch: { twilio_call_sid: sid } })
    } else {
      pendingCallSidRef.current = sid
    }
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

    // Prompt 530 — real external API call (Zoom), so this can't be
    // instant; show a result screen instead of closing immediately so
    // the setter actually sees the join link (or the "pending" state)
    // before the modal goes away, matching Brayden's own "leave the call
    // with something" framing from Prompt 529.
    if (outcome === 'appointment_booked') {
      setZoomState('creating')
      try {
        const { data, error } = await supabase.functions.invoke('create-zoom-meeting', {
          body: { leadId: lead.id },
        })
        if (error) throw error
        setZoomResult(data)
      } catch (err) {
        setZoomResult({ error: err.message || 'Something went wrong creating the Zoom meeting.' })
      }
      setZoomState('done')
      return
    }

    onClose()
  }

  if (zoomState !== 'idle') {
    return (
      <Modal title={`Log call — ${lead.facility_name}`} onClose={onClose} width="max-w-xl">
        <ZoomResultView state={zoomState} result={zoomResult} onDone={onClose} />
      </Modal>
    )
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

// Prompt 530 — shown after an Appointment Booked save while
// create-zoom-meeting runs, then either the real join link (Brayden's
// own "leave the call with something" framing from Prompt 529) or the
// Fork-1 pending state if the closer hasn't connected Zoom yet.
function ZoomResultView({ state, result, onDone }) {
  const [copied, setCopied] = useState(false)

  function copyLink() {
    if (!result?.join_url) return
    navigator.clipboard.writeText(result.join_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <p className="font-sans text-sm text-success">Outcome saved.</p>

      {state === 'creating' && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-secondary">
          <Loader2 size={16} className="animate-spin" />
          Creating Zoom meeting…
        </div>
      )}

      {state === 'done' && result?.join_url && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="flex items-center gap-2 font-sans text-sm font-semibold text-fg-primary">
            <Video size={16} className="text-accent" /> Zoom meeting created
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly className={inputClass('flex-1 truncate')} value={result.join_url} />
            <Button type="button" variant="secondary" onClick={copyLink} className="!px-3">
              {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
            </Button>
          </div>
        </div>
      )}

      {state === 'done' && result?.pending && (
        <div className="flex items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 font-sans text-sm text-fg-secondary">
          <Clock size={16} className="mt-0.5 flex-shrink-0 text-fg-faint" />
          Zoom link pending — the assigned closer hasn't connected their Zoom account yet. The meeting will
          be created automatically once they do.
        </div>
      )}

      {state === 'done' && result?.error && (
        <p className="font-sans text-sm text-danger">{result.error}</p>
      )}

      <div className="flex justify-end pt-2">
        <Button type="button" onClick={onDone} disabled={state === 'creating'}>
          Done
        </Button>
      </div>
    </div>
  )
}
