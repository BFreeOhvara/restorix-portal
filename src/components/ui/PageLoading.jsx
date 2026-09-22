import { Loader2 } from 'lucide-react'

// Prompt 631 — full-page loading state. Used only where a page's *entire*
// render is the loading branch; in-box/table loading cells stay as-is.
export function PageLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Loader2 size={44} className="animate-spin text-accent" />
      <p className="font-sans text-sm text-fg-secondary">Loading…</p>
    </div>
  )
}
