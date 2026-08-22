// ============================================================
// zoom-oauth-start — begin a closer's Zoom account connection
//
// Called from Settings' "Connect Zoom" button (an authed closer). Returns
// the Zoom OAuth authorize URL for the browser to navigate to directly
// (fetch/invoke can't follow a redirect to a real browser navigation, so
// the client does `window.location.href = data.url`).
//
// The `state` param is a signed, short-lived token binding this specific
// closer's id to the OAuth round-trip (CSRF protection) — Zoom just
// echoes it back verbatim to zoom-oauth-callback, which verifies the
// signature there. Signed with SUPABASE_SERVICE_ROLE_KEY as the HMAC key
// (already a server-only secret, no new one needed for this).
//
// Deploy WITH jwt verification:
//   supabase functions deploy zoom-oauth-start --project-ref avgvmzshujwphneykuvu
//
// Required Supabase secrets:
//   ZOOM_CLIENT_ID
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — resolve the caller + sign state
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZOOM_REDIRECT_URI = 'https://avgvmzshujwphneykuvu.supabase.co/functions/v1/zoom-oauth-callback'
const STATE_TTL_SECONDS = 600

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function signState(closerId: string, expiresAt: number, secret: string): Promise<string> {
  const payload = `${closerId}.${expiresAt}`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${b64url(new Uint8Array(sig))}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const clientId = Deno.env.get('ZOOM_CLIENT_ID')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!clientId || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Zoom integration not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)
  const { data: { user }, error: authError } =
    await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const expiresAt = Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS
  const state = await signState(user.id, expiresAt, serviceRoleKey)

  const url = new URL('https://zoom.us/oauth/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', ZOOM_REDIRECT_URI)
  url.searchParams.set('state', state)

  return new Response(JSON.stringify({ url: url.toString() }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
