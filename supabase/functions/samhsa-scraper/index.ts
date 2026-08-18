import { createClient } from 'npm:@supabase/supabase-js'

// Prompt 463 — nationwide SAMHSA facility scraper. Not user-facing: a weekly
// pg_cron job kicks off a run (newRun:true), and a separate frequent tick
// job drives it forward batch by batch until anchors_done reaches the grid
// size (see migrations samhsa_scraper_infra, samhsa_scraper_tick_cron).
// Both authenticate via a shared secret in app_secrets, checked below.
// verify_jwt is off since the caller is pg_cron/net.http_post, not a user.

const FINDTREATMENT_BASE = 'https://findtreatment.gov/locator/exportsAsJson/v2'
const RADIUS_MILES = 100
const RADIUS_METERS = RADIUS_MILES * 1609.344
const PAGE_SIZE = 500
const REQUEST_DELAY_MS = 200 // courtesy throttle against a public gov API

// Continental US bounding box, grid-generated at runtime (not hardcoded
// point-by-point) so the spacing/radius tradeoff is easy to retune later.
// Step is 1.5x the search radius so adjacent circles overlap generously —
// any facility landing in more than one anchor's radius is harmless, since
// upsert_samhsa_lead dedupes on external_id regardless of which anchor found it.
const CONTINENTAL_US = { minLat: 25.0, maxLat: 49.0, minLon: -124.7, maxLon: -66.9 }
const OUTLYING_ANCHORS = [
  { lat: 61.2181, lon: -149.9003 }, // Anchorage, AK
  { lat: 64.8378, lon: -147.7164 }, // Fairbanks, AK
  { lat: 58.3019, lon: -134.4197 }, // Juneau, AK
  { lat: 21.3069, lon: -157.8583 }, // Honolulu, HI
  { lat: 19.7297, lon: -155.0900 }, // Hilo, HI
  { lat: 18.4655, lon: -66.1057 },  // San Juan, PR
]

function buildAnchorGrid() {
  const anchors: { lat: number; lon: number }[] = []
  const stepMiles = RADIUS_MILES * 1.5
  const latStepDeg = stepMiles / 69.0
  for (let lat = CONTINENTAL_US.minLat; lat <= CONTINENTAL_US.maxLat; lat += latStepDeg) {
    const milesPerLonDeg = 69.0 * Math.cos((lat * Math.PI) / 180)
    const lonStepDeg = stepMiles / milesPerLonDeg
    for (let lon = CONTINENTAL_US.minLon; lon <= CONTINENTAL_US.maxLon; lon += lonStepDeg) {
      anchors.push({ lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) })
    }
  }
  anchors.push(...OUTLYING_ANCHORS)
  return anchors
}

const ANCHORS = buildAnchorGrid()

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// exportsAsJson/v2 (the documented, third-party-facing endpoint per SAMHSA's
// own API Access Request Form) exposes no facility ID field at all — only
// the site's internal, undocumented /locator/listing endpoint has one
// (`frid`), and tying production ingestion to an undocumented endpoint is
// the wrong tradeoff for a weekly recurring pull. Per the prompt's own
// fallback ("facility name + phone, or SAMHSA's own facility ID if the API
// exposes one"), dedup instead on a normalized name+street+zip composite —
// more stable than name+phone alone, since phone numbers are exactly the
// field this scraper expects to change over time on re-pulls.
function externalIdFor(name: string, street1: string, zip: string) {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${norm(name)}|${norm(street1)}|${norm(zip)}`
}

async function fetchAnchorFacilities(lat: number, lon: number, debug?: { lastStatus?: number; lastBody?: string }) {
  const facilities: { externalId: string; name: string; phone: string | null; city: string; state: string }[] = []
  let page = 1
  let totalPages = 1
  do {
    const url = new URL(FINDTREATMENT_BASE)
    url.searchParams.set('sType', 'BOTH')
    url.searchParams.set('sAddr', `${lat},${lon}`)
    url.searchParams.set('limitType', '2')
    url.searchParams.set('limitValue', String(RADIUS_METERS))
    url.searchParams.set('pageSize', String(PAGE_SIZE))
    url.searchParams.set('page', String(page))
    url.searchParams.set('sort', '0')

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    })
    if (debug) debug.lastStatus = res.status
    if (!res.ok) break
    const bodyText = await res.text()
    if (debug) debug.lastBody = bodyText.slice(0, 300)
    const data = JSON.parse(bodyText)
    if (!data || !Array.isArray(data.rows)) break

    totalPages = data.totalPages || 1
    for (const row of data.rows) {
      if (!row.name1 || !row.street1) continue
      const name = row.name2 ? `${row.name1} — ${row.name2}` : row.name1
      facilities.push({
        externalId: externalIdFor(row.name1, row.street1, row.zip || ''),
        name,
        phone: row.phone || null,
        city: row.city,
        state: row.state,
      })
    }
    page += 1
    if (page <= totalPages) await sleep(REQUEST_DELAY_MS)
  } while (page <= totalPages)
  return facilities
}

// Optional freshness check — never fabricated, gracefully skipped if
// GOOGLE_PLACES_API_KEY isn't set (matches the Twilio-secrets precedent:
// feature silently activates once Brayden sets the key, no code change
// needed). Returns null (no signal) on any failure or missing key rather
// than blocking the insert.
async function checkGooglePlacesFreshness(name: string, city: string, state: string) {
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')
  if (!apiKey) return null
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.businessStatus,places.nationalPhoneNumber',
      },
      body: JSON.stringify({ textQuery: `${name}, ${city}, ${state}` }),
    })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    const place = data?.places?.[0]
    if (!place) return null
    return {
      closed: place.businessStatus === 'CLOSED_PERMANENTLY' || place.businessStatus === 'CLOSED_TEMPORARILY',
      phone: place.nationalPhoneNumber || null,
    }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: secretRow } = await adminClient
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

  const {
    offset: explicitOffset,
    batchSize = 8,
    newRun = false,
    debugLat,
    debugLon,
    listAnchorsFrom,
  } = await req.json().catch(() => ({}))

  if (debugLat !== undefined && debugLon !== undefined) {
    const debug: { lastStatus?: number; lastBody?: string } = {}
    const facilities = await fetchAnchorFacilities(debugLat, debugLon, debug)
    return new Response(JSON.stringify({ debug, facilitiesFound: facilities.length, sample: facilities.slice(0, 2) }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (listAnchorsFrom !== undefined) {
    return new Response(JSON.stringify({ anchors: ANCHORS.slice(listAnchorsFrom, listAnchorsFrom + 6), total: ANCHORS.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // No self-chaining fire-and-forget fetch (unreliable — the background
  // fetch didn't reliably survive past the response in this runtime, and
  // the run silently stalled mid-grid). Instead a frequent pg_cron tick
  // (samhsa-scraper-tick, see migration) drives the loop: each tick calls
  // with no offset, and this reads scraper_state.anchors_done as the
  // resume point, so the run self-resumes across independent, reliable
  // cron-triggered invocations rather than one function chaining itself.
  let offset = explicitOffset
  if (offset === undefined) {
    const { data: state } = await adminClient.from('scraper_state').select('anchors_done, run_started_at, run_completed_at').eq('id', true).single()
    if (!state?.run_started_at || state.run_completed_at) {
      return new Response(JSON.stringify({ skipped: 'no active run' }), { headers: { 'Content-Type': 'application/json' } })
    }
    offset = state.anchors_done
  }

  const batch = ANCHORS.slice(offset, offset + batchSize)

  if (newRun) {
    await adminClient.from('scraper_state').update({
      run_started_at: new Date().toISOString(),
      run_completed_at: null,
      anchors_total: ANCHORS.length,
      anchors_done: 0,
      facilities_seen: 0,
      facilities_inserted: 0,
      facilities_updated: 0,
      facilities_skipped_closed: 0,
      last_error: null,
    }).eq('id', true)
  }

  let seen = 0, inserted = 0, updated = 0, skippedClosed = 0
  let batchError: string | null = null

  // Collect every anchor's facilities first, then do ONE bulk upsert for the
  // whole batch — the original per-facility RPC loop (one round-trip per
  // facility) hit WORKER_RESOURCE_LIMIT on dense metro anchors with
  // thousands of facilities each; a single set-based SQL statement handles
  // the same volume in one call instead of thousands of sequential ones.
  try {
    const allFacilities: { externalId: string; name: string; phone: string | null }[] = []
    for (const anchor of batch) {
      const facilities = await fetchAnchorFacilities(anchor.lat, anchor.lon)
      for (const f of facilities) {
        seen += 1
        const freshness = await checkGooglePlacesFreshness(f.name, f.city, f.state)
        if (freshness?.closed) {
          skippedClosed += 1
          continue
        }
        allFacilities.push({ externalId: f.externalId, name: f.name, phone: freshness?.phone || f.phone })
      }
    }
    if (allFacilities.length > 0) {
      const { data: result, error } = await adminClient.rpc('bulk_upsert_samhsa_leads', {
        p_facilities: allFacilities,
      })
      if (error) throw error
      const row = Array.isArray(result) ? result[0] : result
      inserted = row?.inserted_count || 0
      updated = row?.updated_count || 0
    }
  } catch (err) {
    batchError = err instanceof Error ? err.message : String(err)
  }

  const { data: current } = await adminClient.from('scraper_state').select('*').eq('id', true).single()
  const nextOffset = offset + batchSize
  const isLastBatch = nextOffset >= ANCHORS.length

  await adminClient.from('scraper_state').update({
    anchors_done: (current?.anchors_done || 0) + batch.length,
    facilities_seen: (current?.facilities_seen || 0) + seen,
    facilities_inserted: (current?.facilities_inserted || 0) + inserted,
    facilities_updated: (current?.facilities_updated || 0) + updated,
    facilities_skipped_closed: (current?.facilities_skipped_closed || 0) + skippedClosed,
    run_completed_at: isLastBatch ? new Date().toISOString() : null,
    last_error: batchError,
  }).eq('id', true)

  return new Response(
    JSON.stringify({ offset, batchSize, anchorsProcessed: batch.length, seen, inserted, updated, skippedClosed, isLastBatch, totalAnchors: ANCHORS.length }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
