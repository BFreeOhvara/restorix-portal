import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Bell, LogOut, Workflow, Users as UsersIcon, GraduationCap, BarChart2, TrendingUp, Activity as ActivityIcon, Users2, DollarSign, Target, MessageSquare, PhoneCall, User, Settings as SettingsIcon, ListChecks, UserPlus, GitBranch, Bug, Smartphone } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import ParticleField from './ui/ParticleField'
import { Avatar } from './ui/Avatar'
import BugReportModal from './BugReportModal'
import AddToHomeScreenModal from './AddToHomeScreenModal'

// Prompt 448: grouped into labeled sections (matching ohvara-dashboard's
// Sidebar.jsx grouped-nav pattern) instead of one flat list. Bucket names
// are ours, not Brayden's — he asked for the grouped structure, not
// specific labels. Queue/Users move out of pole position into their own
// admin-only ADMIN group now that groups do the visual separation work
// flat order used to (previously admin's daily tools sat right after
// Overview specifically to read as "primary" in a flat list).
// Prompt 449: group ORDER changed to TODAY -> RESOURCES -> PERFORMANCE ->
// WORK per Brayden's review (was TODAY -> WORK -> PERFORMANCE -> RESOURCES).
// Group contents unchanged. ADMIN's position wasn't specified — left last.
const NAV_GROUPS = [
  {
    label: 'TODAY',
    items: [
      { to: '/overview', label: 'Overview', icon: BarChart2, roles: ['setter', 'admin', 'closer'] },
    ],
  },
  {
    label: 'RESOURCES',
    items: [
      // Prompt 513 — admin's job is overseeing the operation, not doing
      // setter/closer performance work, so Training/My Goals/Stats/My
      // Calls (Brayden's own explicit list, not extended to anything he
      // didn't name) drop out of admin's own sidebar here and below. The
      // routes/pages themselves are untouched — setters and closers still
      // see and use all of them exactly as before; this is nav visibility
      // only, via the same roles-array gating every item already uses.
      { to: '/training', label: 'Training', icon: GraduationCap, roles: ['setter', 'closer'] },
    ],
  },
  {
    label: 'PERFORMANCE',
    items: [
      { to: '/goals', label: 'My Goals', icon: Target, roles: ['setter'] },
      { to: '/stats', label: 'Stats', icon: TrendingUp, roles: ['setter', 'closer'] },
      { to: '/activity', label: 'Activity', icon: ActivityIcon, roles: ['setter'] },
      { to: '/setter-activity', label: 'Setter Activity', icon: Users2, roles: ['closer'] },
      { to: '/commissions', label: 'Commissions', icon: DollarSign, roles: ['setter', 'admin', 'closer'] },
    ],
  },
  {
    // Prompt 454: Messages and Settings pulled back out — WORK is just
    // My Calls again now.
    label: 'WORK',
    items: [
      // Prompt 474: setter-only label swap — "My Recordings" reads better
      // for a setter's own dial history, closer/admin keep "My Calls"
      // exactly as-is (same route, same data, label only).
      { to: '/my-calls', label: 'My Calls', labelByRole: { setter: 'My Recordings' }, icon: PhoneCall, roles: ['setter', 'closer'] },
      // Prompt 469 — live-call talk-track tool, closer's own working
      // tool same as My Calls is the setter's, so it lives in WORK too.
      { to: '/survey', label: 'Closer Survey', icon: ListChecks, roles: ['closer', 'admin'] },
      // Prompt 509 — closer self-dial: My Leads (request + work leads from
      // the shared pool, reusing the setter Pipeline UI) and My Pipeline
      // (outcome tracking, same content shape as Overview already has for
      // closers — confirmed with Brayden as a separate addition, not a
      // replacement). Closer-only, same as Closer Survey above.
      { to: '/my-leads', label: 'My Leads', icon: UserPlus, roles: ['closer'] },
      { to: '/my-pipeline', label: 'My Pipeline', icon: GitBranch, roles: ['closer'] },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { to: '/pipeline', label: 'Pipeline', icon: Workflow, roles: ['admin'] },
      { to: '/users', label: 'Users', icon: UsersIcon, roles: ['admin'] },
      // Prompt 528 — the real destination the sidebar's Report a Bug
      // button submits to.
      { to: '/bug-reports', label: 'Bug Reports', icon: Bug, roles: ['admin'] },
    ],
  },
  // Prompt 456: reverses Prompt 454's headerless standalone block —
  // Brayden looked at it and wanted real section headers after all, just
  // not ones that literally repeat the single item's own name ("SETTINGS"
  // over "Settings" reads redundant). Two separate one-item groups, not
  // one shared group holding both, per his explicit "should be two
  // separate section headers" instruction. Labels are his own suggested
  // wording from the prompt itself (COMMUNICATION / ACCOUNT, the latter
  // matching how ohvara-dashboard's own Sidebar.jsx names this kind of
  // group), not a guess needing separate sign-off. Kept in the same
  // bottom-of-sidebar position Prompt 454 already put them in — this
  // prompt only asked for headers to be added back, not a reposition.
  {
    label: 'COMMUNICATION',
    items: [
      { to: '/messages', label: 'Messages', icon: MessageSquare, roles: ['setter', 'admin', 'closer'] },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { to: '/settings', label: 'Settings', icon: SettingsIcon, roles: ['setter', 'admin', 'closer'] },
    ],
  },
]

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-fg-secondary hover:bg-surface hover:text-fg-primary"
        title="Notifications"
      >
        <Bell size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-64 rounded-card border border-line bg-elevated p-4 shadow-lg">
          <p className="font-sans text-sm text-fg-secondary">No new notifications.</p>
        </div>
      )}
    </div>
  )
}

// Prompt 442: partial revert of 441 — Brayden wants the full account block
// back in the sidebar (name, role, sign-out), AND a simple name-only label
// in the header next to the bell. Both places show the name at once,
// intentionally — not a duplication bug.
// Prompt 453: the block itself is now the popover trigger (ohvara-dashboard's
// AccountMenu pattern) — clicking it opens Profile/Sign out above it instead
// of Sign out sitting as a bare icon next to the name. Same outside-click
// pattern already used by NotificationBell above, just anchored upward
// (bottom-full) since this sits at the bottom of the sidebar.
// Prompt 477: ohvara-dashboard's own AccountMenu row carries a permanent
// `--bg-elevated` card background to read as clickable against its
// (darker) sidebar — copying that literal token here would do nothing,
// since Restorix's sidebar itself IS `bg-elevated` (white).
//
// Prompt 505: Prompt 477's original fix used a one-off `#e3e9ff` hex tint
// instead, but Brayden's live read was that it didn't read as a bounded,
// clickable element the way the sidebar's own active-nav-item treatment
// does (see `NavItemLink` below: `bg-surface` fill, no border). Switched
// to that exact same token instead of inventing a second "selected"
// treatment — same background color, same visual weight, one consistent
// language for "this is the current/active thing" across the sidebar.
// `hover:bg-muted` is the next token up the base<surface<elevated<muted
// ladder, giving real hover feedback without a new color. Both tokens
// already carry correct dark values (Prompt 502), so the old per-theme
// `dark:bg-[...]` overrides this button needed are gone too — genuinely
// simpler code, not just a different color.
// Prompt 528 — two small circular icon buttons above the account box,
// visual concept pointed at from ohvara-dashboard's own floating
// bug-report button (a circular icon button) but explicitly smaller and
// sized to sit naturally in the sidebar. Unlike the header bell (which
// only shows a circle on hover), these carry a persistent visible
// border/background — that's the whole ask, "an actual circular
// background/border around it." Bug button gets the app's `--danger`
// token rather than a literal hardcoded red — same "something needs
// attention" meaning, token-driven like everything else here, not a
// one-off color; the phone/mobile button stays neutral like the bell.
function SidebarIconButton({ icon: Icon, emoji, label, onClick, tone = 'neutral' }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-colors ${
        tone === 'danger'
          ? 'border-danger/30 bg-danger/5 hover:bg-danger/10'
          : 'border-line bg-surface text-fg-secondary hover:border-fg-primary/40 hover:text-fg-primary'
      }`}
    >
      {emoji ? <span aria-hidden="true">{emoji}</span> : <Icon size={14} />}
    </button>
  )
}

function AccountPopover({ profile, onSignOut, onNavigate }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative border-t border-line p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg bg-surface px-2 py-2 text-left transition-colors hover:bg-muted"
      >
        {/* Prompt 505: avatar added matching ohvara-dashboard's own
            AccountMenu row (Sidebar.jsx) — Avatar left of the stacked
            name/role text, same `gap` proportions. Reuses the existing
            Avatar component verbatim (Prompt 491, already handles the
            real-photo vs. pastel-initials fallback) rather than building
            a second one. */}
        <Avatar profile={profile} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-sm font-medium text-fg-primary">{profile?.full_name}</p>
          <p className="eyebrow !text-fg-faint">{profile?.role}</p>
        </div>
      </button>

      {open && (
        <div className="absolute inset-x-3 bottom-full z-50 mb-2 overflow-hidden rounded-lg border border-line bg-elevated py-1 shadow-lg">
          <button
            onClick={() => { setOpen(false); onNavigate('/profile') }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-sans text-sm text-fg-primary hover:bg-surface"
          >
            <User size={15} className="text-fg-faint" /> Profile
          </button>
          <button
            onClick={() => { setOpen(false); onSignOut() }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-sans text-sm text-danger hover:bg-surface"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function NavItemLink({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 font-sans text-sm transition-colors ${
          isActive
            ? 'bg-surface font-semibold text-accent'
            : 'text-fg-secondary hover:bg-surface hover:text-fg-primary'
        }`
      }
    >
      <Icon size={17} />
      {label}
    </NavLink>
  )
}

function HeaderName({ profile }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="h-6 w-px bg-line" />
      <p className="font-sans text-sm font-medium text-fg-primary">{profile?.full_name}</p>
    </div>
  )
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Prompt 528
  const [showBugReport, setShowBugReport] = useState(false)
  const [showAddToHome, setShowAddToHome] = useState(false)
  // Prompt 456: Messages is the one page that fills the full content area
  // edge-to-edge instead of sitting in the standard padded/max-width
  // container every other page uses — Brayden's explicit call, not a
  // guess. Layout has to know about this itself since Messages.jsx can't
  // undo a parent's real padding/max-width from inside without a hacky
  // negative-margin trick.
  const isFullBleed = location.pathname === '/messages'

  return (
    <div className="min-h-screen bg-base">
      {/* Fixed via inset-y-0 rather than height:100vh — top/bottom anchoring
          avoids the sidebar's height disagreeing with the viewport by a
          device-pixel or two on some displays, which is what let it get
          dragged into page scroll on long pages (Prompt 441 bug). */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-elevated">
        {/* Prompt 503 — icon added next to the existing wordmark, matching
            restorix-marketing's own Nav.jsx icon+wordmark convention
            (Prompt 498: gap-2.5, h-8 w-auto — not h-8 w-8, since the
            source PNG isn't perfectly square and a fixed square box would
            silently squish it). Prompt 503 shipped a violet-recolored
            variant to keep the portal visually distinct from the
            marketing site's icon; Prompt 504 dropped that idea and
            reverted `logo-icon.png` back to the original teal/mint asset
            both sites now share again — same file, not a new one. */}
        <div className="flex h-16 items-center gap-2.5 px-5">
          <img src="/logo-icon.png" alt="" className="h-8 w-auto" />
          <span className="font-display text-lg font-semibold tracking-tight text-fg-primary">Restorix Portal</span>
        </div>

        <nav className="flex-1 space-y-4 px-3">
          {NAV_GROUPS.map(({ label: groupLabel, items }) => {
            const visible = items.filter((l) => l.roles.includes(profile?.role))
            if (visible.length === 0) return null
            return (
              <div key={groupLabel}>
                <p className="eyebrow !text-fg-faint px-3 pb-1.5">{groupLabel}</p>
                <div className="space-y-1">
                  {visible.map((item) => (
                    <NavItemLink key={item.to} {...item} label={item.labelByRole?.[profile?.role] || item.label} />
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Prompt 528 — stacked vertically, bug button closer to the
            account box (bottom), phone/mobile button above it, per
            Brayden's explicit ordering. Sits directly above the existing
            divider line (drawn by AccountPopover's own border-t). */}
        <div className="flex flex-col items-center gap-2 pb-3">
          <SidebarIconButton icon={Smartphone} label="Add to Home Screen" onClick={() => setShowAddToHome(true)} />
          <SidebarIconButton emoji="🐛" label="Report a Bug" tone="danger" onClick={() => setShowBugReport(true)} />
        </div>

        <AccountPopover profile={profile} onSignOut={signOut} onNavigate={navigate} />
      </aside>

      {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}
      {showAddToHome && <AddToHomeScreenModal onClose={() => setShowAddToHome(false)} />}

      {/* Prompt 500 — dot-network background, mounted once here rather than
          per-page, since Layout persists across route changes (<Outlet/>
          swaps only the routed child) — one canvas for the whole session,
          not 16. Fixed and sized to the viewport-visible content region
          only (left-60 matches the sidebar's own width, not the page's
          full scrollable height) so cost stays constant regardless of how
          long any given page's content is — Pipeline/Messages can be very
          tall, and re-sizing/compositing a canvas that tall on every frame
          would be real, avoidable cost this shorter-lived marketing-hero
          version never had to consider. z-0 against the content column's
          z-10 (same explicit z-index pattern restorix-marketing's own
          Hero.jsx already uses for its background/content split) rather
          than a negative z-index against unpositioned in-flow content,
          which paints in a different, easy-to-get-backwards order. */}
      <div className="pointer-events-none fixed inset-y-0 left-60 right-0 z-0 overflow-hidden">
        <ParticleField className="h-full w-full" />
      </div>

      <div className="relative z-10 ml-60 flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-3 border-b border-line bg-elevated px-6">
          <NotificationBell />
          <HeaderName profile={profile} />
        </header>
        {isFullBleed ? (
          // Prompt 456: flex container, not just a sizing wrapper — a
          // block-level <main> here would give its child a `height:100%`
          // that fails to resolve against a flex-grown ancestor (confirmed
          // live: it silently collapsed to content height instead of
          // filling the viewport). Messages.jsx's own root uses `flex-1`
          // for the same reason, not `h-full`.
          <main className="flex flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
        ) : (
          <main className="flex-1 px-6 py-8">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </main>
        )}
      </div>
    </div>
  )
}
