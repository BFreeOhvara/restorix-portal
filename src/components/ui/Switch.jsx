import clsx from 'clsx'

// Prompt 619 — first toggle-switch primitive in the app (Notifications /
// Call & Booking preferences on Settings). No prior Switch component
// existed anywhere to reuse; kept intentionally small — a plain on/off
// pill, same accent/border-line tokens every other control already uses.
export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-line'
      )}
    >
      <span
        className={clsx(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  )
}
