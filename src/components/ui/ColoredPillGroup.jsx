import clsx from 'clsx'

// Prompt 583 — PillToggle's grouped-box shell (a single `rounded-full`
// bordered container, buttons inside), but each segment keeps its OWN
// status/outcome colour: its tint class when unselected, its solid class
// when selected — not PillToggle's one shared accent-blue "active" look.
// Used by both My Pipeline sub-tabs (the Closer outcome filter and the
// embedded Setter status filter) so the markup lives in one place.
//
// `options`: [{ key, label, tint, solid }] — tint/solid are the same
// class strings STATUS_TINT/STATUS_SOLID (StatusBadge.jsx) and
// OUTCOME_TINT/OUTCOME_SOLID (OutcomeBadge.jsx) already use everywhere.
export function ColoredPillGroup({ options, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-full border border-line bg-elevated p-1">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={clsx(
            'eyebrow rounded-full px-3 py-1.5 transition-colors hover:opacity-85',
            active === opt.key ? opt.solid : opt.tint
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
