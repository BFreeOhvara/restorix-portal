// Prompt 453 — Settings gets a real nav destination, but Restorix has no
// per-account settings today: no theme toggle (one fixed light palette),
// no timezone/regional field, no integrations. Rather than build tabs for
// features that don't exist yet, this stays an honest placeholder, same
// pattern as Commissions.jsx before a comp structure existed. Password
// change lives on Profile instead (the one thing Prompt 428 actually
// flagged as missing) — revisit this page once a real setting needs a home.
export default function Settings() {
  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl font-medium text-fg-primary">Settings</h1>
      <p className="mt-1 font-sans text-sm text-fg-secondary">
        Account settings — password, name, and role live on Profile.
      </p>

      <div className="mt-6 rounded-card border border-line bg-elevated p-8 text-center">
        <p className="font-sans text-sm text-fg-secondary">
          Nothing to configure yet — Restorix doesn't have per-account settings (theme, timezone,
          integrations) built yet. This page will populate once one exists.
        </p>
      </div>
    </div>
  )
}
