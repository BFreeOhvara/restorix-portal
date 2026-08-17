import { useState } from 'react'

// Plain-text content area — Brayden edits SCRIPT_SECTIONS directly to update
// call scripts. No generation or CMS, per spec (Prompt 433, relocated here
// under the Training tab structure by Prompt 437).
const SCRIPT_SECTIONS = []

const TABS = [
  { key: 'script', label: 'Script' },
  { key: 'videos', label: 'Videos' },
  { key: 'roleplay', label: 'AI Voice Roleplay' },
]

function ScriptTab() {
  return (
    <div className="space-y-4">
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
  )
}

function ComingSoonTab({ message }) {
  return (
    <div className="rounded-card border border-line bg-elevated p-8 text-center">
      <p className="font-sans text-sm text-fg-secondary">{message}</p>
    </div>
  )
}

export default function Training() {
  const [tab, setTab] = useState('script')

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">Training</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">Reference materials for the team</p>

      <div className="mt-6 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg border px-3 py-2 font-sans text-sm transition-colors ${
              tab === t.key
                ? 'border-accent bg-accent text-white'
                : 'border-line bg-base text-fg-secondary hover:border-fg-primary/40'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'script' && <ScriptTab />}
        {tab === 'videos' && <ComingSoonTab message="Training videos are coming soon." />}
        {tab === 'roleplay' && <ComingSoonTab message="AI voice roleplay is coming soon." />}
      </div>
    </div>
  )
}
