import { useAuth } from '../hooks/useAuth'
import { CloserOverview } from './Overview'

// Prompt 509 — a separate, additional tab for closers (confirmed directly
// with Brayden rather than guessed: Overview stays exactly as-is, this is
// new alongside it, not a replacement or relabel). Same content shape
// Overview already shows a closer today; the two will read as genuinely
// different once "My Leads" also exists as a distinct self-dial working
// queue, at which point Overview/My Pipeline both showing booked-leads
// outcomes makes sense as "your two working views."
export default function MyPipeline() {
  const { profile } = useAuth()
  if (!profile) return null
  return <CloserOverview profile={profile} title="My Pipeline" />
}
