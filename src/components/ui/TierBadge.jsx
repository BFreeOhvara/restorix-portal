import clsx from 'clsx'

// Prompt 521 (rebuilt 2026-08-24) — a single parametrized SVG shield
// template shared across all 5 badge categories, replacing the
// AI-generated per-tier PNG art this same prompt shipped a session ago.
// Brayden liked that art's visual language (shield, centered icon,
// escalating laurel/wings/crown by tier) but doesn't want to keep
// generating 26 individual images for it — this recreates the same
// concept as code, matching Prompt 518's own original recommendation
// ("a shared SVG template... parameterized by category color + tier",
// not 26 illustrated assets). One shape, one ornament system, recolored
// and escalated per category/tier via props instead of per-image art.

const SHIELD_OUTER = 'M70,18 L104,33 L104,66 C104,97 70,116 70,116 C70,116 36,97 36,66 L36,33 Z'
const SHIELD_INNER = 'M70,27 L96,39 L96,65 C96,89 70,105 70,105 C70,105 44,89 44,65 L44,39 Z'
const GOLD = '#d4af37'

// Escalation scales to each category's OWN tier count rather than
// hardcoding "tier 3/5/6" — Special (2 tiers) and Commission (7) need
// genuinely different cutoffs than Dials/Bookings' shared 6. Dials'
// own explicit fix (laurel from tier 3, wings from tier 5, crown only
// at the top tier) falls out of this formula for maxTier=6 rather than
// being a special case: laurelAt = ceil(6*0.5) = 3, wingsAt = ceil(6*0.8) = 5.
export function ornamentStage(tier, maxTier) {
  const laurelAt = Math.max(2, Math.ceil(maxTier * 0.5))
  const wingsAt = Math.max(laurelAt + 1, Math.ceil(maxTier * 0.8))
  return {
    laurel: tier >= laurelAt,
    wings: tier >= wingsAt && wingsAt <= maxTier,
    crown: tier === maxTier,
  }
}

function Laurel({ side }) {
  const flip = side === 'right'
  const leaves = [
    { x: 30, y: 100, a: 100 },
    { x: 24, y: 88, a: 80 },
    { x: 20, y: 75, a: 60 },
    { x: 18, y: 62, a: 40 },
  ]
  return (
    <g transform={flip ? 'translate(140,0) scale(-1,1)' : undefined}>
      <path d="M30,108 C22,95 16,78 16,58" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      {leaves.map((l, i) => (
        <ellipse key={i} cx={l.x} cy={l.y} rx="7" ry="3.2" fill={GOLD} transform={`rotate(${l.a} ${l.x} ${l.y})`} />
      ))}
    </g>
  )
}

function Wings() {
  const feathers = [0, 1, 2, 3].map((i) => {
    const spread = 14 + i * 10
    const lift = 6 - i * 4
    return `M104,${40 + i * 4} C${118 + spread},${34 + i * 6 - lift} ${128 + spread},${44 + i * 8} ${132 + spread},${52 + i * 9}`
  })
  return (
    <>
      {feathers.map((d, i) => (
        <path key={`r${i}`} d={d} fill="none" stroke={GOLD} strokeWidth="3.4" strokeLinecap="round" opacity={1 - i * 0.15} />
      ))}
      <g transform="translate(140,0) scale(-1,1)">
        {feathers.map((d, i) => (
          <path key={`l${i}`} d={d} fill="none" stroke={GOLD} strokeWidth="3.4" strokeLinecap="round" opacity={1 - i * 0.15} />
        ))}
      </g>
    </>
  )
}

function Crown() {
  return (
    <g transform="translate(70,8)">
      <path d="M-18,10 L-18,0 L-10,7 L0,-8 L10,7 L18,0 L18,10 Z" fill={GOLD} />
      <rect x="-18" y="10" width="36" height="4" fill={GOLD} />
      <circle cx="-10" cy="2" r="2" fill="#fff" opacity="0.85" />
      <circle cx="0" cy="-4" r="2.2" fill="#fff" opacity="0.85" />
      <circle cx="10" cy="2" r="2" fill="#fff" opacity="0.85" />
    </g>
  )
}

// `color` is a plain hex string, not a Tailwind token — these badges are
// self-contained brand-identity art (same category as BadgePill's own
// pre-existing hardcoded green), not systemic UI-state color, and the
// color varies per category/tier at runtime so a Tailwind arbitrary-value
// class (which needs a static string for the JIT scanner) can't express it.
export function TierBadge({ icon: Icon, tier, maxTier, color, unlocked, size = 72 }) {
  const stage = ornamentStage(tier, maxTier)
  return (
    <div
      className={clsx('relative', !unlocked && 'grayscale opacity-40')}
      style={{ width: size, height: Math.round((size * 130) / 140) }}
    >
      <svg viewBox="0 0 140 130" width="100%" height="100%" className="overflow-visible">
        {stage.wings && <Wings />}
        {stage.laurel && (
          <>
            <Laurel side="left" />
            <Laurel side="right" />
          </>
        )}
        {stage.crown && <Crown />}
        <path d={SHIELD_OUTER} fill={color} />
        <path d={SHIELD_INNER} fill="#12181a" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon size={Math.round(size * 0.32)} color={color} strokeWidth={2.4} />
      </div>
    </div>
  )
}
