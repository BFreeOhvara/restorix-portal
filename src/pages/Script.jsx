// Plain-text content area — Brayden edits SCRIPT_SECTIONS directly to update
// call scripts. No generation or CMS, per spec (Prompt 433).
const SCRIPT_SECTIONS = []

export default function Script() {
  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Script</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">Call scripts for setters to reference</p>

      <div className="mt-6 space-y-4">
        {!SCRIPT_SECTIONS.length ? (
          <div className="rounded-card border border-line bg-elevated p-8 text-center">
            <p className="font-sans text-sm text-fg-secondary">No scripts added yet.</p>
          </div>
        ) : (
          SCRIPT_SECTIONS.map((section) => (
            <div key={section.title} className="rounded-card border border-line bg-elevated p-5">
              <h3 className="font-display text-lg font-medium text-fg-primary">{section.title}</h3>
              <p className="mt-2 whitespace-pre-wrap font-sans text-sm text-fg-secondary">{section.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
