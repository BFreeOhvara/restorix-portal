// Plain-text content area — Brayden edits TRAINING_SECTIONS directly to
// update training materials. No LMS, per spec (Prompt 433).
const TRAINING_SECTIONS = []

export default function Training() {
  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Training</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">Reference materials for the team</p>

      <div className="mt-6 space-y-4">
        {!TRAINING_SECTIONS.length ? (
          <div className="rounded-card border border-line bg-elevated p-8 text-center">
            <p className="font-sans text-sm text-fg-secondary">No training materials added yet.</p>
          </div>
        ) : (
          TRAINING_SECTIONS.map((section) => (
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
