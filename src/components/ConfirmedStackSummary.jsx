import { Field } from './ui/Field'
import { AGENT_CATALOG } from '../lib/agentCatalog'

// Prompt 612 — read-only replacement for AgentPicker. A deal's Stack now
// comes only from the Closer Survey's most recently completed run for this
// lead, so there's nothing left to click or toggle here — just the
// front-runner + any sub-agents, by label.
export function ConfirmedStackSummary({ frontRunner, subAgents }) {
  if (!frontRunner) {
    return (
      <p className="font-sans text-sm text-fg-secondary">
        No Stack yet — run the Closer Survey with this client to produce one.
      </p>
    )
  }

  const subKeys = [...subAgents]

  return (
    <Field label="Confirmed Stack">
      <div className="rounded-lg border border-line bg-surface px-4 py-3">
        <p className="font-sans text-sm font-medium text-fg-primary">
          {AGENT_CATALOG[frontRunner]?.label || frontRunner}
        </p>
        {subKeys.length > 0 && (
          <ul className="mt-1 list-disc pl-5 font-sans text-sm text-fg-secondary">
            {subKeys.map((k) => (
              <li key={k}>{AGENT_CATALOG[k]?.label || k}</li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  )
}
