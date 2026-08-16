import clsx from 'clsx'

const STYLES = {
  new: 'bg-muted text-fg-secondary',
  no_answer: 'bg-[#fde8cc] text-[#8a5a12]',
  not_interested: 'bg-[#fbe2de] text-danger',
  callback: 'bg-[#e3e9ff] text-accent-deep',
  booked: 'bg-[#dcf3e6] text-success',
}

const LABELS = {
  new: 'New',
  no_answer: 'No Answer',
  not_interested: 'Not Interested',
  callback: 'Callback',
  booked: 'Booked',
}

export default function StatusBadge({ status }) {
  return (
    <span
      className={clsx(
        'eyebrow inline-flex rounded-full px-2.5 py-1 !text-current',
        STYLES[status] || STYLES.new
      )}
    >
      {LABELS[status] || status}
    </span>
  )
}
