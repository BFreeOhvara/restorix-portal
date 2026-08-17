import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Phone, Users as UsersIcon, GraduationCap, BarChart2, TrendingUp, Activity as ActivityIcon, Users2, DollarSign, Target, MessageSquare, PhoneCall, User, Settings as SettingsIcon } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

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
      { to: '/training', label: 'Training', icon: GraduationCap, roles: ['setter', 'admin', 'closer'] },
    ],
  },
  {
    label: 'PERFORMANCE',
    items: [
      { to: '/goals', label: 'My Goals', icon: Target, roles: ['setter', 'admin'] },
      { to: '/stats', label: 'Stats', icon: TrendingUp, roles: ['setter', 'admin', 'closer'] },
      { to: '/activity', label: 'Activity', icon: ActivityIcon, roles: ['setter'] },
      { to: '/setter-activity', label: 'Setter Activity', icon: Users2, roles: ['closer'] },
      { to: '/commissions', label: 'Commissions', icon: DollarSign, roles: ['setter', 'admin', 'closer'] },
    ],
  },
  {
    label: 'WORK',
    items: [
      { to: '/my-calls', label: 'My Calls', icon: PhoneCall, roles: ['setter', 'admin', 'closer'] },
      { to: '/messages', label: 'Messages', icon: MessageSquare, roles: ['setter', 'admin', 'closer'] },
      // Prompt 453: Settings needs its own nav entry, separate from the
      // Profile/Sign out popover. Placement/section weren't specified —
      // WORK was Brayden's own suggested reasonable fit.
      { to: '/settings', label: 'Settings', icon: SettingsIcon, roles: ['setter', 'admin', 'closer'] },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { to: '/queue', label: 'Queue', icon: Phone, roles: ['admin'] },
      { to: '/users', label: 'Users', icon: UsersIcon, roles: ['admin'] },
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
        className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface"
      >
        <div className="min-w-0">
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

  return (
    <div className="min-h-screen bg-base">
      {/* Fixed via inset-y-0 rather than height:100vh — top/bottom anchoring
          avoids the sidebar's height disagreeing with the viewport by a
          device-pixel or two on some displays, which is what let it get
          dragged into page scroll on long pages (Prompt 441 bug). */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-elevated">
        <div className="flex h-16 items-center px-5">
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
                  {visible.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
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
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <AccountPopover profile={profile} onSignOut={signOut} onNavigate={navigate} />
      </aside>

      <div className="ml-60 flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-3 border-b border-line bg-elevated px-6">
          <NotificationBell />
          <HeaderName profile={profile} />
        </header>
        <main className="flex-1 px-6 py-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
