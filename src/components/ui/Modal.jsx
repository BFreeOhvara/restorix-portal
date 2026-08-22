import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, onClose, children, width = 'max-w-md' }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Prompt 531 — backdrop was `bg-fg-primary/30`, a theme-relative color
  // (--text-primary) used as a dimming tint. That inverts in dark mode:
  // --text-primary is near-white there, so the "dim" layer actually
  // lightens the page behind the modal instead of darkening it — the
  // real, token-math-confirmed cause of the flat/undimmed look Brayden
  // flagged, not a guess. Switched to a fixed black scrim (same `bg-black/*`
  // pattern Profile.jsx's own avatar-hover overlay already uses elsewhere
  // in this app), which darkens correctly in both themes. Panel border
  // upgraded from `border-line` (--border, ~14% opacity) to the already-
  // defined but previously-unused `--border-strong` (~22%, Prompt 501/502)
  // — a real design-system token, not a new hardcoded color — so the
  // panel reads as more clearly bounded against the new darker backdrop.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className={`w-full ${width} rounded-card border border-line-strong bg-elevated p-6 shadow-2xl`}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium text-fg-primary">{title}</h2>
          <button onClick={onClose} className="text-fg-faint hover:text-fg-primary">
            <X size={20} />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}
