import { Link } from 'react-router-dom'
import { CheckCircle2, Loader2, X } from 'lucide-react'

// Prompt 649 — what the tab-capture recorder (lib/callRecorder) is doing,
// shown in two places: a one-line indicator in the call modal's header
// while the call runs (including "not recording" and why), and a banner on
// Meeting Room once the call closes and the recording is uploading /
// saved / failed.
const OFF_COPY = {
  declined: 'Not recording this call — tab sharing was declined.',
  no_tab_audio: 'Not recording this call — tab audio wasn’t shared, so the other side wouldn’t be heard.',
  no_mic: 'Not recording this call — the portal couldn’t use your microphone.',
  unsupported: 'Not recording this call — this browser can’t record calls. Use Chrome or Edge on a computer.',
  error: 'Not recording this call — the browser wouldn’t start the recording.',
}

export function RecordingIndicator({ state }) {
  if (!state) return null
  if (state.phase === 'requesting') {
    return <p className="font-sans text-xs text-fg-secondary">Choose “Share” to record this call…</p>
  }
  if (state.phase === 'recording') {
    return (
      <p className="flex items-center gap-1.5 font-sans text-xs font-medium text-danger">
        <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
        Recording
      </p>
    )
  }
  if (state.phase === 'stopped') {
    return <p className="font-sans text-xs text-fg-secondary">Recording stopped — what was recorded so far will be saved.</p>
  }
  if (state.phase === 'off') {
    return <p className="font-sans text-xs text-fg-secondary">{OFF_COPY[state.reason] || OFF_COPY.error}</p>
  }
  return null
}

export function RecordingSaveBanner({ state, onDismiss }) {
  if (!state) return null
  let body = null
  let tone = 'text-fg-secondary'
  if (state.phase === 'saving') {
    body = (
      <>
        <Loader2 size={15} className="animate-spin" />
        Saving the call recording — keep this tab open until it finishes.
      </>
    )
  } else if (state.phase === 'saved') {
    tone = 'text-success'
    body = (
      <>
        <CheckCircle2 size={15} />
        <span>
          Call recording saved to{' '}
          <Link to="/my-calls?tab=closer" className="underline underline-offset-2">My Recordings</Link>.
        </span>
      </>
    )
  } else if (state.phase === 'save_failed') {
    tone = 'text-danger'
    body = state.saved
      ? `Only part of the call recording saved (${state.failed} of ${state.saved + state.failed} parts failed): ${state.error}`
      : `Couldn’t save the call recording: ${state.error}`
  } else {
    return null
  }

  return (
    <div className={`mb-5 flex items-center justify-between gap-3 rounded-card border border-line bg-elevated px-4 py-3 font-sans text-sm ${tone}`}>
      <p className="flex items-center gap-2">{body}</p>
      {state.phase !== 'saving' && (
        <button onClick={onDismiss} className="text-fg-faint hover:text-fg-primary" aria-label="Dismiss">
          <X size={16} />
        </button>
      )}
    </div>
  )
}
