import { useBillingRequests, useResolveBillingRequest } from '../hooks/useBillingRequests'
import { Button } from '../components/ui/Button'
import { usePageHeader } from '../components/Layout'

function fmt(dt) {
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Prompt 611 — admin review surface for client "request payment method
// change" requests, same open/resolve shape as BugReports.jsx. No real
// billing/payment processor involved — this is a manual-follow-up queue.
export default function BillingRequests() {
  const { data: requests, isLoading } = useBillingRequests()
  const resolve = useResolveBillingRequest()
  usePageHeader({ title: 'Billing Requests', subtitle: "Payment method change requests from the client portal" })

  return (
    <div>
      <div className="mt-6 overflow-hidden rounded-card border border-line bg-elevated">
        {isLoading ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">Loading…</p>
        ) : !requests?.length ? (
          <p className="p-8 text-center font-sans text-sm text-fg-secondary">No billing requests yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-sans text-sm font-semibold text-fg-primary">
                    {r.facility_name || 'Unknown facility'}
                  </p>
                  {r.note && <p className="mt-1 whitespace-pre-wrap font-sans text-sm text-fg-secondary">{r.note}</p>}
                  <p className="mt-1.5 font-sans text-xs text-fg-faint">
                    {r.profiles?.full_name || 'Unknown'} · {fmt(r.created_at)}
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
