// ============================================================
// mint-handoff-link — cross-domain SSO hand-off for the closer Swap button
//
// Prompt 549: the two niche portals (portal.restorix.co / portal.suretix.co)
// are genuinely separate domains, so a browser won't carry a login session
// across them. On Swap, the frontend calls this with a valid closer JWT and
// the niche it's swapping FROM; this mints a short-lived Supabase magic
// link (server-side, service role) pointing at the OTHER niche's
// /auth/callback and returns the ready-to-follow action_link. The frontend
// hard-navigates to it: Supabase's own /auth/v1/verify performs the
// exchange and 302s to the callback with a fresh session in the URL
// fragment. The raw token/OTP is never returned to the client.
//
// Deploy WITH jwt verification (called by an authed closer):
//   supabase functions deploy mint-handoff-link --project-ref avgvmzshujwphneykuvu
//
// PREREQUISITE (manual, Brayden/Eagle — CC can't do this):
//   Supabase dashboard → Authentication → URL Configuration → Redirect URLs
//   must include BOTH:
//     https://portal.restorix.co/auth/callback
//     https://portal.suretix.co/auth/callback
//   Until each is listed, generateLink's redirectTo for that domain is
//   silently ignored and the user lands on the Site URL instead.
//
// Required Supabase secrets (already configured):
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
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

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing or invalid Authorization header' }, 401)
  }
  const jwt = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await admin.auth.getUser(jwt)
  if (authError || !user) {
    return json({ error: 'Invalid or expired token' }, 401)
  }

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'closer') {
    return json({ error: 'Forbidden — closer role required' }, 403)
  }

  if (!user.email) {
    return json({ error: 'Caller has no email on file' }, 422)
  }

  let body: { from_niche?: string } = {}
  try {
    body = await req.json()
  } catch {
    // empty body handled by the validation below
  }

  const { data: brands, error: brandError } = await admin
    .from('niche_brands')
    .select('niche, portal_domain')
  if (brandError || !brands?.length) {
    return json({ error: 'Brand config unavailable' }, 500)
  }
  if (!body.from_niche || !brands.some((b) => b.niche === body.from_niche)) {
    return json({ error: 'from_niche must be a valid niche' }, 400)
  }

  const target = brands.find((b) => b.niche !== body.from_niche)
  if (!target) {
    return json({ error: 'No other niche configured to swap to' }, 409)
  }

  const redirectTo = `https://${target.portal_domain}/auth/callback`
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
    options: { redirectTo },
  })
  if (linkError || !linkData?.properties?.action_link) {
    return json({ error: linkError?.message || 'Failed to mint hand-off link' }, 502)
  }

  return json({
    action_link: linkData.properties.action_link,
    target_niche: target.niche,
    target_domain: target.portal_domain,
  })
})
