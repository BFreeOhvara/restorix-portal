import { useMyDeal } from '../hooks/useDeals'
import { ownedAgents } from '../lib/clientPreview'

// Prompt 578 — the client Reports page. Ties to `referral_reporting`
// (still a bare placeholder in the catalog). There is no sample content
// for referral reporting today — it was never part of the mockup rounds —
// so, per the prompt, this ports as-is: a real page shell with an honest
// "Coming soon" for every client, test account included. No fabricated
// numbers.

export default function Reports() {
  const { data: deal, isLoading } = useMyDeal()

  if (isLoading) {
    return <p className="font-sans text-sm text-fg-secondary">Loading…</p>
  }

  const purchased = ownedAgents(deal).includes('referral_reporting')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-medium text-fg-primary">Reports</h1>
        <p className="mt-1 font-sans text-sm text-fg-secondary">Which channels and referral sources turn into real admissions.</p>
      </div>

      <div className="rounded-card border border-line bg-elevated p-10 text-center">
        <p className="eyebrow !text-fg-faint">{purchased ? 'Coming soon' : 'Not in your plan'}</p>
        <p className="mx-auto mt-2 max-w-md font-sans text-sm leading-relaxed text-fg-secondary">
          {purchased
            ? "Referral-source reporting is part of your plan and is being built. You'll see it here once it's live."
            : 'Referral-source reporting isn’t part of your current plan. Talk to your Restorix contact if you’d like to add it.'}
        </p>
      </div>
    </div>
  )
}
