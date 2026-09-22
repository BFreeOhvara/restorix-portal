import clsx from 'clsx'

// Prompt 536 — same visual pattern as My Goals' own Daily/Weekly/Monthly
// toggle (MyGoals.jsx), pulled out here so Stats' new Daily/Monthly/All
// Time toggle matches it exactly rather than re-guessing the classes.
// Prompt 625 — extended (not forked) for Settings' tab bar: an optional
// per-option `disabled` flag (locked segment, e.g. Security — unclickable,
// can still carry an `icon`/`badge`) and an optional `stretch` prop (equal-
// width segments filling the container, vs. the default shrink-to-content).
// Neither existing caller (Stats, My Goals via MyGoals.jsx, Training) passes
// either, so their rendering is unchanged.
export function PillToggle({ options, active, onChange, stretch = false }) {
  return (
    <div className={clsx('flex gap-1 rounded-full border border-line bg-elevated p-1', stretch && 'w-full')}>
      {options.map((opt) => {
        const Icon = opt.icon
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => !opt.disabled && onChange(opt.key)}
            disabled={opt.disabled}
            className={clsx(
              'flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 font-sans text-xs font-medium transition-colors',
              stretch && 'flex-1',
              opt.disabled
                ? 'cursor-not-allowed text-fg-faint'
                : active === opt.key
                  ? 'bg-accent text-white'
                  : 'text-fg-secondary hover:text-fg-primary'
            )}
          >
            {Icon && <Icon size={14} />}
            {opt.label}
            {opt.badge}
          </button>
        )
      })}
    </div>
  )
}
