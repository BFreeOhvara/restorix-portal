import { useAuth } from '../hooks/useAuth'

const COPY = {
  setter: {
    title: 'My Commissions',
    body: "Commission tracking isn't live yet — Restorix doesn't have a defined comp structure for setters yet.",
  },
  closer: {
    title: 'Revenue',
    body: "Revenue tracking isn't live yet — Restorix doesn't have a defined comp structure for closers yet.",
  },
  admin: {
    title: 'Commissions',
    body: "Commission and payout tracking isn't live yet — no comp structure has been defined for setters or closers.",
  },
}

export default function Commissions() {
  const { profile } = useAuth()
  const copy = COPY[profile?.role] || COPY.admin

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-fg-primary">{copy.title}</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">{copy.body}</p>

      <div className="mt-6 rounded-card border border-line bg-elevated p-8 text-center">
        <p className="font-sans text-sm text-fg-secondary">
          Nothing to show yet — this page will populate once a commission structure exists.
        </p>
      </div>
    </div>
  )
}
