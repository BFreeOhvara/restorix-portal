import { useBugReports, useResolveBugReport } from '../hooks/useBugReports'
import { Button } from '../components/ui/Button'

function fmt(dt) {
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Prompt 528 — the real destination the sidebar's "Report a Bug" modal
// submits to. Admin-only (see the route's RoleRoute), simple open/resolve
// toggle rather than a full ticket-workflow this project has no other
// need for yet.
export default function BugReports() {
  const { data: reports, isLoading } = useBugReports()
  const resolve = useResolveBugReport()

  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-medium text-fg-primary">Bug Reports</h1>
        <p className="mt-1 font-sans text-sm text-fg-secondary">Submitted from the sidebar's Report a Bug button</p>
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !reports?.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">No bug reports yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {reports.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap font-sans text-sm text-fg-primary">{r.description}</p>
                  <p className="mt-1.5 font-sans text-xs text-fg-faint">
                    {r.profiles?.full_name || 'Unknown'} ({r.profiles?.role || '—'}) · {fmt(r.created_at)}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span
                    className={`eyebrow rounded-full px-2.5 py-1 ${
                      r.status === 'open' ? 'bg-danger/10 !text-danger' : 'bg-success/10 !text-success'
                    }`}
                  >
                    {r.status}
                  </span>
                  <Button
                    variant="secondary"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: r.id, status: r.status === 'open' ? 'resolved' : 'open' })}
                  >
                    Mark {r.status === 'open' ? 'resolved' : 'open'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
