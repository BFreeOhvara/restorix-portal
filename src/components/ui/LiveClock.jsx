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
    // Prompt 591 — shrunk from text-3xl/px-4 py-2: this chip is purely
    // decorative (a digital-clock display), and reclaiming its size was the
    // cheapest way to reclaim vertical space above the Overview lead table
    // without touching the table's own max-h-[65vh] cap.
    <span className="inline-block rounded-lg bg-accent px-3 py-1.5 font-mono text-xl font-semibold text-white [font-variant-numeric:tabular-nums]">
      {time}
    </span>
  )
}
