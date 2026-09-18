import clsx from 'clsx'
import { Field } from './ui/Field'
import { FRONT_RUNNER_KEYS, SUB_AGENT_KEYS, AGENT_CATALOG } from '../lib/agentCatalog'

// Prompt 610 — the front-runner/sub-agent picker, pulled out of
// CloserLeadModal's Client Portal tab so the Log Outcome tab can render
// the exact same picker (driving its suggested price) instead of a
// second copy that could drift. `subAgents` is a Set of selected keys.
export function AgentPicker({ frontRunner, onFrontRunnerChange, subAgents, onToggleSubAgent }) {
  return (
    <>
      <Field label="Front-runner agent">
        <div className="grid gap-2 sm:grid-cols-2">
          {FRONT_RUNNER_KEYS.map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => onFrontRunnerChange(key)}
              className={clsx(
                'rounded-lg border px-4 py-3 text-left font-sans text-sm font-medium transition-colors',
                frontRunner === key
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-surface text-fg-primary hover:border-fg-primary/40'
              )}
            >
              {AGENT_CATALOG[key].label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Sub-agents">
        <div className="space-y-2">
          {SUB_AGENT_KEYS.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5"
            >
              <input
                type="checkbox"
                checked={subAgents.has(key)}
                onChange={() => onToggleSubAgent(key)}
                className="h-4 w-4 accent-accent"
              />
              <span className="font-sans text-sm text-fg-primary">{AGENT_CATALOG[key].label}</span>
            </label>
          ))}
        </div>
      </Field>
    </>
  )
}
