import clsx from 'clsx'

// Prompt 521 (rebuilt 2026-08-24, ornaments redrawn same day) — a single
// parametrized SVG shield template shared across all 5 badge categories,
// replacing the AI-generated per-tier PNG art. Brayden's first live look
// at the rebuild (real screenshot, not just structural DOM checks) found
// the laurel/wings/crown were technically present but functionally
// invisible — thin single-pixel strokes that read as scratches, not
// ornaments, at this render size. Redrawn as bold FILLED shapes (teardrop
// leaves/feathers instead of ellipses/hairline strokes) specifically to
// survive being rendered at ~70px — thin linework doesn't.

const SHIELD_OUTER = 'M85,20 L119,35 L119,68 C119,100 85,120 85,120 C85,120 51,100 51,68 L51,35 Z'
const SHIELD_INNER = 'M85,29 L111,41 L111,67 C111,92 85,108 85,108 C85,108 59,92 59,67 L59,41 Z'
const GOLD = '#e0b23a'
const GOLD_DEEP = '#a8791f'

// Escalation scales to each category's OWN tier count rather than
// hardcoding "tier 3/5/6" — Special (2 tiers) and Commission (7) need
// genuinely different cutoffs than Dials/Bookings' shared 6. Dials' own
// explicit ask (laurel from tier 3, wings from tier 5, crown only at the
// top tier) falls out of this formula for maxTier=6 rather than being a
// special case: laurelAt = ceil(6*0.5) = 3, wingsAt = ceil(6*0.8) = 5.
export function ornamentStage(tier, maxTier) {
  const laurelAt = Math.max(2, Math.ceil(maxTier * 0.5))
  const wingsAt = Math.max(laurelAt + 1, Math.ceil(maxTier * 0.8))
  return {
    laurel: tier >= laurelAt,
    wings: tier >= wingsAt && wingsAt <= maxTier,
    crown: tier === maxTier,
  }
}

// A leaf is a filled almond/teardrop, not a thin ellipse — reads clearly
// as foliage at small sizes where a hairline stroke disappears.
function Leaf({ x, y, angle, size = 12 }) {
  const h = size * 0.42
  return (
    <path
      d={`M0,0 Q${size * 0.5},${-h} ${size},0 Q${size * 0.5},${h} 0,0 Z`}
      fill={GOLD}
      stroke={GOLD_DEEP}
      strokeWidth="0.5"
      transform={`translate(${x},${y}) rotate(${angle})`}
    />
  )
}

function Laurel({ side }) {
  const flip = side === 'right'
  const leaves = [
    { x: 30, y: 111, angle: 110, size: 17 },
    { x: 21, y: 96, angle: 82, size: 17 },
    { x: 16, y: 79, angle: 52, size: 16 },
    { x: 16, y: 61, angle: 24, size: 15 },
  ]
  return (
    <g transform={flip ? 'translate(170,0) scale(-1,1)' : undefined}>
      <path d="M32,116 C17,98 11,76 14,48" fill="none" stroke={GOLD_DEEP} strokeWidth="3.2" strokeLinecap="round" />
      {leaves.map((l, i) => (
        <Leaf key={i} {...l} />
      ))}
    </g>
  )
}

// One bold filled silhouette per side (not a fan of small separate
// feathers, which read as a spiky starburst at tile scale) — a smooth
// leading edge sweeping up and out to a tip, a scalloped trailing edge
// with 3 notches suggesting individual feathers on the way back to the
// shoulder. Reads as "wing" at a glance instead of needing to resolve
// several tiny separate shapes.
const WING_PATH =
  'M0,0 Q20,-24 46,-20 Q40,-10 46,-6 Q34,-4 36,4 Q24,2 24,10 Q14,8 12,15 Q4,10 0,0 Z'

function Wings() {
  return (
    <>
      <path d={WING_PATH} fill={GOLD} stroke={GOLD_DEEP} strokeWidth="1" strokeLinejoin="round" transform="translate(119,42)" />
      <path
        d={WING_PATH}
        fill={GOLD}
        stroke={GOLD_DEEP}
        strokeWidth="1"
        strokeLinejoin="round"
        transform="translate(51,42) scale(-1,1)"
      />
    </>
  )
}

function Crown() {
  return (
    <g transform="translate(85,12)">
      <path
        d="M-24,16 L-24,3 L-13,11 L0,-11 L13,11 L24,3 L24,16 Z"
        fill={GOLD}
        stroke={GOLD_DEEP}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <rect x="-25" y="15" width="50" height="7" rx="1.5" fill={GOLD} stroke={GOLD_DEEP} strokeWidth="1" />
      <circle cx="-13" cy="4" r="3.2" fill="#fff" opacity="0.92" />
      <circle cx="0" cy="-7" r="3.8" fill="#fff" opacity="0.92" />
      <circle cx="13" cy="4" r="3.2" fill="#fff" opacity="0.92" />
    </g>
  )
}

// `color` is a plain hex string, not a Tailwind token — these badges are
// self-contained brand-identity art (same category as the app's own
// pre-existing hardcoded badge greens), not systemic UI-state color, and
// the color varies per category/tier at runtime so a Tailwind arbitrary-
// value class (which needs a static string for the JIT scanner) can't
// express it.
export function TierBadge({ icon: Icon, tier, maxTier, color, unlocked, size = 72 }) {
  const stage = ornamentStage(tier, maxTier)
  return (
    <div
      className={clsx('relative', !unlocked && 'grayscale opacity-40')}
      style={{ width: size, height: Math.round((size * 138) / 170) }}
    >
      <svg viewBox="0 0 170 138" width="100%" height="100%" className="overflow-visible">
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
        <Icon size={Math.round(size * 0.3)} color={color} strokeWidth={2.4} />
      </div>
    </div>
  )
}
