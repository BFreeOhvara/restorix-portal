import clsx from 'clsx'

export const STATUS_LABELS = {
  new: 'New',
  no_answer: 'No Answer',
  not_interested: 'Not Interested',
  follow_up: 'Follow-up',
  appointment_booked: 'Appointment Booked',
}

// Tinted (low-emphasis) per-status treatment — badges, and a filter chip's
// unselected state. `!` on the text color is required: it's winning against
// `.eyebrow`'s own `color` rule (defined later in the stylesheet than the
// Tailwind utilities, so it wins plain specificity ties) wherever a chip
// also carries `.eyebrow` for its type styling.
export const STATUS_TINT = {
  new: 'bg-muted !text-fg-secondary',
  no_answer: 'bg-[#fde8cc] !text-[#8a5a12]',
  not_interested: 'bg-[#fbe2de] !text-danger',
  follow_up: 'bg-[#e3e9ff] !text-accent-deep',
  appointment_booked: 'bg-[#dcf3e6] !text-success',
}

// Solid (high-emphasis) per-status treatment — a selected filter chip, and
// each lead's Call button (Prompt 440): one color system shared across
// every place a status shows up, so it's recognizable at a glance.
export const STATUS_SOLID = {
  new: 'bg-accent !text-white',
  no_answer: 'bg-warning !text-white',
  not_interested: 'bg-danger !text-white',
  follow_up: 'bg-accent-deep !text-white',
  appointment_booked: 'bg-success !text-white',
}

export default function StatusBadge({ status }) {
  return (
    <span className={clsx('eyebrow inline-flex rounded-full px-2.5 py-1', STATUS_TINT[status] || STATUS_TINT.new)}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}
