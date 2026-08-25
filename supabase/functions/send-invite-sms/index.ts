// ============================================================
// send-invite-sms — sends a closer-created setter invite link via SMS
//
// Prompt 533: closers get their own invite-send flow (SMS only, email
// deferred to a future prompt). The invite ROW is created client-side —
// same generateToken()+insert pattern useInvites.js's useCreateInvite
// already uses for admin's InviteModal — now allowed for closers too via
// the invites_insert_closer RLS policy (role = 'setter' only). This
// function's only job is delivering that token by text, not creating it.
//
// Re-verifies the token actually belongs to the caller (created_by
// match, unused, unexpired, role = 'setter') before sending — closes off
// the SMS API as a spam vector even though RLS already restricts who can
// create invite rows and what role they can carry.
//
// Deploy WITH jwt verification (called by an authed closer):
//   supabase functions deploy send-invite-sms --project-ref avgvmzshujwphneykuvu
//
// Required Supabase secrets (already configured for send-appointment-reminders):
//   TWILIO_ACCOUNT_SID / TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET / TWILIO_PHONE_NUMBER
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function requireCloser(req: Request, adminClient: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: jsonError('Missing or invalid Authorization header', 401) }
  }

  const jwt = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await adminClient.auth.getUser(jwt)
  if (authError || !user) {
    return { error: jsonError('Invalid or expired token', 401) }
  }

  const { data: profile } = await adminClient.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'closer') {
    return { error: jsonError('Forbidden — closer role required', 403) }
  }

  return { userId: user.id }
}

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error: authError, userId } = await requireCloser(req, adminClient)
  if (authError) return authError

  let payload: { token?: string; phone?: string }
  try {
    payload = await req.json()
  } catch {
    return jsonError('Invalid request body', 400)
  }

  const { token, phone } = payload
  if (!token || !phone) {
    return jsonError('token and phone are required', 400)
  }

  const { data: invite, error: inviteError } = await adminClient
    .from('invites')
    .select('created_by, role, used_at, expires_at')
    .eq('token', token)
    .single()

  if (inviteError || !invite) {
    return jsonError('Invite not found', 404)
  }
  if (invite.created_by !== userId) {
    return jsonError('You can only send invites you created', 403)
  }
  if (invite.role !== 'setter') {
    return jsonError('This invite flow can only send setter invites', 403)
  }
  if (invite.used_at) {
    return jsonError('This invite has already been used', 400)
  }
  if (new Date(invite.expires_at) < new Date()) {
    return jsonError('This invite has expired', 400)
  }

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const apiKeySid = Deno.env.get('TWILIO_API_KEY_SID')
  const apiKeySecret = Deno.env.get('TWILIO_API_KEY_SECRET')
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')
  if (!accountSid || !apiKeySid || !apiKeySecret || !fromNumber) {
    return jsonError('Twilio not configured', 503)
  }

  const link = `https://portal.restorix.co/join/${token}`
  const messageBody = `You've been invited to join Restorix Portal as a setter. Set up your account: ${link}`

  try {
    await sendSms(phone, messageBody, accountSid, apiKeySid, apiKeySecret, fromNumber)
  } catch (e) {
    return jsonError(e?.message || 'Failed to send SMS', 502)
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
