import clsx from 'clsx'

// Prompt 464: closer_outcome is a separate enum from lead status (see
// StatusBadge.jsx) — own color system so it never gets confused with the
// setter-facing statuses, but the same TINT/SOLID/labels shape for
// consistency with the rest of the app.
export const OUTCOME_LABELS = {
  pending: 'Pending',
  needs_reschedule: 'Needs Rescheduling',
  lost: 'Lost',
  closed: 'Closed',
}

// Prompt 502: the raw (non-token) Tailwind palette/hex strings below
// don't auto-inherit dark values the way token classes do, so each gets
// an explicit `dark:` variant chosen for real dark-appropriate contrast —
// not just inverted lightness (a plain lightness-flip on e.g.
// yellow-100/yellow-800 would still be a pale, washed-out pill sitting on
// a dark card).
export const OUTCOME_TINT = {
  pending: 'bg-muted !text-fg-secondary',
  needs_reschedule: 'bg-yellow-100 !text-yellow-800 dark:bg-yellow-900/50 dark:!text-yellow-300',
  lost: 'bg-[#fbe2de] !text-danger dark:bg-[#3d211c]',
  closed: 'bg-[#dcf3e6] !text-success dark:bg-[#173a28]',
}

export const OUTCOME_SOLID = {
  pending: 'bg-gray-500 !text-white dark:bg-gray-600',
  needs_reschedule: 'bg-yellow-600 !text-white dark:bg-yellow-500 dark:!text-yellow-950',
  lost: 'bg-danger !text-white',
  closed: 'bg-success !text-white',
}

export default function OutcomeBadge({ outcome }) {
  return (
    <span className={clsx('eyebrow inline-flex rounded-full px-2.5 py-1', OUTCOME_TINT[outcome] || OUTCOME_TINT.pending)}>
      {OUTCOME_LABELS[outcome] || outcome || 'Pending'}
    </span>
  )
}
