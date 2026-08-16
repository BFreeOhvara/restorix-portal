import clsx from 'clsx'

export function Button({ children, variant = 'primary', className, ...props }) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-sans text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-deep',
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
