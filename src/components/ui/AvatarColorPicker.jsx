import { Check } from 'lucide-react'
import { AVATAR_COLORS } from './Avatar'

// Prompt 491 — new for Restorix, not ported from Ohvara: when no photo is
// set, the initials fallback gets a pastel color the user picks themselves
// and that persists (not re-randomized per render/session, same durability
// as Ohvara's own avatar_color — just user-chosen here instead of
// assigned-once-at-signup).
export function AvatarColorPicker({ value, onChange, disabled }) {
  return (
    <div className="flex items-center gap-2">
      {Object.entries(AVATAR_COLORS).map(([key, hex]) => {
        const selected = value === key
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(key)}
            aria-label={`${key} avatar color`}
            aria-pressed={selected}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: hex,
              boxShadow: selected ? '0 0 0 2px var(--bg-elevated), 0 0 0 4px var(--accent)' : 'none',
            }}
          >
            {selected && <Check size={13} className="text-fg-primary" strokeWidth={3} />}
          </button>
        )
      })}
    </div>
  )
}
