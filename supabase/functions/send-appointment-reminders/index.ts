// ============================================================
// send-appointment-reminders — 24h / 1h / 15m SMS reminders before a
// booked Zoom strategy call, sent to the lead.
//
// Driven by a 5-minute pg_cron tick (matching redistribute-no-answers'
// own cadence) via net.http_post + the same x-cron-secret header pattern
// samhsa-scraper already established — verify_jwt is off since the
// caller is pg_cron, not a user.
//
// Each threshold checks "crossed AND not yet sent" rather than "is due
// exactly now" — a brief cron gap still catches up on the next run
// instead of silently skipping a reminder (Prompt 529's own named edge
// case). A `strategy_call_at` sanity floor keeps a long outage from
// suddenly blasting reminders for meetings that already happened.
//
// Deploy WITHOUT jwt verification:
//   supabase functions deploy send-appointment-reminders --no-verify-jwt --project-ref avgvmzshujwphneykuvu
//
// Required Supabase secrets:
//   TWILIO_ACCOUNT_SID / TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET / TWILIO_PHONE_NUMBER
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const THRESHOLDS = [
  { column: 'reminder_24h_sent_at', windowMs: 24 * 60 * 60 * 1000, label: '24 hours' },
  { column: 'reminder_1h_sent_at', windowMs: 60 * 60 * 1000, label: '1 hour' },
  { column: 'reminder_15m_sent_at', windowMs: 15 * 60 * 1000, label: '15 minutes' },
]

// Never fire a reminder for a call more than an hour in the past — a
// real cron outage lasting hours/days shouldn't suddenly text every lead
// whose meeting already happened.
const STALE_FLOOR_MS = 60 * 60 * 1000

async function sendSms(to: string, body: string, accountSid: string, apiKeySid: string, apiKeySecret: string, from: string) {
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${apiKeySid}:${apiKeySecret}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  })
  if (!resp.ok) throw new Error(`Twilio SMS failed: ${resp.status} ${await resp.text()}`)
  return resp.json()
}

Deno.serve(async (req) => {
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: secretRow } = await adminClient
    .from('app_secrets')
    .select('value')
    .eq('key', 'cron_secret')
    .single()
  if (!secretRow || req.headers.get('x-cron-secret') !== secretRow.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const apiKeySid = Deno.env.get('TWILIO_API_KEY_SID')
  const apiKeySecret = Deno.env.get('TWILIO_API_KEY_SECRET')
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')
  if (!accountSid || !apiKeySid || !apiKeySecret || !fromNumber) {
    return new Response(JSON.stringify({ error: 'Twilio not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    })
  }

  const now = Date.now()
  const results: Record<string, number> = {}

  for (const threshold of THRESHOLDS) {
    const windowCutoff = new Date(now + threshold.windowMs).toISOString()
    const staleFloor = new Date(now - STALE_FLOOR_MS).toISOString()

    const { data: dueLeads, error } = await adminClient
      .from('leads')
      .select('id, facility_name, phone, strategy_call_at, zoom_join_url')
      .eq('status', 'appointment_booked')
      .is(threshold.column, null)
      .not('zoom_join_url', 'is', null)
      .lte('strategy_call_at', windowCutoff)
      .gt('strategy_call_at', staleFloor)

    if (error) {
      console.error(`[send-appointment-reminders] query failed for ${threshold.column}:`, error.message)
      continue
    }

    let sent = 0
    for (const lead of dueLeads || []) {
      const body = `Reminder: your strategy call with Restorix is in ${threshold.label}. Join here: ${lead.zoom_join_url}`
      try {
        await sendSms(lead.phone, body, accountSid, apiKeySid, apiKeySecret, fromNumber)
        await adminClient.from('leads').update({ [threshold.column]: new Date().toISOString() }).eq('id', lead.id)
        sent += 1
      } catch (e) {
        console.error(`[send-appointment-reminders] SMS failed for lead ${lead.id}:`, e?.message || e)
      }
    }
    results[threshold.column] = sent
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
