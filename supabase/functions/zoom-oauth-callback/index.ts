// ============================================================
// zoom-oauth-callback — Zoom redirects the closer's own browser here
// after they approve the connection.
//
// Public (Zoom itself hits this, no user JWT in the request) — verifies
// the `state` param's HMAC signature (minted by zoom-oauth-start) instead
// of a bearer token. Exchanges the auth `code` for real access/refresh
// tokens, stores them, then retroactively creates Zoom meetings for any
// of this closer's already-booked appointments that were waiting on a
// connected Zoom account (Fork 1 from the Prompt 529 scoping doc).
//
// Deploy WITHOUT jwt verification:
//   supabase functions deploy zoom-oauth-callback --no-verify-jwt --project-ref avgvmzshujwphneykuvu
//
// Zoom app's OAuth redirect URL (must match exactly):
//   https://avgvmzshujwphneykuvu.supabase.co/functions/v1/zoom-oauth-callback
//
// Required Supabase secrets:
//   ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const ZOOM_REDIRECT_URI = 'https://avgvmzshujwphneykuvu.supabase.co/functions/v1/zoom-oauth-callback'
// Where the closer lands after connecting — Settings is where the
// "Connect Zoom" card lives.
const APP_SETTINGS_URL = 'https://restorix-portal-ohvara.vercel.app/settings'

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function verifyState(state: string, secret: string): Promise<string | null> {
  const parts = state.split('.')
  if (parts.length !== 3) return null
  const [closerId, expiresAtStr, sig] = parts
  const expiresAt = Number(expiresAtStr)
  if (!Number.isFinite(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) return null

  const payload = `${closerId}.${expiresAtStr}`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return b64url(new Uint8Array(expectedSig)) === sig ? closerId : null
}

function redirectTo(status: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `${APP_SETTINGS_URL}?zoom=${status}` },
  })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const zoomError = url.searchParams.get('error')

  if (zoomError) return redirectTo('denied')
  if (!code || !state) return redirectTo('error')

  const clientId = Deno.env.get('ZOOM_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!clientId || !clientSecret || !serviceRoleKey) return redirectTo('error')

  const closerId = await verifyState(state, serviceRoleKey)
  if (!closerId) return redirectTo('expired')

  // Exchange the authorization code for real tokens.
  const tokenResp = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: ZOOM_REDIRECT_URI,
    }),
  })
  if (!tokenResp.ok) {
    console.error('[zoom-oauth-callback] token exchange failed:', tokenResp.status, await tokenResp.text())
    return redirectTo('error')
  }
  const tokenData = await tokenResp.json()
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  // Best-effort — used only for a nicer "connected as ___" display, never
  // required for meeting creation (that uses the `me` alias with whichever
  // token is presented).
  let zoomUserId: string | null = null
  let zoomEmail: string | null = null
  try {
    const meResp = await fetch('https://api.zoom.us/v2/users/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (meResp.ok) {
      const me = await meResp.json()
      zoomUserId = me.id || null
      zoomEmail = me.email || null
    }
  } catch (e) {
    console.error('[zoom-oauth-callback] users/me lookup failed:', e?.message || e)
  }

  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)
  const { error: upsertError } = await adminClient.from('closer_zoom_tokens').upsert({
    closer_id: closerId,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
    zoom_user_id: zoomUserId,
    zoom_email: zoomEmail,
    connected_at: new Date().toISOString(),
  })
  if (upsertError) {
    console.error('[zoom-oauth-callback] token store failed:', upsertError.message)
    return redirectTo('error')
  }

  // Prompt 529 Fork 1: any appointment already booked for this closer
  // before they connected Zoom is still waiting on a real join link —
  // create those meetings now rather than leaving them pending forever.
  try {
    const { data: pendingLeads } = await adminClient
      .from('leads')
      .select('id')
      .eq('assigned_closer', closerId)
      .eq('status', 'appointment_booked')
      .is('zoom_join_url', null)
      .gt('strategy_call_at', new Date().toISOString())

    for (const lead of pendingLeads || []) {
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/create-zoom-meeting`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ leadId: lead.id }),
        })
      } catch (e) {
        console.error('[zoom-oauth-callback] retroactive meeting failed for lead', lead.id, e?.message || e)
      }
    }
  } catch (e) {
    console.error('[zoom-oauth-callback] retroactive lookup failed:', e?.message || e)
  }

  return redirectTo('connected')
})
