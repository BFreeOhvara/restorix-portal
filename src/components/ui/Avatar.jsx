// Prompt 491 — shared avatar: a real uploaded photo, or a two-initial
// circle in one of 6 pastel colors the user picks themselves (see
// AvatarColorPicker). Ported from ohvara-dashboard's own Avatar.jsx
// (Prompt 407/422) but with one deliberate difference — Ohvara's
// fallback color is 4 fixed, vivid tokens assigned once at signup and
// never user-selectable; Restorix's is 6 soft pastels the user can pick
// and change anytime (see AvatarColorPicker.jsx, new for this project).
// Dark text on a light pastel background instead of Ohvara's white-on-
// vivid, since pastels don't have the contrast for white text.
export const AVATAR_COLORS = {
  blush: '#f6d5d5',
  peach: '#f6e2c6',
  sand: '#f3edc0',
  mint: '#cfead9',
  sky: '#cfe3f6',
  lilac: '#e0d6f0',
}

function getInitials(name) {
  return (name || '?').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?'
}

// Prompt 502 — the initials text used to inherit `text-fg-primary`, which
// is near-black in light mode (12.2-14.4:1 against all 6 pastels, verified
// in Prompt 491) but flips to a light color in dark mode. The pastel
// swatches themselves stay fixed hex regardless of theme by design (an
// avatar's color shouldn't change when you flip a toggle), so the text
// sitting on them has to stay pinned to the same near-black it was tuned
// against, independent of `--text-primary` — inheriting the token here
// would silently break the contrast the moment dark mode redefines it.
const INITIALS_TEXT_COLOR = '#0f1f1b'

export function Avatar({ profile, name, avatarUrl, avatarColor, size = 32, className = '' }) {
  const displayName = profile ? profile.full_name : name
  const url = profile ? profile.avatar_url : avatarUrl
  const bg = AVATAR_COLORS[profile ? profile.avatar_color : avatarColor] || AVATAR_COLORS.sky

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-sans font-bold ${className}`}
      style={{
        width: size, height: size,
        fontSize: Math.round(size * 0.38),
        background: url ? 'var(--bg-elevated)' : bg,
        color: url ? 'var(--text-primary)' : INITIALS_TEXT_COLOR,
      }}
    >
      {url ? (
        <img src={url} alt={displayName || 'Avatar'} className="h-full w-full object-cover" />
      ) : (
        getInitials(displayName)
      )}
    </div>
  )
}
