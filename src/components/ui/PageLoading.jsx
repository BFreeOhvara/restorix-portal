import { Loader2 } from 'lucide-react'

// Prompt 631 — full-page loading state. Used only where a page's *entire*
// render is the loading branch; in-box/table loading cells stay as-is.
// Prompt 632 — bigger + white. Plain white is ~1.2:1 against light bg-base
// (#e5ecea) and all but vanishes, so light mode gets a soft drop-shadow to
// outline the ring; dark mode doesn't need it. Height is the visible area
// below the h-16 header minus main's py-8 (4rem + 2×2rem), so the spinner
// sits at the true middle of the screen, not the middle of a shorter box.
export function PageLoading() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center gap-4">
      <Loader2
        size={88}
        className="animate-spin text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] dark:drop-shadow-none"
      />
      <p className="font-sans text-sm font-semibold text-fg-secondary">Loading…</p>
    </div>
  )
}
