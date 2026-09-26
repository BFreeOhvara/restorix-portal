import fixWebmDuration from 'fix-webm-duration'
import { supabase } from './supabase'

// Prompt 649 — records a closer's strategy call from their own browser
// tab instead of Zoom cloud recording (Brayden's Zoom is free Basic, which
// has none, and a join-as-participant bot was ruled out).
//
// Two audio sources, because tab capture only hears what the tab *plays*:
//   - tab audio (getDisplayMedia) = the lead's voice, rendered by the
//     embedded Zoom SDK;
//   - the closer's microphone (getUserMedia) = their own voice, which Zoom
//     sends out but never plays back locally, so tab capture can't hear it.
// Both are mixed in one Web Audio graph and recorded with the tab's video.
// A recording missing either side is never started.
//
// Size: the Supabase project is on the Free plan, whose global upload cap
// is 50MB per file. So the call is recorded in parts — a fresh
// MediaRecorder on the same stream every 15 minutes or ~40MB, whichever
// comes first — and each part is uploaded as soon as it's finished, one
// zoom_recordings row per part. Also means a closed tab loses at most the
// current part, not the whole call.
const SEGMENT_MS = 15 * 60 * 1000
const SEGMENT_MAX_BYTES = 40 * 1024 * 1024
const TIMESLICE_MS = 1000
const VIDEO_BPS = 300_000
const AUDIO_BPS = 64_000

export function canRecordCalls() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof window.AudioContext !== 'undefined'
  )
}

function pickMimeType() {
  // vp8 before vp9: cheaper to encode while the Zoom call itself is
  // already using the CPU.
  return ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) =>
    MediaRecorder.isTypeSupported(t)
  )
}

async function withRetry(fn) {
  try {
    return await fn()
  } catch {
    return fn()
  }
}

// Must be called synchronously from the Join click: browsers only allow
// getDisplayMedia (and an unmuted AudioContext) during a user gesture.
//
// onChange receives { phase, reason?, parts?, saved?, failed? }:
//   requesting → recording → (stopped) → saving → saved | save_failed
//   requesting → off (reason: declined | no_tab_audio | no_mic | unsupported | error)
//   … → discarded (the call never connected, nothing kept)
export function startCallRecording({ leadId, closerId, meetingNumber, onChange }) {
  const recordingId = crypto.randomUUID()
  let joined = false
  let stopped = false
  let current = null
  let partCounter = 0
  let display = null
  let mic = null
  let ctx = null
  const held = [] // finished parts waiting for the call to connect
  const uploads = []
  const finishing = [] // parts still flushing their last chunk
  let saved = 0
  let failed = 0
  let lastError = ''
  let state = { phase: 'requesting' }

  function emit(next) {
    state = next
    onChange?.(next)
  }

  function releaseDevices() {
    display?.getTracks().forEach((t) => t.stop())
    mic?.getTracks().forEach((t) => t.stop())
    ctx?.close().catch(() => {})
  }

  function turnOff(reason) {
    releaseDevices()
    if (!stopped) emit({ phase: 'off', reason })
  }

  function finishAndQueue(part) {
    finishing.push(finishPart(part).then((p) => (joined ? queueUpload(p) : held.push(p))))
  }

  if (!canRecordCalls()) {
    emit({ phase: 'off', reason: 'unsupported' })
    return { markJoined() {}, stop() {}, get state() { return state } }
  }

  emit({ phase: 'requesting' })

  // Both created inside the click, before any await.
  let displayPromise
  try {
    displayPromise = navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 15, max: 15 }, width: { max: 1920 }, height: { max: 1080 } },
      audio: { suppressLocalAudioPlayback: false },
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
      systemAudio: 'exclude',
      monitorTypeSurfaces: 'exclude',
    })
    ctx = new AudioContext()
  } catch {
    turnOff('error')
    return { markJoined() {}, stop() {}, get state() { return state } }
  }

  async function uploadPart(part) {
    const blob = await fixWebmDuration(new Blob(part.chunks, { type: 'video/webm' }), part.endedAt - part.startedAt, {
      logger: false,
    })
    part.chunks = []
    const path = `${closerId}/${leadId}/${recordingId}-part${part.number}.webm`
    const row = {
      lead_id: leadId,
      closer_id: closerId,
      zoom_meeting_id: String(meetingNumber),
      source: 'tab_capture',
      part_number: part.number,
      recorded_at: new Date(part.startedAt).toISOString(),
      duration_seconds: Math.max(1, Math.round((part.endedAt - part.startedAt) / 1000)),
      file_size: blob.size,
    }
    try {
      await withRetry(async () => {
        const { error } = await supabase.storage
          .from('call-recordings')
          .upload(path, blob, { contentType: 'video/webm', upsert: false })
        // A retry after a lost response can find the first attempt landed.
        if (error && !/exists|duplicate/i.test(error.message || '')) throw error
      })
    } catch (e) {
      lastError = e?.message || 'Upload failed'
      await supabase.from('zoom_recordings').insert({ ...row, status: 'failed', error: lastError })
      throw e
    }
    const { error } = await withRetry(() =>
      supabase.from('zoom_recordings').insert({ ...row, status: 'stored', storage_path: path })
    )
    if (error) {
      lastError = error.message
      throw error
    }
  }

  function queueUpload(part) {
    if (!part.chunks.length) return
    const p = uploadPart(part).then(
      () => { saved += 1 },
      (e) => {
        failed += 1
        console.error('callRecorder upload:', e)
      }
    )
    uploads.push(p)
  }

  function startPart(stream, mimeType) {
    const part = { number: ++partCounter, startedAt: Date.now(), chunks: [], bytes: 0 }
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BPS,
      audioBitsPerSecond: AUDIO_BPS,
    })
    part.recorder = recorder
    part.done = new Promise((resolve) => {
      recorder.onstop = resolve
    })
    recorder.ondataavailable = (e) => {
      if (!e.data?.size) return
      part.chunks.push(e.data)
      part.bytes += e.data.size
      if (part.bytes >= SEGMENT_MAX_BYTES && current === part && !stopped) rotate(stream, mimeType)
    }
    recorder.start(TIMESLICE_MS)
    part.timer = setTimeout(() => {
      if (current === part && !stopped) rotate(stream, mimeType)
    }, SEGMENT_MS)
    current = part
    return part
  }

  async function finishPart(part) {
    clearTimeout(part.timer)
    if (part.recorder.state !== 'inactive') part.recorder.stop()
    await part.done
    part.endedAt = Date.now()
    return part
  }

  // New part starts before the old one stops, so there's no gap.
  function rotate(stream, mimeType) {
    const old = current
    startPart(stream, mimeType)
    finishAndQueue(old)
  }

  const recording = displayPromise.then(
    async (stream) => {
      display = stream
      if (stopped) return releaseDevices()
      const [videoTrack] = stream.getVideoTracks()
      const [tabAudio] = stream.getAudioTracks()
      // No tab audio = the lead's side would be silent. Don't record.
      if (!videoTrack || !tabAudio) return turnOff('no_tab_audio')

      try {
        mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      } catch {
        return turnOff('no_mic')
      }
      if (stopped) return releaseDevices()

      if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
      const dest = ctx.createMediaStreamDestination()
      ctx.createMediaStreamSource(new MediaStream([tabAudio])).connect(dest)
      ctx.createMediaStreamSource(mic).connect(dest)
      const mixed = new MediaStream([videoTrack, ...dest.stream.getAudioTracks()])

      const mimeType = pickMimeType()
      if (!mimeType) return turnOff('unsupported')

      // The closer pressed the browser's own "Stop sharing" mid-call: keep
      // what was recorded, say so, stop there.
      videoTrack.addEventListener('ended', () => {
        if (stopped || state.phase !== 'recording') return
        emit({ phase: 'stopped' })
        const part = current
        current = null
        finishAndQueue(part)
        releaseDevices()
      })

      startPart(mixed, mimeType)
      emit({ phase: 'recording' })
    },
    (e) => {
      // NotAllowedError = the closer cancelled the share prompt.
      turnOff(e?.name === 'NotAllowedError' ? 'declined' : 'error')
    }
  )

  window.addEventListener('beforeunload', warnBeforeUnload)
  function warnBeforeUnload(e) {
    if (state.phase === 'recording' || state.phase === 'stopped' || state.phase === 'saving') {
      e.preventDefault()
      e.returnValue = ''
    }
  }

  return {
    get state() {
      return state
    },
    markJoined() {
      joined = true
      held.splice(0).forEach(queueUpload)
    },
    // keepIt = the call actually connected. A call that never joined
    // (SDK error, closed while connecting) is discarded, not uploaded.
    async stop({ keepIt }) {
      if (stopped) return
      stopped = true
      const keep = keepIt && joined
      await recording.catch(() => {})
      const wasRecording = state.phase === 'recording' || state.phase === 'stopped'
      if (!wasRecording) {
        window.removeEventListener('beforeunload', warnBeforeUnload)
        releaseDevices()
        return
      }
      const last = current ? await finishPart(current) : null
      current = null
      await Promise.all(finishing)
      releaseDevices()
      if (!keep) {
        held.length = 0
        window.removeEventListener('beforeunload', warnBeforeUnload)
        emit({ phase: 'discarded' })
        return
      }
      if (last) queueUpload(last)
      emit({ phase: 'saving', parts: partCounter })
      // Uploads queued by a rotation during stop() land in `uploads` too.
      for (let i = 0; i < uploads.length; i += 1) await uploads[i]
      window.removeEventListener('beforeunload', warnBeforeUnload)
      emit(
        failed
          ? { phase: 'save_failed', saved, failed, error: lastError }
          : { phase: 'saved', parts: saved }
      )
    },
  }
}
