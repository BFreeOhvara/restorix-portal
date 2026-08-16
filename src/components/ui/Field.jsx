export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

export function inputClass(extra = '') {
  return `w-full rounded-lg border border-line bg-base px-3 py-2 font-sans text-sm text-fg-primary outline-none focus:border-accent ${extra}`
}
