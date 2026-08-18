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

export const OUTCOME_TINT = {
  pending: 'bg-muted !text-fg-secondary',
  needs_reschedule: 'bg-yellow-100 !text-yellow-800',
  lost: 'bg-[#fbe2de] !text-danger',
  closed: 'bg-[#dcf3e6] !text-success',
}

export const OUTCOME_SOLID = {
  pending: 'bg-gray-500 !text-white',
  needs_reschedule: 'bg-yellow-600 !text-white',
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
