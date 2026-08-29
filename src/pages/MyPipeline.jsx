import { useAuth } from '../hooks/useAuth'
import { CloserPipeline } from './Overview'

// Prompt 509 — a separate, additional tab for closers (confirmed directly
// with Brayden rather than guessed: Overview stays as-is, this is new
// alongside it).
// Prompt 548 — Overview and My Pipeline were the literal same component
// (CloserOverview with a different title). They've now diverged: Overview
// is a daily snapshot, My Pipeline keeps the outcome-filtered working
// table verbatim — that table is `CloserPipeline` now, mounted here.
export default function MyPipeline() {
  const { profile } = useAuth()
  if (!profile) return null
  return <CloserPipeline profile={profile} title="My Pipeline" />
}
