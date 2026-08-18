import clsx from 'clsx'

export const STATUS_LABELS = {
  new: 'New',
  no_answer: 'No Answer',
  not_interested: 'Not Interested',
  follow_up: 'Follow-up',
  appointment_booked: 'Appointment Booked',
}

// Tinted (low-emphasis) per-status treatment — a filter chip's unselected
// state. `!` on the text color is required: it's winning against
// `.eyebrow`'s own `color` rule (defined later in the stylesheet than the
// Tailwind utilities, so it wins plain specificity ties) wherever a chip
// also carries `.eyebrow` for its type styling.
//
// Mapping per Brayden (Prompt 442): New=blue, No Answer=gray (was amber),
// Follow-up=yellow (was purple), Not Interested=red/pink (unchanged,
// confirmed directly — his note said "keep it yellow" right after saying
// Follow-up should be yellow too, which reads as a slip; asked, he meant
// leave Not Interested as-is), Appointment Booked=green (unchanged).
// Prompt 476: New and No Answer's UNSELECTED colors swapped — New now
// reuses the exact `#e3e9ff`/accent-deep pairing STATUS_BADGE.new already
// uses for the per-row Status column badge (one color, not a new one), No
// Answer takes over the plain `bg-muted` gray New used to have. SOLID
// (selected-chip/badge) states are untouched — this is TINT only.
export const STATUS_TINT = {
  new: 'bg-[#e3e9ff] !text-accent-deep',
  no_answer: 'bg-muted !text-fg-secondary',
  not_interested: 'bg-[#fbe2de] !text-danger',
  follow_up: 'bg-yellow-100 !text-yellow-800',
  appointment_booked: 'bg-[#dcf3e6] !text-success',
}

// Solid (high-emphasis) per-status treatment — a selected filter chip, the
// STATUS column badge in the lead table, the Log Call modal's outcome
// buttons, and each lead's Call button: one color system shared across
// every place a status shows up, so it's recognizable at a glance.
export const STATUS_SOLID = {
  new: 'bg-accent !text-white',
  no_answer: 'bg-gray-500 !text-white',
  not_interested: 'bg-danger !text-white',
  follow_up: 'bg-yellow-600 !text-white',
  appointment_booked: 'bg-success !text-white',
}

// Table/detail context (Status column, outcome badges elsewhere) uses the
// bolder SOLID treatment, not the muted TINT one — Prompt 442: the tint
// map deliberately keeps "new" a neutral gray for the *unselected filter
// chip* case, but that read as "badges aren't colored at all" once it was
// the only color a New lead's Status badge ever showed.
//
// Prompt 442 follow-up: New is the one deliberate exception to "badge
// matches SOLID" — bg-accent is also the app's default/nav-highlight blue
// AND the same row's Call button color, so a solid-accent New badge sat
// right next to a solid-accent Call button and read as one blob rather
// than a distinct status. A lighter blue (dark text on a pale blue tint,
// not the muted gray TINT.new either) gives it its own identity.
const STATUS_BADGE = {
  ...STATUS_SOLID,
  new: 'bg-[#e3e9ff] !text-accent-deep',
}

export default function StatusBadge({ status }) {
  return (
    <span className={clsx('eyebrow inline-flex rounded-full px-2.5 py-1', STATUS_BADGE[status] || STATUS_BADGE.new)}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}
