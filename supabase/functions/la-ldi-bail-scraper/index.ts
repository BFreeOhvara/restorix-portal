// ============================================================
// la-ldi-bail-scraper — Louisiana bail-bonds lead source (Prompt 577), the
// first of three planned bail_bonds expansions (Central → Mountain →
// Pacific) meant to give closers a live pool in a different time zone than
// fl-dfs-bail-scraper's Florida (Eastern) leads. Same niche = 'bail_bonds',
// different source/state, modeled directly on fl-dfs-bail-scraper.
//
// The source: Louisiana Dept of Insurance (LDI) publishes a standing,
// direct-download report of every LDI-licensed Bail Bond producer at
// https://www.ldi.la.gov/LicenseeReports/ProducersBailBond.xls — public
// record (LA licensee data is public same as FL's Ch. 119 basis), part of
// LDI's Producer/Adjuster Licensee Report system
// (ldi.la.gov/industry/producer-adjuster/search-for-producers-and-adjusters/producer-adjuster-licensee-report).
//
// Confirmed live (the two things the spec flagged as unverifiable from a
// network-blocked sandbox):
//   1. Genuinely static, no-auth, direct URL — a plain GET returns 200
//      immediately, no cookie/CSRF/search handshake at all. FL's whole
//      CookieJar + csrf_token + POST-search dance has no LA equivalent.
//   2. Despite the .xls extension and an `application/vnd.ms-excel`
//      content-type, the actual bytes are plain ASCII, tab-delimited text
//      (`file` reports "ASCII text, CRLF terminators", 0 non-ASCII bytes in
//      a 472KB sample) — not a real binary spreadsheet. No SheetJS/npm:xlsx
//      needed; it parses exactly like FL's CSV, just split on \t not `,`,
//      and with no quoting to worry about (0 embedded quotes/tabs in any
//      field across every row sampled). Real header row, left-to-right:
//      LicenseNumber, Npn, First Name, Middle Name, Last Name, Name, Phone,
//      Street, City, State, PostalCode, ProducerType, Authority,
//      AuthorityCode, LicenseDate, LicenseAuthorityExpirationDate,
//      InsuranceCompanyName, CoCode, ApptDate, ApptExpirationDate, Type.
//      City/State/PostalCode are already separate columns (no FL-style
//      combined "CITY, ST, ZIP" string to split), and `Name` is already
//      display-ready ("Jon Julius Haddad Jr" for individuals, the business
//      name verbatim for agencies) rather than FL's ALL-CAPS "LAST, FIRST"
//      — cleanName is reused as a safety net (handles the odd shouting
//      agency name) but rarely needs to actually change anything here.
//
// Business-vs-individual: LA has no FL-style "B####" license-number prefix
// (every LicenseNumber here is plain digits). The real signal is
// `ProducerType`: 'Producer Agency' (business, 347 of 2124 rows sampled) vs
// 'Producer' (individual, 1777 rows) — same role as FL's prefix check in
// pickWinner, different field.
//
// State filter: the report includes a small nonresident slice (~1.5% of
// rows sampled) licensed by LDI but physically addressed in AK/GA/MN/MS/
// NJ/OK/TX/VA — other states' bail agents who also hold an LA license.
// Included, they'd defeat this prompt's entire point (a NJ/VA producer is
// Eastern, the exact zone this prompt exists to diversify away from; the
// others aren't Central either and aren't part of the stated 3-phase plan).
// Filtered to State === 'LA' so this source stays what its name says: a
// Louisiana, Central-time lead pool.
//
// Dedup: one lead per normalised phone (an agency's office line is often
// shared by several individually-licensed producers plus the agency's own
// "Producer Agency" license — pickWinner's agency-wins tie-break resolves
// that group to the agency as the callable name, same shape as FL); a
// phone-less row falls back to normalised name + zip. external_id
// namespaces on `la_ldi_bail:` so a re-run diffs cleanly.
//
// Not a passive top-up — same shared-unassigned-pool model as
// fl-dfs-bail-scraper/samhsa-scraper. A closer pulls bail_bonds leads via
// request_closer_leads(_, 'bail_bonds') and may now get LA facilities
// alongside FL ones from the same pool — no timezone-aware
// sorting/prioritization here, that's a separate not-yet-queued follow-up.
//
// verify_jwt is off — same shared x-cron-secret pattern (app_secrets) as
// every other scraper/cron-invoked function in this project.
//
// Deploy:
//   supabase functions deploy la-ldi-bail-scraper --no-verify-jwt --project-ref avgvmzshujwphneykuvu
//
// Invoke:
//   POST { }               → real run (fetch, dedup, diff, insert/update)
//   POST { "dryRun": true } → everything except the writes; returns counts
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js'

const LDI_URL = 'https://www.ldi.la.gov/LicenseeReports/ProducersBailBond.xls'
const SOURCE = 'la_ldi'
const NICHE = 'bail_bonds'
const EXT_PREFIX = 'la_ldi_bail'
const INSERT_CHUNK = 500

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// --- tab-delimited parse --------------------------------------------------
// The file has no quoting/escaping at all (0 embedded tabs or quote chars
// across every field sampled) — a plain split is safe, unlike FL's
// quote-aware CSV parser.
function parseTsv(text: string): string[][] {
  return text
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t'))
}

// --- field helpers (squish/normPhone/cleanName reused verbatim from
// fl-dfs-bail-scraper — generic string cleanup, nothing FL-specific) -------
const squish = (s: string) => (s || '').replace(/\s+/g, ' ').trim()

// "3182213800101", "13182680702" → "3182680702" | null. Same conservative
// shape as FL's normPhone: strip a leading country-code 1 off an 11-digit
// run, otherwise require exactly 10 digits or give up (a handful of rows
// in the live data carry malformed 12-13 digit phone strings — those
// correctly fall through to the name+zip dedup fallback rather than
// producing a wrong number).
function normPhone(raw: string): string | null {
  if (!raw) return null
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  return d.length === 10 ? d : null
}

// "701197339" → "70119-7339"; "71201" → "71201" as-is; anything else
// (rare, non-US-zip-shaped junk) passed through unchanged — this only ever
// feeds a dedup-fallback key and a notes string, never a real mailing use.
function normZip(raw: string): string {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`
  return d || squish(raw)
}

// ALL-CAPS / "LAST, FIRST" → readable. Leaves business names alone. Ported
// verbatim from fl-dfs-bail-scraper; LA's `Name` column is already
// display-ready for the common case, this is just a safety net for the odd
// shouting agency name ("AAA BAIL SERVICE INC").
function cleanName(raw: string): string {
  let n = squish(raw).replace(/^[^A-Za-z0-9]+/, '')
  if (!n) n = squish(raw)
  const looksLikeBusiness = /\b(BAIL|BOND|BONDS|LLC|INC|L\.L\.C|CORP|CO|COMPANY|AGENCY|GROUP|SERVICES?)\b/i.test(n)
  if (!looksLikeBusiness && n.includes(',')) {
    const [last, rest] = n.split(',', 2)
    n = `${squish(rest)} ${squish(last)}`.trim()
  }
  if (n === n.toUpperCase()) {
    n = n.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(/\bLlc\b/i, 'LLC').replace(/\bInc\b/i, 'Inc')
  }
  return n.slice(0, 200)
}

interface Raw {
  name: string
  license: string
  isAgency: boolean
  address: string
  city: string
  state: string
  zip: string
  phone: string | null
  insuranceCo: string
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
  const licenses = [...new Set(members.map((m) => m.license).filter(Boolean))]
  const insurers = [...new Set(members.map((m) => m.insuranceCo).filter(Boolean))]
  const loc = [w.address, [w.city, w.state, w.zip].filter(Boolean).join(', ')].filter(Boolean).join(' — ')
  const bits = [
    `LA LDI licensed bail bond ${members.length > 1 ? `producers (${members.length} on this line)` : w.isAgency ? 'agency' : 'agent'}.`,
    licenses.length ? `License${licenses.length > 1 ? 's' : ''}: ${licenses.join(', ')}.` : '',
    loc ? `${loc}.` : '',
    insurers.length ? `Surety: ${insurers.slice(0, 3).join(', ')}${insurers.length > 3 ? '…' : ''}.` : '',
  ]
  return bits.filter(Boolean).join(' ').slice(0, 900)
}

// Agency license wins a phone-collision tie (a shared office line with
// several individually-licensed producers should read as the agency, the
// most "callable" label) — same role FL's "B" prefix check plays, keyed
// off ProducerType instead since LA license numbers carry no such prefix.
function pickWinner(members: Raw[]): Raw[] {
  return [...members].sort((a, b) => {
    const aa = a.isAgency ? 0 : 1
    const bb = b.isAgency ? 0 : 1
    if (aa !== bb) return aa - bb
    return a.name.localeCompare(b.name)
  })
}

async function fetchLdiTsv(): Promise<string> {
  const res = await fetch(LDI_URL, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`LDI GET ${res.status}`)
  return await res.text()
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
    // 1. fetch the report (single static GET, no handshake)
    const tsv = await fetchLdiTsv()
    const rows = parseTsv(tsv)
    const hdrIdx = rows.findIndex((r) => r[0] === 'LicenseNumber')
    if (hdrIdx < 0) throw new Error('TSV header row not found')
    const dataRows = rows.slice(hdrIdx + 1).filter((r) => r.length >= 21 && r[0]?.trim())

    // 2. normalise, LA-resident only (see file header comment)
    const raws: Raw[] = dataRows
      .map((r) => ({
        license: squish(r[0]),
        name: squish(r[5]),
        isAgency: squish(r[11]) === 'Producer Agency',
        address: squish(r[7]),
        city: squish(r[8]),
        state: squish(r[9]),
        zip: normZip(r[10]),
        phone: normPhone(r[6]),
        insuranceCo: squish(r[16]),
      }))
      .filter((raw) => raw.state === 'LA')

    // 3. dedupe
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

    // 4. diff vs what we've already ingested from this source.
    const existing: { id: string; external_id: string; phone: string | null; notes: string }[] = []
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from('leads')
        .select('id, external_id, phone, notes')
        .eq('source', SOURCE)
        .range(from, from + PAGE - 1)
      if (error) throw error
      existing.push(...(data || []))
      if (!data || data.length < PAGE) break
    }
    const byExt = new Map(existing.map((e) => [e.external_id, e]))

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
      tsvRows: dataRows.length,
      laRows: raws.length,
      distinctLeads: leads.length,
      alreadyIngested: existing.length,
      toInsert: toInsert.length,
      toUpdate: toUpdate.length,
      inserted: 0,
      updated: 0,
      sample: toInsert.slice(0, 3).map((l) => ({ name: l.facility_name, phone: l.phone })),
    }

    if (dryRun) {
      return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } })
    }

    // 5. write
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
