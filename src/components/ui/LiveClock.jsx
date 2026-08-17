import { useEffect, useState } from 'react'
import { DEFAULT_TIMEZONE } from '../../lib/timezones'

// Prompt 458 — actually-ticking clock (1s interval), ported from
// ohvara-dashboard's components/ui/LiveClock.jsx. Tied to the viewing
// user's own saved timezone, not a static timestamp that only updates on
// page refresh.
export function LiveClock({ timezone }) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const tz = timezone || DEFAULT_TIMEZONE
  const time = new Date(nowMs).toLocaleTimeString('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
  })

  return (
    <span className="inline-block rounded-md bg-accent px-2.5 py-1 font-mono text-xs text-white [font-variant-numeric:tabular-nums]">
      {time}
    </span>
  )
}
