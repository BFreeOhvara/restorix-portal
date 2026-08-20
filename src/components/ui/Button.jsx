import clsx from 'clsx'

export function Button({ children, variant = 'primary', className, ...props }) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-sans text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        // dark:hover:bg-accent-bright, not accent-deep — accent-deep flips
        // to a light color in dark mode (Prompt 502, so it stays legible
        // as `.eyebrow`/badge text on dark cards), which would make this
        // hover state lighten toward white instead of darken. A primary
        // button on a dark page should still pop brighter on hover, so
        // accent-bright (already the lighter end of the accent ramp in
        // both themes) is the correct direction here, not a workaround.
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-deep dark:hover:bg-accent-bright',
        variant === 'secondary' && 'border border-line bg-elevated text-fg-primary hover:border-fg-primary/40',
        variant === 'ghost' && 'text-fg-secondary hover:text-fg-primary',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
