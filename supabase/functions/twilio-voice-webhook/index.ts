// ============================================================
// twilio-voice-webhook — TwiML for the browser WebRTC call
//
// The TwiML App (TWILIO_TWIML_APP_SID) points its Voice URL here.
// When the setter/closer's browser Device calls device.connect({ params:{ To } }),
// Twilio POSTs here; we return TwiML that dials the lead from Restorix's
// Twilio number, with recording enabled (Prompt 447 — see below).
//
// Deploy WITHOUT jwt verification (Twilio calls this directly, no auth):
//   supabase functions deploy twilio-voice-webhook --no-verify-jwt --project-ref avgvmzshujwphneykuvu
//
// TwiML App Voice URL (set in Twilio console):
//   https://avgvmzshujwphneykuvu.supabase.co/functions/v1/twilio-voice-webhook
//
// Required Supabase secrets:
//   TWILIO_PHONE_NUMBER — the callerId shown to the lead (e.g. +12345678900)
//
// Prompt 525 — this file had drifted from the real deployed function: the
// recording pipeline below (Prompt 447) was deployed directly to Supabase
// but the local source was never updated/committed, so git history didn't
// match production. Pulled the real deployed source via the Supabase MCP
// and replaced this file with it verbatim rather than re-deriving it.
// ============================================================

const xmlHeaders = { 'Content-Type': 'text/xml' }

function twiml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: xmlHeaders })
}

// Prompt 447: recording-status-callback subpath -- Twilio POSTs here once
// a recording finishes. Correlates back to the `calls` row via
// twilio_call_sid (written by the client on the call's `accept` event).
async function handleRecordingCallback(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('ok')

  const form = await req.formData()
  const recordingSid = String(form.get('RecordingSid') || '')
  const recordingUrl = String(form.get('RecordingUrl') || '')
  const callSid = String(form.get('CallSid') || '')
  const status = String(form.get('RecordingStatus') || '')

  if (status === 'completed' && callSid && recordingUrl) {
    const { createClient } = await import('npm:@supabase/supabase-js')
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    await admin
      .from('calls')
      .update({ recording_sid: recordingSid, recording_url: recordingUrl })
      .eq('twilio_call_sid', callSid)
  }

  return new Response('ok')
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  if (url.pathname.endsWith('/recording')) {
    return handleRecordingCallback(req)
  }

  if (req.method !== 'POST') {
    return twiml('<Response><Hangup/></Response>')
  }

  let to = ''
  try {
    const form = await req.formData()
    to = String(form.get('To') || '').trim()
  } catch {
    to = ''
  }

  if (!to) {
    return twiml('<Response><Hangup/></Response>')
  }

  const callerId = Deno.env.get('TWILIO_PHONE_NUMBER') || ''
  const safeTo = to.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Prompt 447: Brayden chose to add a spoken consent announcement rather
  // than port Ohvara's silent-recording pattern as-is -- behavioral health
  // calls carry real two-party-consent exposure Ohvara's SMB cold-calling
  // never had to think about.
  const recordingCallback = `${url.origin}${url.pathname}/recording`

  const body =
    '<Response>' +
    '<Say>This call may be recorded for quality and training purposes.</Say>' +
    '<Dial' +
    (callerId ? ` callerId="${callerId}"` : '') +
    ` record="record-from-answer-dual-channel" recordingStatusCallback="${recordingCallback}"` +
    '>' +
    `<Number>${safeTo}</Number>` +
    '</Dial>' +
    '</Response>'

  return twiml(body)
})
