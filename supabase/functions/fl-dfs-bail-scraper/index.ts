// ============================================================
// fl-dfs-bail-scraper — Florida bail-bonds lead source (Prompt 543 Part B).
//
// Pulls every VALID "Bail Bonds" license from the Florida Department of
// Financial Services licensee search (licenseesearch.fldfs.com) and upserts
// them into `leads` as niche = 'bail_bonds', source = 'fl_dfs'.
//
// Why this source (verified against the Prompt 463 bar — confirm the real
// access contract, not just "an endpoint exists"):
//   - FL bail agents are licensed by DFS (Ch. 648, class 2-34). The search
//     site is public, no auth, no API key, and exposes a built-in CSV
//     "Export" of the full result set. Florida public-records law (Ch. 119)
//     makes licensee data public; the site also runs its own bulk-download
//     portal. No robots.txt. Same category as findtreatment.gov.
//   - Statewide valid Bail Bonds licenses ≈ 2,637 rows / ~1,650 distinct
//     business phone numbers as of 2026-08 — a single 380 KB CSV, so no
//     grid/batch/resume machinery like samhsa-scraper needs. One shot.
//
// The handshake (all cookie-jar bound, no auth):
//   1. GET  /                 → scrape csrf_token, capture session cookies
//   2. POST /                 → csrf_token + LicenseStatusFilter=1 (Valid)
//                               + LicenseCategoryFilter=2 (Bail Bonds)
//   3. GET  /Home/Export      → text/csv of the whole result set (win-1252)
//
// Dedup: one lead per normalised business phone (business-entity "B####"
// licenses win a tie over individual-agent licenses at the same number);
// phone-less rows key on normalised name + zip. external_id namespaces on
// `fl_dfs_bail:` so a re-run diffs cleanly and never double-inserts.
//
// Not a passive top-up — no rows are handed to anyone. New leads land in the
// shared unassigned pool exactly like samhsa's do; a closer pulls them via
// request_closer_leads(_, 'bail_bonds').
//
// verify_jwt is off — the caller is pg_cron / a manual admin curl, not a
// user. Auth is the shared x-cron-secret in app_secrets, same as
// samhsa-scraper / send-appointment-reminders.
//
// Deploy:
//   supabase functions deploy fl-dfs-bail-scraper --no-verify-jwt --project-ref avgvmzshujwphneykuvu
//
// Invoke:
//   POST { }              → real run (fetch, dedup, diff, insert/update)
//   POST { "dryRun": true } → everything except the writes; returns counts
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const FLDFS_BASE = 'https://licenseesearch.fldfs.com'
const SOURCE = 'fl_dfs'
const NICHE = 'bail_bonds'
const EXT_PREFIX = 'fl_dfs_bail'
const INSERT_CHUNK = 500

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// --- tiny cookie jar ------------------------------------------------------
class CookieJar {
  private jar = new Map<string, string>()
  absorb(res: Response) {
    // Deno exposes getSetCookie(); fall back to the combined header.
    const raw: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : [])
    for (const line of raw) {
      const first = line.split(';', 1)[0]
      const eq = first.indexOf('=')
      if (eq > 0) this.jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim())
    }
  }
  header() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
}

// --- CSV parse (quoted fields, CRLF) -------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ } else q = false
      } else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c === '\r') { /* skip */ }
    else cur += c
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row) }
  return rows
}

// --- field helpers ------------------------------------------------------
const squish = (s: string) => (s || '').replace(/\s+/g, ' ').trim()

// "(352) 377-3333", "(386) 846-1589 Ext. 8461589" → "3523773333" | null
function normPhone(raw: string): string | null {
  if (!raw) return null
  const beforeExt = raw.split(/\bext\.?/i)[0]
  let d = beforeExt.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  return d.length === 10 ? d : null
}

// "GAINESVILLE, FL, 32609" → { city, state, zip }
function splitCityStateZip(raw: string) {
  const parts = squish(raw).split(',').map((p) => p.trim()).filter(Boolean)
  const state = parts.find((p) => /^[A-Z]{2}$/.test(p)) || 'FL'
  const zipPart = parts.find((p) => /^\d{5}(\d{4})?$/.test(p)) || ''
  const zip = zipPart.length === 9 ? `${zipPart.slice(0, 5)}-${zipPart.slice(5)}` : zipPart
  const city = parts[0] && !/^[A-Z]{2}$/.test(parts[0]) && !/^\d/.test(parts[0]) ? parts[0] : ''
  return { city, state, zip }
}

const stripNpn = (raw: string) => (raw || '').replace(/^=?"?/, '').replace(/"?$/, '').replace(/\D/g, '')

// ALL-CAPS / "LAST, FIRST" → readable. Leaves business names alone.
function cleanName(raw: string): string {
  let n = squish(raw).replace(/^[^A-Za-z0-9]+/, '') // drop leading "!!!!" / "¿" junk
  if (!n) n = squish(raw)
  const looksLikeBusiness = /\b(BAIL|BOND|BONDS|LLC|INC|L\.L\.C|CORP|CO|COMPANY|AGENCY|GROUP|SERVICES?)\b/i.test(n)
  if (!looksLikeBusiness && n.includes(',')) {
    const [last, rest] = n.split(',', 2)
    n = `${squish(rest)} ${squish(last)}`.trim()
  }
  // title-case if it's screaming all-caps
  if (n === n.toUpperCase()) {
    n = n.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(/\bLlc\b/i, 'LLC').replace(/\bInc\b/i, 'Inc')
  }
  return n.slice(0, 200)
}

interface Raw {
  name: string
  license: string
  address: string
  city: string
  state: string
  zip: string
  county: string
  email: string
  phone: string | null
  npn: string
}

interface LeadRow {
  facility_name: string
  contact_name: string | null
  phone: string | null
  notes: string
  source: string
  external_id: string
  niche: string
  status: string
}

function buildNotes(members: Raw[]): string {
  const w = members[0]
  const licenses = members.map((m) => m.license).filter(Boolean)
  const emails = [...new Set(members.map((m) => m.email.toLowerCase()).filter(Boolean))]
  const loc = [w.address, [w.city, w.state, w.zip].filter(Boolean).join(', ')].filter(Boolean).join(' — ')
  const bits = [
    `FL DFS licensed bail bond ${members.length > 1 ? `agents (${members.length} licenses)` : 'agent'}.`,
    licenses.length ? `License${licenses.length > 1 ? 's' : ''}: ${licenses.join(', ')}.` : '',
    loc ? `${loc}.` : '',
    w.county ? `${w.county} County.` : '',
    emails.length ? emails.join(' / ') : '',
  ]
  return bits.filter(Boolean).join(' ').slice(0, 900)
}

// business-entity license wins a phone-collision tie, then agency-style name,
// then alphabetical — so facility_name is the most "callable" label.
function pickWinner(members: Raw[]): Raw[] {
  return [...members].sort((a, b) => {
    const ab = a.license.startsWith('B') ? 0 : 1
    const bb = b.license.startsWith('B') ? 0 : 1
    if (ab !== bb) return ab - bb
    const ac = a.name.includes(',') ? 1 : 0
    const bc = b.name.includes(',') ? 1 : 0
    if (ac !== bc) return ac - bc
    return a.name.localeCompare(b.name)
  })
}

async function fetchFlDfsCsv(): Promise<string> {
  const jar = new CookieJar()

  const home = await fetch(`${FLDFS_BASE}/`, { headers: { 'User-Agent': UA } })
  if (!home.ok) throw new Error(`FL DFS home GET ${home.status}`)
  jar.absorb(home)
  const html = await home.text()
  const csrf = html.match(/name="csrf_token"\s+value="([^"]+)"/)?.[1]
  if (!csrf) throw new Error('csrf_token not found on FL DFS home page')

  const form = new URLSearchParams()
  form.set('csrf_token', csrf)
  form.set('LicenseStatusFilter', '1') // Valid
  form.set('LicenseCategoryFilter', '2') // Bail Bonds
  form.set('LicenseeSearchInfo.PagingInfo.CurrentPage', '1')
  form.set('LicenseeSearchInfo.PagingInfo.SortBy', 'Name')
  form.set('LicenseeSearchInfo.PagingInfo.SortDesc', 'false')

  const search = await fetch(`${FLDFS_BASE}/`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: jar.header(),
      Referer: `${FLDFS_BASE}/`,
    },
    body: form.toString(),
  })
  if (!search.ok) throw new Error(`FL DFS search POST ${search.status}`)
  jar.absorb(search)
  const resultsHtml = await search.text()
  const recCount = resultsHtml.match(/of\s+([\d,]+)\s+Records/)?.[1]
  if (!recCount) throw new Error('FL DFS search returned no results table')

  const exp = await fetch(`${FLDFS_BASE}/Home/Export`, {
    headers: { 'User-Agent': UA, Cookie: jar.header(), Referer: `${FLDFS_BASE}/` },
  })
  if (!exp.ok) throw new Error(`FL DFS export GET ${exp.status}`)
  const ct = exp.headers.get('content-type') || ''
  if (!ct.includes('csv')) throw new Error(`FL DFS export returned ${ct}, not csv`)
  const buf = await exp.arrayBuffer()
  return new TextDecoder('windows-1252').decode(buf)
}

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: secretRow } = await admin
    .from('app_secrets')
    .select('value')
    .eq('key', 'cron_secret')
    .single()
  if (!secretRow || req.headers.get('x-cron-secret') !== secretRow.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { dryRun = false } = await req.json().catch(() => ({}))

  try {
    // 1-3. fetch the CSV
    const csv = await fetchFlDfsCsv()
    const rows = parseCsv(csv)
    const hdrIdx = rows.findIndex((r) => r[0] === 'Licensee Name')
    if (hdrIdx < 0) throw new Error('CSV header row not found')
    const dataRows = rows.slice(hdrIdx + 1).filter((r) => r.length >= 7 && r[0]?.trim())

    // 4. normalise
    const raws: Raw[] = dataRows.map((r) => {
      const csz = splitCityStateZip(r[3])
      return {
        name: squish(r[0]),
        license: squish(r[1]),
        address: squish(r[2]),
        city: csz.city,
        state: csz.state,
        zip: csz.zip,
        county: squish(r[4]),
        email: squish(r[5]),
        phone: normPhone(r[6]),
        npn: stripNpn(r[7]),
      }
    })

    // 5. dedupe
    const groups = new Map<string, Raw[]>()
    for (const raw of raws) {
      const key = raw.phone
        ? `p:${raw.phone}`
        : `n:${raw.name.toLowerCase().replace(/[^a-z0-9]/g, '')}|${raw.zip}`
      const g = groups.get(key)
      if (g) g.push(raw)
      else groups.set(key, [raw])
    }

    const leads: LeadRow[] = []
    for (const [key, members] of groups) {
      const ordered = pickWinner(members)
      const w = ordered[0]
      leads.push({
        facility_name: cleanName(w.name),
        contact_name: null,
        phone: w.phone,
        notes: buildNotes(ordered),
        source: SOURCE,
        external_id: `${EXT_PREFIX}:${key}`,
        niche: NICHE,
        status: 'new',
      })
    }

    // 6. diff vs what we've already ingested from this source
    const { data: existing, error: exErr } = await admin
      .from('leads')
      .select('id, external_id, phone, notes')
      .eq('source', SOURCE)
    if (exErr) throw exErr
    const byExt = new Map((existing || []).map((e) => [e.external_id, e]))

    const toInsert: LeadRow[] = []
    const toUpdate: { id: string; phone: string | null; notes: string }[] = []
    for (const lead of leads) {
      const prev = byExt.get(lead.external_id)
      if (!prev) toInsert.push(lead)
      else if (prev.phone !== lead.phone || prev.notes !== lead.notes) {
        toUpdate.push({ id: prev.id, phone: lead.phone, notes: lead.notes })
      }
    }

    const summary = {
      dryRun,
      csvRows: dataRows.length,
      distinctLeads: leads.length,
      alreadyIngested: existing?.length ?? 0,
      toInsert: toInsert.length,
      toUpdate: toUpdate.length,
      inserted: 0,
      updated: 0,
      sample: toInsert.slice(0, 3).map((l) => ({ name: l.facility_name, phone: l.phone })),
    }

    if (dryRun) {
      return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } })
    }

    // 7. write
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      const chunk = toInsert.slice(i, i + INSERT_CHUNK)
      const { error } = await admin.from('leads').insert(chunk)
      if (error) throw error
      summary.inserted += chunk.length
    }
    for (const u of toUpdate) {
      const { error } = await admin
        .from('leads')
        .update({ phone: u.phone, notes: u.notes })
        .eq('id', u.id)
      if (error) throw error
      summary.updated += 1
    }

    return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
