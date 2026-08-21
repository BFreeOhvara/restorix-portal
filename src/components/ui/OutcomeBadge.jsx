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
//
// Prompt 508: `pending` was neutral gray, read as "nothing to see here"
// next to the real color-coded states. Orange (not yellow) specifically
// so it stays visually distinct from StatusBadge.jsx's `follow_up` —
// same yellow-600/yellow-100 pairing that badge already owns — even
// though these two badges never render side by side today (different
// entities: closer_outcome here vs. setter lead status there), Brayden
// wants the color language unambiguous across the whole portal, not just
// wherever they happen to currently collide on screen.
export const OUTCOME_TINT = {
  pending: 'bg-orange-100 !text-orange-800 dark:bg-orange-900/50 dark:!text-orange-300',
  needs_reschedule: 'bg-yellow-100 !text-yellow-800 dark:bg-yellow-900/50 dark:!text-yellow-300',
  lost: 'bg-[#fbe2de] !text-danger dark:bg-[#3d211c]',
  closed: 'bg-[#dcf3e6] !text-success dark:bg-[#173a28]',
}

export const OUTCOME_SOLID = {
  pending: 'bg-orange-600 !text-white dark:bg-orange-500 dark:!text-orange-950',
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
