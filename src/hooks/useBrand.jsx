import { createContext, useContext, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Prompt 549 — one shared codebase/deployment serves both niches; which
// brand renders is decided at runtime by the hostname the app loaded from
// (portal.restorix.co → Restorix Sustain / behavioral health,
// portal.suretix.co → Suretix / bail bonds), with a ?brand= query-param
// override for previewing before the second domain's DNS exists.
//
// `niche_brands` is the source of truth, but its RLS is authenticated-only,
// so this static map is the pre-auth fallback (Login/Join render before any
// session exists) AND the "hostname matched nothing" default (localhost,
// Vercel preview URLs). Keep the two entries in sync with the niche_brands
// rows — brand_name/domains especially. `wordmark` is deliberately NOT the
// DB brand_name: behavioral health's portal header must stay pixel-
// identical to its pre-Prompt-549 hardcoded "Restorix Portal" text.
export const BRAND_FALLBACK = {
  behavioral_health: {
    niche: 'behavioral_health',
    brand_name: 'Restorix Sustain',
    wordmark: 'Restorix Portal',
    portal_domain: 'portal.restorix.co',
    marketing_domain: 'restorix.co',
    logo_url: '/logo-icon.png',
  },
  bail_bonds: {
    niche: 'bail_bonds',
    brand_name: 'Suretix',
    wordmark: 'Suretix Portal',
    // No real Suretix logo yet — render the plain-text wordmark alone until
    // Brayden supplies brand assets (Prompt 549).
    portal_domain: 'portal.suretix.co',
    marketing_domain: 'suretix.co',
    logo_url: null,
  },
}

const DEFAULT_NICHE = 'behavioral_health'

// Per-niche portal header text. Kept here (not read from niche_brands)
// specifically so behavioral health stays byte-identical to the old
// hardcoded string; Suretix follows the same "<Brand> Portal" shell.
const WORDMARK = {
  behavioral_health: 'Restorix Portal',
  bail_bonds: 'Suretix Portal',
}

// ?brand=bail_bonds (or =behavioral_health) forces a brand regardless of
// hostname — how Brayden previews Suretix on portal.restorix.co / localhost
// before portal.suretix.co exists. Persisted to sessionStorage so it
// survives in-app navigation (react-router drops the query string on most
// link clicks) and hard reloads within the tab. ?brand=none clears it.
function resolveOverride() {
  try {
    const raw = new URLSearchParams(window.location.search).get('brand')
    if (raw === 'none' || raw === '') {
      sessionStorage.removeItem('brand-override')
      return null
    }
    if (raw && BRAND_FALLBACK[raw]) {
      sessionStorage.setItem('brand-override', raw)
      return raw
    }
    const stored = sessionStorage.getItem('brand-override')
    if (stored && BRAND_FALLBACK[stored]) return stored
  } catch {
    // sessionStorage unavailable (private mode / blocked) — fall through.
  }
  return null
}

const BrandContext = createContext(null)

export function BrandProvider({ children }) {
  // Re-resolve when the query string changes (so ?brand= takes effect on
  // in-app navigation too, not only a full page load).
  const { search } = useLocation()
  const { data: rows } = useQuery({
    queryKey: ['niche-brands'],
    queryFn: async () => {
      const { data, error } = await supabase.from('niche_brands').select('*')
      if (error) throw error
      return data
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  })

  const brand = useMemo(() => {
    const forced = resolveOverride()
    const host = window.location.hostname
    const source = rows?.length ? rows : Object.values(BRAND_FALLBACK)
    const niche =
      forced ||
      source.find((r) => r.portal_domain === host)?.niche ||
      DEFAULT_NICHE
    const dbRow = (rows || []).find((r) => r.niche === niche)
    const base = dbRow || BRAND_FALLBACK[niche] || BRAND_FALLBACK[DEFAULT_NICHE]
    return {
      ...BRAND_FALLBACK[niche], // guarantees wordmark/logo_url keys even off a DB row
      ...base,
      niche,
      wordmark: WORDMARK[niche] || base.brand_name,
    }
  }, [rows, search])

  // data-brand on <html>, parallel to how ThemeProvider toggles `.dark`.
  // behavioral health removes the attribute so the :root / .dark palette in
  // index.css is the untouched Restorix default; suretix gets the amber
  // overrides under [data-brand="suretix"].
  useEffect(() => {
    const el = document.documentElement
    if (brand.niche === 'bail_bonds') el.setAttribute('data-brand', 'suretix')
    else el.removeAttribute('data-brand')
    document.title = brand.wordmark
    // theme-color meta (mobile browser chrome) — static in index.html, so
    // update it at runtime to the brand's light --accent. Matches the
    // index.css [data-brand] values.
    const themeMeta = document.querySelector('meta[name="theme-color"]')
    if (themeMeta) themeMeta.setAttribute('content', brand.niche === 'bail_bonds' ? '#b45309' : '#3a63d6')
  }, [brand.niche, brand.wordmark])

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
}

export function useBrand() {
  const ctx = useContext(BrandContext)
  if (!ctx) throw new Error('useBrand must be used inside BrandProvider')
  return ctx
}
