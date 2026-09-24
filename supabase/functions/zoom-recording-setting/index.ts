// ============================================================
// zoom-recording-setting — read / turn on a closer's own Zoom cloud
// recording setting, from inside the portal
//
// Prompt 648. Prompt 647's recording capture only works if cloud recording
// is on in the closer's own Zoom account (a per-user Zoom setting — every
// closer connects their own account, Prompt 617). This lets Settings show
// the real state and flip it on without a trip to Zoom's site.
//
// Zoom endpoints (user-level app, `me` alias — the closer's own account):
//   GET   /users/me/settings   granular scope user:read:settings
//   PATCH /users/me/settings   granular scope user:update:settings
// NOT cloud_recording:*:recording_settings — those cover GET/PATCH
// /meetings/{id}/recordings/settings, the sharing settings of one finished
// recording, not the account's on/off switch.
//
// Body: { action: 'get' | 'enable' }. Domain states come back as 200 with
// `{ state }` so the client can render each one plainly:
//   not_connected   — no closer_zoom_tokens row
//   needs_reconnect — the stored token predates the new scopes (Zoom 4711)
//                     or can no longer be refreshed; the closer reconnects
//   on / off        — the real current value of recording.cloud_recording
//   unsupported     — enable was attempted and Zoom did not turn it on,
//                     and the account is on Zoom's free Basic plan
//   blocked         — enable was attempted and Zoom did not turn it on on
//                     a paid account (usually locked off by the Zoom
//                     account's admin)
// `enable` never reports success from the PATCH alone: it re-reads the
// setting afterwards and only returns `on` if Zoom actually shows it on.
//
// Deploy WITH jwt verification:
//   supabase functions deploy zoom-recording-setting --project-ref avgvmzshujwphneykuvu
//
// Required Supabase secrets:
//   ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET — refresh the caller's access token
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Same buffer as create-zoom-meeting / get-zoom-personal-room.
const REFRESH_BUFFER_MS = 5 * 60 * 1000
const ZOOM_API = 'https://api.zoom.us/v2'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

class ReconnectNeeded extends Error {}

async function refreshZoomToken(adminClient, closerId: string, refreshToken: string, clientId: string, clientSecret: string) {
  const resp = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    console.error('[zoom-recording-setting] refresh failed:', resp.status, body)
    // A rejected refresh token (revoked app, expired after 90 days unused)
    // can't be fixed server-side — only a fresh Connect gets a new one.
    if (resp.status === 400 || resp.status === 401) throw new ReconnectNeeded('refresh rejected')
    throw new Error(`Zoom token refresh failed: ${resp.status}`)
  }
  const data = await resp.json()
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
  // Zoom rotates the refresh token on every use — always store the new one.
  await adminClient.from('closer_zoom_tokens').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
  }).eq('closer_id', closerId)
  return data.access_token
}

// Zoom answers a token that lacks a required scope with error code 4711
// ("Invalid access token, does not contain scopes:[...]"); 124 is an
// invalid/revoked token. Either way the closer has to reconnect.
async function zoomCall(accessToken: string, path: string, init: RequestInit = {}) {
  const resp = await fetch(`${ZOOM_API}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` },
  })
  if (resp.ok) return resp
  const text = await resp.text()
  let code: number | null = null
  let message = text
  try {
    const parsed = JSON.parse(text)
    code = typeof parsed.code === 'number' ? parsed.code : null
    message = parsed.message || text
  } catch { /* non-JSON error body */ }
  console.error(`[zoom-recording-setting] ${init.method || 'GET'} ${path} failed:`, resp.status, text)
  if (code === 4711 || code === 124 || /does not contain scopes/i.test(message)) {
    throw new ReconnectNeeded(message)
  }
  const err = new Error(message || `Zoom ${resp.status}`) as Error & { status?: number }
  err.status = resp.status
  throw err
}

async function readCloudRecording(accessToken: string): Promise<boolean> {
  const resp = await zoomCall(accessToken, '/users/me/settings')
  const settings = await resp.json()
  return settings?.recording?.cloud_recording === true
}

// Zoom user `type`: 1 = Basic (free), 2 = Licensed, 4 = Unassigned, 99 = None.
// Best-effort — only used to word a failed enable, never to block one.
async function readUserType(accessToken: string): Promise<number | null> {
  try {
    const resp = await zoomCall(accessToken, '/users/me')
    const me = await resp.json()
    return typeof me.type === 'number' ? me.type : null
  } catch (e) {
    if (e instanceof ReconnectNeeded) throw e
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing or invalid Authorization header' }, 401)

  let action = 'get'
  try {
    const body = await req.json()
    if (body?.action === 'enable') action = 'enable'
    else if (body?.action && body.action !== 'get') return json({ error: 'Unknown action' }, 400)
  } catch { /* empty body = get */ }

  const clientId = Deno.env.get('ZOOM_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Identity comes only from the verified JWT — a closer only ever reads
  // or changes their own Zoom account's setting.
  const { data: { user }, error: authError } =
    await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !user) return json({ error: 'Invalid or expired token' }, 401)

  const { data: tokenRow } = await adminClient
    .from('closer_zoom_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('closer_id', user.id)
    .maybeSingle()
  if (!tokenRow) return json({ state: 'not_connected' })

  try {
    let accessToken = tokenRow.access_token
    if (new Date(tokenRow.expires_at).getTime() - Date.now() < REFRESH_BUFFER_MS) {
      if (!clientId || !clientSecret) return json({ error: 'Zoom integration not configured' }, 503)
      accessToken = await refreshZoomToken(adminClient, user.id, tokenRow.refresh_token, clientId, clientSecret)
    }

    const current = await readCloudRecording(accessToken)
    if (action === 'get' || current) return json({ state: current ? 'on' : 'off' })

    let patchError: string | null = null
    try {
      await zoomCall(accessToken, '/users/me/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording: { cloud_recording: true } }),
      })
    } catch (e) {
      if (e instanceof ReconnectNeeded) throw e
      patchError = e?.message || String(e)
    }

    // Zoom can accept the PATCH (204) and still leave the value off when
    // the plan or an admin lock doesn't allow it — trust only a re-read.
    const after = await readCloudRecording(accessToken)
    if (after) return json({ state: 'on' })

    const userType = await readUserType(accessToken)
    return json({
      state: userType === 1 ? 'unsupported' : 'blocked',
      zoom_message: patchError,
    })
  } catch (e) {
    if (e instanceof ReconnectNeeded) return json({ state: 'needs_reconnect' })
    console.error('[zoom-recording-setting] failed:', e?.message || e)
    return json({ error: 'Could not reach Zoom — try again.' }, 502)
  }
})
