// ============================================================
// zoom-sdk-signature — sign the JWT a closer's browser needs to join a
// Zoom meeting through the embedded Meeting SDK (Prompt 618)
//
// Per Zoom's current Meeting SDK auth docs (there is no separate SDK
// Key/Secret app type anymore — the existing OAuth app's Client
// ID/Secret sign this JWT too, confirmed live in the Marketplace
// developer console before this prompt started): header
// {alg:'HS256', typ:'JWT'}, payload {appKey, mn, role, iat, exp,
// tokenExp} signed with the Client Secret via HMAC-SHA256.
//
// Authed closer only — same identity-resolution pattern as
// get-zoom-personal-room (JWT only, no closerId body param to trust).
//
// Deploy WITH jwt verification:
//   supabase functions deploy zoom-sdk-signature --project-ref avgvmzshujwphneykuvu
//
// Required Supabase secrets (already live, no new ones):
//   ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Zoom's own sample code uses a 2-hour token lifetime; the JWT is only
// used once to establish the join, so a long expiry just avoids the
// signature going stale if a closer leaves the tab open before clicking
// Join.
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 2

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)))
}

async function signMeetingJwt(meetingNumber: string, role: number, clientId: string, clientSecret: string): Promise<string> {
  const iat = Math.floor(Date.now() / 1000) - 30
  const exp = iat + TOKEN_LIFETIME_SECONDS
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = { appKey: clientId, mn: meetingNumber, role, iat, exp, tokenExp: exp }
  const unsigned = `${b64urlJson(header)}.${b64urlJson(payload)}`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(clientSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${b64url(new Uint8Array(sig))}`
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

  const { meetingNumber, role } = await req.json().catch(() => ({}))
  if (!meetingNumber) {
    return new Response(JSON.stringify({ error: 'meetingNumber is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  // 0 = attendee, 1 = host. Every caller in this app is a closer joining
  // either their own Personal Meeting Room or their own booked call's
  // meeting — always the meeting's host — so default to 1 rather than
  // requiring every call site to pass it explicitly.
  const resolvedRole = role === 0 ? 0 : 1

  const clientId = Deno.env.get('ZOOM_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Zoom integration not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: { user }, error: authError } =
    await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const signature = await signMeetingJwt(String(meetingNumber), resolvedRole, clientId, clientSecret)

  return new Response(JSON.stringify({ signature }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
