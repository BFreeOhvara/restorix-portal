// ============================================================
// zoom-recording-webhook — Zoom calls this when a cloud recording of a
// closer's strategy call has finished processing.
//
// create-zoom-meeting (Prompt 647) creates every strategy call with
// settings.auto_recording = 'cloud', so Zoom records it once it starts.
// When the recording is ready Zoom sends `recording.completed`; this
// copies each MP4 file into the private `call-recordings` Storage bucket
// and writes a zoom_recordings row matched to the lead that owns the
// meeting (leads.zoom_meeting_id, set by create-zoom-meeting).
//
// Recordings of any other meeting the closer's Zoom account hosts (their
// personal meetings) arrive on this webhook too — they match no lead and
// are ignored, never copied.
//
// Public (Zoom itself hits this, no user JWT) — every event's
// x-zm-signature header is verified against the webhook secret token
// instead. Also answers Zoom's one-time endpoint.url_validation
// handshake when the URL is first saved in Zoom Marketplace.
//
// Deploy WITHOUT jwt verification:
//   supabase functions deploy zoom-recording-webhook --no-verify-jwt --project-ref avgvmzshujwphneykuvu
//
// Zoom app's event notification endpoint URL:
//   https://avgvmzshujwphneykuvu.supabase.co/functions/v1/zoom-recording-webhook
//
// Required Supabase secrets:
//   ZOOM_WEBHOOK_SECRET_TOKEN — the app's "Secret Token" (Zoom
//     Marketplace → app → Features → Access / Event Subscriptions)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const BUCKET = 'call-recordings'
// Reject signed requests older than this, so a captured request can't be
// replayed later.
const MAX_SKEW_SECONDS = 5 * 60

const jsonHeaders = { 'Content-Type': 'application/json' }

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifySignature(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const signature = req.headers.get('x-zm-signature')
  const timestamp = req.headers.get('x-zm-request-timestamp')
  if (!signature || !timestamp) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) return false
  const expected = 'v0=' + await hmacHex(secret, `v0:${timestamp}:${rawBody}`)
  return timingSafeEqual(expected, signature)
}

// Zoom's docs allow the download_token either as a Bearer header or as
// an access_token query param — try the header first, fall back to the
// query param if Zoom rejects it.
async function downloadRecording(downloadUrl: string, downloadToken: string): Promise<Response> {
  const resp = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${downloadToken}` } })
  if (resp.ok || (resp.status !== 401 && resp.status !== 403)) return resp
  await resp.body?.cancel()
  const url = new URL(downloadUrl)
  url.searchParams.set('access_token', downloadToken)
  return fetch(url.toString())
}

async function storeRecordingFile(adminClient, file, ctx) {
  const { lead, meetingId, meetingUuid, downloadToken } = ctx

  // Idempotent — Zoom retries deliveries it thinks failed, and a file
  // already stored should never be copied twice.
  const { data: existing } = await adminClient
    .from('zoom_recordings')
    .select('id, status')
    .eq('zoom_file_id', file.id)
    .maybeSingle()
  if (existing?.status === 'stored') return

  const start = file.recording_start ? new Date(file.recording_start) : null
  const end = file.recording_end ? new Date(file.recording_end) : null
  const durationSeconds = start && end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000)) : null
  const storagePath = `${lead.assigned_closer || 'unassigned'}/${lead.id}/${file.id}.mp4`

  const { data: row, error: rowError } = await adminClient
    .from('zoom_recordings')
    .upsert({
      zoom_file_id: file.id,
      lead_id: lead.id,
      closer_id: lead.assigned_closer,
      zoom_meeting_id: meetingId,
      zoom_meeting_uuid: meetingUuid,
      file_size: file.file_size ?? null,
      duration_seconds: durationSeconds,
      recorded_at: file.recording_start || null,
      status: 'processing',
      error: null,
    }, { onConflict: 'zoom_file_id' })
    .select('id')
    .single()
  if (rowError) throw new Error(`recording row upsert failed: ${rowError.message}`)

  try {
    const download = await downloadRecording(file.download_url, downloadToken)
    if (!download.ok || !download.body) {
      throw new Error(`download failed: ${download.status} ${await download.text().catch(() => '')}`)
    }

    // Streamed straight from Zoom into Storage — a strategy call MP4 can
    // be hundreds of MB, far more than an edge function should buffer.
    const upload = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/${BUCKET}/${storagePath}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'video/mp4',
          'x-upsert': 'true',
        },
        body: download.body,
        // @ts-ignore — Deno's fetch needs this for a streamed request body
        duplex: 'half',
      },
    )
    if (!upload.ok) throw new Error(`storage upload failed: ${upload.status} ${await upload.text().catch(() => '')}`)

    await adminClient
      .from('zoom_recordings')
      .update({ storage_path: storagePath, status: 'stored', error: null })
      .eq('id', row.id)
  } catch (e) {
    const message = String(e?.message || e).slice(0, 1000)
    console.error('[zoom-recording-webhook] file', file.id, 'failed:', message)
    await adminClient
      .from('zoom_recordings')
      .update({ status: 'failed', error: message })
      .eq('id', row.id)
  }
}

async function handleRecordingCompleted(body) {
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const object = body?.payload?.object
  const downloadToken = body?.download_token
  if (!object?.id || !downloadToken) {
    console.error('[zoom-recording-webhook] recording.completed missing object.id or download_token')
    return
  }
  const meetingId = String(object.id)

  const { data: lead } = await adminClient
    .from('leads')
    .select('id, assigned_closer')
    .eq('zoom_meeting_id', meetingId)
    .maybeSingle()
  if (!lead) {
    // Not a Restorix strategy call — one of the closer's own meetings.
    console.log('[zoom-recording-webhook] no lead for meeting', meetingId, '— ignored')
    return
  }

  // Video only for now (Prompt 647) — chat logs, audio-only M4A,
  // transcripts and timelines are skipped.
  const videoFiles = (object.recording_files || []).filter(
    (f) => f?.file_type === 'MP4' && f?.download_url && f?.id,
  )
  for (const file of videoFiles) {
    await storeRecordingFile(adminClient, file, {
      lead,
      meetingId,
      meetingUuid: object.uuid || null,
      downloadToken,
    })
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders })
  }

  const secret = Deno.env.get('ZOOM_WEBHOOK_SECRET_TOKEN')
  if (!secret) {
    console.error('[zoom-recording-webhook] ZOOM_WEBHOOK_SECRET_TOKEN not set')
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), { status: 503, headers: jsonHeaders })
  }

  const rawBody = await req.text()
  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: jsonHeaders })
  }

  // One-time handshake when the endpoint URL is saved/validated in Zoom
  // Marketplace — must answer within 3 seconds. Only echoes an HMAC of
  // Zoom's own token, so it leaks nothing to an unsigned caller.
  if (body?.event === 'endpoint.url_validation') {
    const plainToken = body?.payload?.plainToken
    if (!plainToken) {
      return new Response(JSON.stringify({ error: 'Missing plainToken' }), { status: 400, headers: jsonHeaders })
    }
    return new Response(JSON.stringify({
      plainToken,
      encryptedToken: await hmacHex(secret, plainToken),
    }), { headers: jsonHeaders })
  }

  if (!await verifySignature(req, rawBody, secret)) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: jsonHeaders })
  }

  if (body?.event === 'recording.completed') {
    // Zoom expects a 2xx within 3 seconds or it retries; copying the file
    // takes far longer, so it runs after the response goes out.
    const work = handleRecordingCompleted(body).catch((e) => {
      console.error('[zoom-recording-webhook] recording.completed failed:', e?.message || e)
    })
    // @ts-ignore — EdgeRuntime is a Supabase Edge Runtime global
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work)
    else await work
  }

  return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders })
})
