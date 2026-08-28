// ============================================================
// claim-invite — validates an invite token and creates the account
//
// Public, unauthenticated (verify_jwt disabled) — the invitee has no
// session yet. Security rests on the token being an unguessable,
// single-use, expiring secret, validated here via the service-role client
// (the only path that can read/consume an invite pre-auth; RLS on
// `invites` grants no anon access). Mirrors ohvara-dashboard's
// claim-invite.
//
// Prompt 546 — `client` invites carry `deal_id`. On a successful client
// claim, the new profile id is written back onto that deal
// (`client_profile_id`) and the deal flips `provisioning` → `active`, so
// the closer's Client Portal view and the client's own dashboard both
// resolve. `handle_new_user` already maps any enum `role` from
// user_metadata into the profiles row, so no per-role branch is needed
// for account creation itself.
//
// Deploy WITHOUT jwt verification:
//   supabase functions deploy claim-invite --no-verify-jwt --project-ref avgvmzshujwphneykuvu
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const body = await req.json()
  const { action, token } = body

  if (!token) return json({ error: 'Missing token' }, 400)

  const { data: invite, error: inviteError } = await adminClient
    .from('invites')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (inviteError || !invite) return json({ error: 'Invalid invite link' }, 404)
  if (invite.used_at) return json({ error: 'This invite has already been used' }, 400)
  if (new Date(invite.expires_at) < new Date()) return json({ error: 'This invite has expired' }, 400)

  if (action === 'check') {
    return json({ valid: true, role: invite.role })
  }

  if (action === 'claim') {
    const { username, password, full_name } = body

    if (!username || !password || !full_name) {
      return json({ error: 'Missing required fields' }, 400)
    }
    if (!/^[a-z0-9_-]+$/.test(username)) {
      return json({ error: 'Username may only contain lowercase letters, numbers, underscores, and hyphens' }, 400)
    }
    if (password.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400)
    }

    const { data: existing } = await adminClient.from('profiles').select('id').eq('username', username).maybeSingle()
    if (existing) return json({ error: 'Username is already taken' }, 400)

    const internalEmail = `${username}@restorix.internal`

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: invite.role, username },
    })

    if (createError) return json({ error: createError.message }, 400)

    await adminClient
      .from('invites')
      .update({ used_at: new Date().toISOString(), used_by: created.user.id })
      .eq('id', invite.id)

    // Prompt 546 — link the freshly-created client account back to its deal.
    if (invite.role === 'client' && invite.deal_id) {
      await adminClient
        .from('deals')
        .update({ client_profile_id: created.user.id, status: 'active' })
        .eq('id', invite.deal_id)
    }

    return json({ success: true })
  }

  return json({ error: 'Invalid action' }, 400)
})
