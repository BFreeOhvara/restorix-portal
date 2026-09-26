import { useEffect, useRef, useState } from 'react'
import Modal from './ui/Modal'
import { Button } from './ui/Button'
import { useZoomSdkSignature } from '../hooks/useZoom'
import { loadZoomEmbedded } from '../lib/loadZoomEmbedded'

// Prompt 618 — Phase 3 of bringing Zoom into the portal: the actual
// embedded call, via Zoom's Meeting SDK (`@zoom/meetingsdk/embedded`),
// dynamically imported so its bundle only loads when a closer actually
// opens a call, not on every page load. Shared by both of Meeting Room's
// join actions (Personal Meeting Room, booked-call Join) — each just
// passes its own meetingNumber/password/role in.
//
// `client.init()`/`client.join()` resolve (not reject) with a plain
// string on success but an `{type, reason}` object on failure per the
// installed SDK's own type defs — a bare try/catch around the await
// would silently treat a failed join as successful, so both calls are
// checked for that shape explicitly.
function isSdkFailure(result) {
  return result && typeof result === 'object' && 'reason' in result
}

// Prompt 649 — two optional, display-only props for the tab-capture
// recorder that runs alongside the call (the join/leave flow below is
// untouched): `onStatusChange` reports connecting/joined/ended/error so
// the recorder knows whether the call really connected, and
// `recordingIndicator` renders next to the status line.
export default function ZoomCallModal({ meetingNumber, password, displayName, onClose, onStatusChange, recordingIndicator }) {
  const [status, setStatus] = useState('connecting') // connecting | joined | ended | error
  const [errorMessage, setErrorMessage] = useState('')
  const rootRef = useRef(null)
  const clientRef = useRef(null)
  const embeddedRef = useRef(null)
  const signatureMutation = useZoomSdkSignature()

  useEffect(() => {
    onStatusChange?.(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report status changes only
  }, [status])

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!meetingNumber) {
        setStatus('error')
        setErrorMessage('No meeting number available for this call yet.')
        return
      }
      try {
        const signature = await signatureMutation.mutateAsync({ meetingNumber, role: 1 })
        if (cancelled) return

        // Prompt 633 — not `import('@zoom/meetingsdk/embedded')`: that build
        // runs on the app's React 19 and can't render. See loadZoomEmbedded.
        const ZoomMtgEmbedded = await loadZoomEmbedded()
        if (cancelled) return
        embeddedRef.current = ZoomMtgEmbedded

        const client = ZoomMtgEmbedded.createClient()
        clientRef.current = client

        const initResult = await client.init({
          zoomAppRoot: rootRef.current,
          language: 'en-US',
          patchJsMedia: true,
          leaveOnPageUnload: true,
        })
        if (cancelled) return
        if (isSdkFailure(initResult)) throw new Error(initResult.reason || 'Failed to initialize the Zoom SDK.')

        // Prompt 634 — must come after init(): the ES5 build only sets up
        // its supported-events list inside init(), so on() before it
        // throws "Cannot read properties of undefined (reading 'includes')".
        client.on('connection-change', (payload) => {
          if (payload?.state === 'Closed') setStatus((s) => (s === 'error' ? s : 'ended'))
        })

        const joinResult = await client.join({
          signature,
          meetingNumber: String(meetingNumber),
          password: password || '',
          userName: displayName || 'Restorix Closer',
        })
        if (cancelled) return
        if (isSdkFailure(joinResult)) throw new Error(joinResult.reason || 'Failed to join the meeting.')

        setStatus('joined')
      } catch (e) {
        // Prompt 634 — the UI only shows a one-line message, so keep the
        // full error (with stack) one devtools-open away. join() also
        // rejects with a plain {type, reason, errorCode} object, not an
        // Error, so fall back to its `reason`.
        console.error('ZoomCallModal:', e)
        if (!cancelled) {
          setStatus('error')
          setErrorMessage(e?.message || e?.reason || 'Could not connect to Zoom.')
        }
      }
    }

    run()

    return () => {
      cancelled = true
      const client = clientRef.current
      const embedded = embeddedRef.current
      if (!client) return
      // Prompt 635 — the embedded SDK carries state across createClient()
      // calls on the same page (devforum-acknowledged bug ZOOM-372963:
      // a second createClient() silently reuses the previous client's
      // internals). Reproduced in a local harness: without destroyClient()
      // here, a rejoin left the old client's event listeners still firing
      // and the join UI never rendered into zoomAppRoot — exactly Brayden's
      // "Connected but blank" symptom. Calling destroyClient() once the
      // leave settles fixed it across 3/3 harness rejoin cycles.
      client.leaveMeeting?.()
        .catch(() => {})
        .finally(() => {
          try {
            embedded?.destroyClient?.()
          } catch {
            // best-effort cleanup only
          }
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- join params are fixed for this modal's lifetime; re-running on signatureMutation identity would re-join needlessly
  }, [meetingNumber, password, displayName])

  function handleClose() {
    clientRef.current?.leaveMeeting?.().catch(() => {})
    onClose()
  }

  const statusLabel = {
    connecting: 'Connecting to Zoom…',
    joined: 'Connected',
    ended: 'Call ended',
    error: 'Could not connect',
  }[status]

  return (
    <Modal title="Meeting Room" onClose={handleClose} width="max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="font-sans text-xs text-fg-secondary">{statusLabel}</p>
          {recordingIndicator}
        </div>
        {/* Explicit, obvious exit — the SDK takes over most of the modal
            once joined, so the small header X alone isn't enough. */}
        <Button type="button" variant="secondary" onClick={handleClose} className="shrink-0 whitespace-nowrap">
          Leave Call
        </Button>
      </div>

      {status !== 'joined' && (
        <div className="mt-3 flex h-[70vh] items-center justify-center rounded-card border border-line bg-surface px-6 text-center">
          <p className={`font-sans text-sm ${status === 'error' ? 'text-danger' : 'text-fg-secondary'}`}>
            {status === 'error' ? errorMessage : statusLabel}
          </p>
        </div>
      )}
      <div
        ref={rootRef}
        className={status === 'joined' ? 'mt-3 h-[70vh] w-full overflow-hidden rounded-card' : 'h-0 w-0 overflow-hidden'}
      />
    </Modal>
  )
}
