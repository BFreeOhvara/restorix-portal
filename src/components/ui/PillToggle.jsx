import clsx from 'clsx'

// Prompt 536 — same visual pattern as My Goals' own Daily/Weekly/Monthly
// toggle (MyGoals.jsx), pulled out here so Stats' new Daily/Monthly/All
// Time toggle matches it exactly rather than re-guessing the classes.
export function PillToggle({ options, active, onChange }) {
  return (
    <div className="flex gap-1 rounded-full border border-line bg-elevated p-1">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={clsx(
            'rounded-full px-3 py-1 font-sans text-xs font-medium transition-colors',
            active === opt.key ? 'bg-accent text-white' : 'text-fg-secondary hover:text-fg-primary'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
