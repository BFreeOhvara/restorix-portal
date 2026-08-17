// ============================================================
// twilio-voice-webhook — TwiML for the browser WebRTC call
//
// The TwiML App (TWILIO_TWIML_APP_SID) points its Voice URL here.
// When the setter/closer's browser Device calls device.connect({ params:{ To } }),
// Twilio POSTs here; we return TwiML that dials the lead from Restorix's
// Twilio number. No recording — Restorix has no call-grading pipeline
// (unlike ohvara-dashboard's version), so there's nothing downstream to
// consume a recording yet; add back if/when that infra exists.
//
// Deploy WITHOUT jwt verification (Twilio calls this directly, no auth):
//   supabase functions deploy twilio-voice-webhook --no-verify-jwt --project-ref avgvmzshujwphneykuvu
//
// TwiML App Voice URL (set in Twilio console):
//   https://avgvmzshujwphneykuvu.supabase.co/functions/v1/twilio-voice-webhook
//
// Required Supabase secrets:
//   TWILIO_PHONE_NUMBER — the callerId shown to the lead (e.g. +12345678900)
// ============================================================

const xmlHeaders = { 'Content-Type': 'text/xml' }

function twiml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: xmlHeaders })
}

Deno.serve(async (req) => {
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

  const body =
    '<Response>' +
    '<Dial' +
    (callerId ? ` callerId="${callerId}"` : '') +
    '>' +
    `<Number>${safeTo}</Number>` +
    '</Dial>' +
    '</Response>'

  return twiml(body)
})
