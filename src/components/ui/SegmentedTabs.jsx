import clsx from 'clsx'

// Prompt 535 reopen round 3 — this was originally Training.jsx's own
// inline top-level tab row; pulled out here so Pipeline's top-level
// Unassigned/Setter/Closer tabs can reuse the exact same component rather
// than duplicating the class string, per Brayden's explicit ask to match
// Training's look. Rectangular/slightly-rounded-corner segmented look —
// deliberately distinct from the full-pill treatment StatusBadge's
// STATUS_TINT/SOLID chips use for sub-tab filter rows elsewhere on these
// same pages, which this component does not touch or replace.
export function SegmentedTabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-2">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={clsx(
            'rounded-lg border px-3 py-2 font-sans text-sm transition-colors',
            active === t.key
              ? 'border-accent bg-accent text-white'
              : 'border-line bg-base text-fg-secondary hover:border-fg-primary/40'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
