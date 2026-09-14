import clsx from 'clsx'

// Prompt 535 reopen round 3 — this was originally Training.jsx's own
// inline top-level tab row; pulled out here so Pipeline's top-level
// Unassigned/Setter/Closer tabs can reuse the exact same component rather
// than duplicating the class string, per Brayden's explicit ask to match
// Training's look. Rectangular/slightly-rounded-corner segmented look —
// deliberately distinct from the full-pill treatment StatusBadge's
// STATUS_TINT/SOLID chips use for sub-tab filter rows elsewhere on these
// same pages, which this component does not touch or replace.
// Prompt 589 — opt-in `variant="grouped"` renders one continuous bordered
// pill container instead of separately-bordered buttons with a gap. Default
// (no variant) is unchanged for every existing call site — Training.jsx,
// Pipeline.jsx's niche/outcome tabs all keep rendering exactly as before.
// Prompt 590 — 589 borrowed ColoredPillGroup's fully-round, row-stretching
// shell wholesale, but Brayden only wanted the "grouped into one bordered
// box" idea, not the pill roundness or the full-width stretch. Corners
// match the plain variant's own `rounded-lg` instead of `rounded-full`, and
// the container sizes to its own content (`inline-flex`) instead of
// spanning the row (`flex` inside a block-level parent stretches full width).
export function SegmentedTabs({ tabs, active, onChange, variant }) {
  if (variant === 'grouped') {
    return (
      <div className="inline-flex gap-1 rounded-lg border border-line bg-elevated p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={clsx(
              'rounded-lg px-3 py-1.5 font-sans text-sm transition-colors',
              active === t.key
                ? 'bg-accent text-white'
                : 'text-fg-secondary hover:text-fg-primary'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    )
  }

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
