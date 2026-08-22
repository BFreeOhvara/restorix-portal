// ============================================================
// create-zoom-meeting — create a real Zoom meeting for a booked lead
//
// Called two ways: (1) from LogCallModal.jsx right after a setter saves
// an Appointment Booked outcome (authed JWT), and (2) internally by
// zoom-oauth-callback right after a closer connects, for any of their
// already-booked appointments still waiting on a link (service-role
// bearer token — verify_jwt accepts the service role key as a valid JWT
// same as any other authed caller).
//
// Idempotent: if the lead already has a zoom_join_url, returns it as-is
// rather than creating a duplicate meeting (retries are safe).
//
// Deploy WITH jwt verification:
//   supabase functions deploy create-zoom-meeting --project-ref avgvmzshujwphneykuvu
//
// Required Supabase secrets:
//   ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET — needed to refresh a closer's
//     access token if it's expired
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Refresh if the token expires within this window, not only once it's
// already dead — avoids a real race where the meeting-creation call
// itself takes long enough to cross the actual expiry.
const REFRESH_BUFFER_MS = 5 * 60 * 1000

async function refreshZoomToken(adminClient, closerId: string, refreshToken: string, clientId: string, clientSecret: string) {
  const resp = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!resp.ok) throw new Error(`Zoom token refresh failed: ${resp.status} ${await resp.text()}`)
  const data = await resp.json()
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
  // Zoom rotates the refresh token on every use — the old one becomes
  // invalid, so the new one must always be stored, never reused.
  await adminClient.from('closer_zoom_tokens').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
  }).eq('closer_id', closerId)
  return data.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { leadId } = await req.json().catch(() => ({}))
  if (!leadId) {
    return new Response(JSON.stringify({ error: 'leadId is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const clientId = Deno.env.get('ZOOM_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: lead, error: leadError } = await adminClient
    .from('leads')
    .select('id, facility_name, assigned_closer, strategy_call_at, zoom_join_url')
    .eq('id', leadId)
    .single()
  if (leadError || !lead) {
    return new Response(JSON.stringify({ error: 'Lead not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Idempotent — a retry (or the retroactive-create path double-firing)
  // should never create a second meeting for the same lead.
  if (lead.zoom_join_url) {
    return new Response(JSON.stringify({ join_url: lead.zoom_join_url, pending: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!lead.assigned_closer || !lead.strategy_call_at) {
    return new Response(JSON.stringify({ error: 'Lead has no assigned closer or strategy call time' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: tokenRow } = await adminClient
    .from('closer_zoom_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('closer_id', lead.assigned_closer)
    .maybeSingle()

  // Prompt 529 Fork 1: the closer hasn't connected Zoom yet — don't
  // block the booking that already happened, just report pending. The
  // retroactive path in zoom-oauth-callback creates this meeting for
  // real once they do connect.
  if (!tokenRow) {
    return new Response(JSON.stringify({ pending: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let accessToken = tokenRow.access_token
  const expiresAt = new Date(tokenRow.expires_at).getTime()
  if (expiresAt - Date.now() < REFRESH_BUFFER_MS) {
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'Zoom integration not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    try {
      accessToken = await refreshZoomToken(adminClient, lead.assigned_closer, tokenRow.refresh_token, clientId, clientSecret)
    } catch (e) {
      console.error('[create-zoom-meeting] refresh failed:', e?.message || e)
      return new Response(JSON.stringify({ error: 'Failed to refresh Zoom connection' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  const meetingResp = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic: `Restorix strategy call — ${lead.facility_name}`,
      type: 2, // scheduled
      start_time: lead.strategy_call_at,
      duration: 30,
      timezone: 'UTC',
      settings: { join_before_host: true, waiting_room: false },
    }),
  })
  if (!meetingResp.ok) {
    const body = await meetingResp.text()
    console.error('[create-zoom-meeting] Zoom meeting create failed:', meetingResp.status, body)
    return new Response(JSON.stringify({ error: 'Failed to create Zoom meeting' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const meeting = await meetingResp.json()

  const { error: updateError } = await adminClient
    .from('leads')
    .update({ zoom_join_url: meeting.join_url, zoom_meeting_id: String(meeting.id) })
    .eq('id', leadId)
  if (updateError) {
    console.error('[create-zoom-meeting] failed to save join_url:', updateError.message)
  }

  return new Response(JSON.stringify({ join_url: meeting.join_url, pending: false }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
