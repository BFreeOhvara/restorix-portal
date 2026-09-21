// ============================================================
// get-zoom-personal-room — look up a closer's own Zoom Personal Meeting
// Room join URL
//
// Called from the Meeting Room tab (Prompt 615) once useZoomConnection
// shows the closer is connected. Authed closer only — reads/refreshes
// their own closer_zoom_tokens row, the same shape create-zoom-meeting
// already reads, then calls Zoom's GET /users/me to read the room's real
// join URL rather than guessing at a URL format.
//
// Deploy WITH jwt verification:
//   supabase functions deploy get-zoom-personal-room --project-ref avgvmzshujwphneykuvu
//
// Required Supabase secrets:
//   ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET — needed to refresh the caller's
//     access token if it's expired
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Same buffer as create-zoom-meeting — refresh a token that's about to
// expire rather than only once it's already dead.
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

  const clientId = Deno.env.get('ZOOM_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Resolve the caller from their own JWT — this is a "my own room" lookup,
  // never another closer's, so there's no leadId/closerId body param to
  // trust; identity comes only from the verified token.
  const { data: { user }, error: authError } =
    await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: tokenRow } = await adminClient
    .from('closer_zoom_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('closer_id', user.id)
    .maybeSingle()

  if (!tokenRow) {
    return new Response(JSON.stringify({ error: 'Zoom not connected' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      accessToken = await refreshZoomToken(adminClient, user.id, tokenRow.refresh_token, clientId, clientSecret)
    } catch (e) {
      console.error('[get-zoom-personal-room] refresh failed:', e?.message || e)
      return new Response(JSON.stringify({ error: 'Failed to refresh Zoom connection' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  const meResp = await fetch('https://api.zoom.us/v2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!meResp.ok) {
    const body = await meResp.text()
    console.error('[get-zoom-personal-room] GET /users/me failed:', meResp.status, body)
    // A 401/403 here most often means the account's Zoom app scope doesn't
    // grant user:read — surface that distinctly rather than a generic 502
    // so the client (and Brayden, via the shipped notes) can tell scope
    // trouble apart from a transient Zoom outage.
    const status = meResp.status === 401 || meResp.status === 403 ? 403 : 502
    return new Response(JSON.stringify({
      error: status === 403
        ? "Zoom account is missing the user:read scope needed to look up the Personal Meeting Room"
        : 'Failed to read Zoom profile',
    }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const me = await meResp.json()

  // Per Zoom's documented GET /users/{userId} response schema, the user
  // object carries both `personal_meeting_url` (a ready join link) and
  // `pmi` (the bare numeric Personal Meeting ID). Prefer the real URL when
  // Zoom returns one; fall back to building the standard /j/<pmi> join
  // link from `pmi` alone if it doesn't. Flagged in the Prompt 615 shipped
  // notes: this session has no live connected Zoom account to confirm
  // which field the real response actually populates — verify against a
  // real GET /users/me response and adjust here if it differs.
  const joinUrl = me.personal_meeting_url || (me.pmi ? `https://zoom.us/j/${me.pmi}` : null)
  if (!joinUrl) {
    return new Response(JSON.stringify({ error: 'Zoom account has no Personal Meeting Room configured' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Prompt 618: the Meeting SDK embed needs a bare meeting number +
  // password, not a join URL. `me.pmi` is already the bare number; Zoom's
  // GET /users/{userId} response has no separate PMI-passcode field, but
  // personal_meeting_url embeds it as a `pwd` query param when the account
  // requires one — parse it out of the real URL rather than guessing at a
  // second endpoint. Falls back to no password if the account doesn't
  // require one (or the URL came from the pmi-only fallback above).
  let password: string | null = null
  try {
    password = new URL(joinUrl).searchParams.get('pwd')
  } catch {
    // joinUrl was already validated as truthy above; a parse failure here
    // just means no password could be extracted, not a request error.
  }

  return new Response(JSON.stringify({
    join_url: joinUrl,
    meeting_number: me.pmi ? String(me.pmi) : null,
    password,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
