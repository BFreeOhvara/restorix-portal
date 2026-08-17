import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Bell, LogOut, Phone, Users as UsersIcon, GraduationCap, BarChart2, TrendingUp, Activity as ActivityIcon, Users2, DollarSign } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

// Nav order (Prompt 441): Overview first, admin-only Queue/Users kept
// right after it (their primary daily tools), then Training, then the
// setter/closer-specific activity view, then Stats, then Commissions —
// resolves to Overview → Training → Activity → Stats → Commissions for
// setter (the role Brayden actually reviewed), Overview → Training →
// Setter Activity → Stats → Commissions for closer.
const NAV = [
  { to: '/overview', label: 'Overview', icon: BarChart2, roles: ['setter', 'admin', 'closer'] },
  { to: '/queue', label: 'Queue', icon: Phone, roles: ['admin'] },
  { to: '/users', label: 'Users', icon: UsersIcon, roles: ['admin'] },
  { to: '/training', label: 'Training', icon: GraduationCap, roles: ['setter', 'admin', 'closer'] },
  { to: '/activity', label: 'Activity', icon: ActivityIcon, roles: ['setter'] },
  { to: '/setter-activity', label: 'Setter Activity', icon: Users2, roles: ['closer'] },
  { to: '/stats', label: 'Stats', icon: TrendingUp, roles: ['setter', 'admin', 'closer'] },
  { to: '/commissions', label: 'Commissions', icon: DollarSign, roles: ['setter', 'admin', 'closer'] },
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

// Account info + sign-out, moved from the sidebar footer into the header
// (Prompt 441, reverses that part of Prompt 433 on purpose): bell → thin
// divider → name/role, with sign-out kept alongside it rather than
// dropped — Prompt 441 didn't say where sign-out should go, and losing
// the ability to log out would be a real regression, not a simplification.
function AccountInfo({ profile, onSignOut }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="h-6 w-px bg-line" />
      <div className="text-right leading-tight">
        <p className="font-sans text-sm font-medium text-fg-primary">{profile?.full_name}</p>
        <p className="eyebrow !text-fg-faint">{profile?.role}</p>
      </div>
      <button onClick={onSignOut} className="flex-shrink-0 text-fg-faint hover:text-fg-primary" title="Sign out">
        <LogOut size={17} />
      </button>
    </div>
  )
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const links = NAV.filter((l) => l.roles.includes(profile?.role))

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

        <nav className="flex-1 space-y-1 px-3">
          {links.map(({ to, label, icon: Icon }) => (
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
        </nav>
      </aside>

      <div className="ml-60 flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-3 border-b border-line bg-elevated px-6">
          <NotificationBell />
          <AccountInfo profile={profile} onSignOut={signOut} />
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
