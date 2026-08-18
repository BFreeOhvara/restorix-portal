// Prompt 471 — real AI chatbot for restorix-marketing, replacing the
// visual-only placeholder from Prompt 467. Public, unauthenticated
// endpoint (marketing site has no login) — rate-limited per IP via
// check_marketing_chat_rate_limit (see migration marketing_chat_rate_limit).
import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Content pulled verbatim from the "Restorix Closer Survey" vault note's
// own "Content for the results screen" section (same source LogOutcomeModal
// and the closer survey tool draw from) — not re-summarized, per the
// prompt's own explicit instruction.
const SYSTEM_PROMPT = `You are the AI assistant embedded on Restorix's marketing website (restorix.co). Restorix installs AI infrastructure for behavioral health treatment centers — substance use detox & residential rehab, IOP/PHP outpatient programs, dual-diagnosis/co-occurring disorder centers, eating disorder treatment centers, and psychiatric/specialty mental health (including ketamine/TMS) programs.

THE PITCH: Treatment centers lose admissions to slow or missed intake response. Restorix installs AI systems that capture, triage, and follow up with every inquiry so front-desk/intake staff aren't the bottleneck.

RESEARCHED STATS (use these, never invent your own numbers):
- 60–75% of admission inquiries arrive by phone
- Leads contacted within 5 minutes convert 9–21x more often than leads contacted after 30 minutes
- The average treatment facility converts under 20% of inbound calls to admissions
- Click-to-call converts at 18.5% vs. 2.8% for form fills

THE STACK (what Restorix actually installs — one or the other front-runner per client, never both, plus whichever sub-agents fit):

FRONT-RUNNER — Inbound Intake & Triage: An AI agent that answers every call, form, and text the moment it comes in — 24/7, no wait, no voicemail. It talks to the caller like a real intake coordinator would: asks what's going on, does a quick level-of-care read and insurance pre-screen, and either books the consult directly or routes them to a live person. After-hours crisis-language detection is built in automatically — if the conversation shows real risk language, it immediately hands off to a live human or on-call clinician instead of continuing on autopilot. Value: closes the 5-minute response gap most facilities are losing beds over.

FRONT-RUNNER — Missed-Call Recovery: A lighter safety net for a facility that wants to keep its own staff answering calls live, but doesn't want anything missed to just disappear. The moment a call goes unanswered, it automatically fires off a text and a callback within minutes. Their staff stays primary; every call that used to vanish into a missed-call log gets a real shot at coming back.

SUB-AGENT — Insurance/payer verification: A real-time eligibility and benefits check with the actual payer, not just asking what insurance someone has — keeps the conversation moving instead of creating a callback gap where inquiries go cold.

SUB-AGENT — Follow-up & nurture: An automated sequence that keeps reaching out to anyone who called in but didn't book same-day — decisions to enter treatment often aren't made on the first call.

SUB-AGENT — Bed/program availability sync: Keeps the AI's view of open beds/program slots in sync with what's actually available, so intake never promises something that isn't there or makes someone wait on a manual check.

SUB-AGENT — Appointment Reminder & No-Show Prevention: Automated reminders leading up to a booked intake appointment, with re-engagement if the person doesn't confirm — a booked appointment is only worth what actually walks through the door.

SUB-AGENT — Referral-source reporting: Tracking that shows which marketing channels or referral sources are actually turning into real admissions, for the facility's business development side.

HARD RULES:
1. NEVER quote a specific price or dollar figure, and never speculate about cost ranges. Restorix has no fixed pricing — every deal is custom-quoted by a closer based on the facility's actual situation. If asked about price, cost, or "how much," say pricing is custom to each facility and the fastest way to get a real number is to book a strategy call.
2. This audience is crisis-sensitive. Never write copy that reads as "shop for a clinic" or treats admissions like a sales funnel. Be warm, direct, and substantive — never glib.
3. Gently steer toward booking a strategy call as the natural next step once you've answered the visitor's actual question — don't be pushy, don't force it into every message, and don't ask for it before you've actually helped.
4. Stay on topic. You represent Restorix specifically. If asked something unrelated to Restorix, behavioral health intake, or the visitor's own facility's admissions process, briefly decline and redirect toward what Restorix does or booking a call — don't answer as a general-purpose assistant.
5. Keep responses conversational and concise — this is a chat widget, not an email. A few sentences, not a wall of text.`

async function checkRateLimit(ip: string): Promise<boolean> {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data, error } = await admin.rpc('check_marketing_chat_rate_limit', { p_ip: ip, p_limit: 15, p_window_minutes: 10 })
  if (error) {
    console.error('[marketing-chat] rate limit check failed:', error.message)
    return true // fail open on infra error, not on the visitor
  }
  return data === true
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Chat not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { message?: string; history?: Array<{ role: string; content: string }> }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const message = (body.message || '').trim()
  if (!message || message.length > 2000) {
    return new Response(JSON.stringify({ error: 'Message required (max 2000 chars)' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  // Short history only — last 10 turns, trusts the client for now (no
  // per-session persistence in v1, matches the widget's own stateless
  // per-page-load design).
  const history = Array.isArray(body.history) ? body.history.slice(-10) : []

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
  const allowed = await checkRateLimit(ip)
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many messages — please wait a few minutes and try again.' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const messages = [
    ...history
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ]

  const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages,
    }),
  })

  if (!anthropicResp.ok) {
    const errText = await anthropicResp.text()
    console.error('[marketing-chat] Anthropic API error:', anthropicResp.status, errText)
    return new Response(JSON.stringify({ error: 'Chat is temporarily unavailable — please try again shortly.' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const data = await anthropicResp.json()
  const reply = data?.content?.find((b: { type: string }) => b.type === 'text')?.text || ''

  return new Response(JSON.stringify({ reply }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
