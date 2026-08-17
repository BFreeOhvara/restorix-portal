// ============================================================
// twilio-token — mint a Twilio Voice Access Token for the browser
//
// Setter/closer's LogCallModal calls this before placing a call. Returns
// a short-lived JWT (Access Token) that the @twilio/voice-sdk Device uses
// to register and place WebRTC calls — same pattern as ohvara-dashboard's
// twilio-token function, ported for Restorix's own Twilio account.
//
// Deploy WITH jwt verification (called by an authed setter/closer):
//   supabase functions deploy twilio-token --project-ref avgvmzshujwphneykuvu
//
// Required Supabase secrets (set these yourself — never pasted into chat
// or entered by CC, per this vault's credential-handling rule):
//   TWILIO_ACCOUNT_SID      — Restorix's Twilio account SID (ACxxxx)
//   TWILIO_API_KEY_SID      — Standard API Key SID (SKxxxx)
//   TWILIO_API_KEY_SECRET   — that API Key's secret
//   TWILIO_TWIML_APP_SID    — Voice TwiML App SID (APxxxx), Voice URL
//                             = .../functions/v1/twilio-voice-webhook
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — to resolve the caller
//
// The token's identity = the calling user's profile_id (auth user id),
// read from the request JWT — never trusted from the body.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlBytes(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function buildAccessToken(opts: {
  accountSid: string
  apiKeySid: string
  apiKeySecret: string
  twimlAppSid: string
  identity: string
  ttlSeconds: number
  nowSeconds: number
}): Promise<string> {
  const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' }
  const payload = {
    jti: `${opts.apiKeySid}-${opts.nowSeconds}`,
    iss: opts.apiKeySid,
    sub: opts.accountSid,
    nbf: opts.nowSeconds,
    exp: opts.nowSeconds + opts.ttlSeconds,
    grants: {
      identity: opts.identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: opts.twimlAppSid },
      },
    },
  }

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(opts.apiKeySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${b64urlBytes(new Uint8Array(sig))}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const accountSid   = Deno.env.get('TWILIO_ACCOUNT_SID')
  const apiKeySid    = Deno.env.get('TWILIO_API_KEY_SID')
  const apiKeySecret = Deno.env.get('TWILIO_API_KEY_SECRET')
  const twimlAppSid  = Deno.env.get('TWILIO_TWIML_APP_SID')
  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    return new Response(JSON.stringify({ error: 'Twilio Voice not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

  const nowSeconds = Math.floor(Date.now() / 1000)
  const token = await buildAccessToken({
    accountSid, apiKeySid, apiKeySecret, twimlAppSid,
    identity: user.id,
    ttlSeconds: 3600,
    nowSeconds,
  })

  return new Response(JSON.stringify({ token, identity: user.id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
