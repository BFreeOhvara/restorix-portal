import { createClient } from '@supabase/supabase-js'

// The anon key is a public, RLS-scoped credential by design (Supabase's own
// model) — safe to ship in client code, same as any Vite VITE_ env var would
// end up baked into the bundle anyway. Hardcoded rather than env-var-based
// so this deploys without needing Vercel project env config.
export const SUPABASE_URL = 'https://avgvmzshujwphneykuvu.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2Z3ZtenNodWp3cGhuZXlrdXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MjUyMTksImV4cCI6MjEwMjQwMTIxOX0.VvOmZwo_rkAnueE2t8vMtxpR4MHf3Xz7ei-TWtWtAbg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
