import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Bell, LogOut, Phone, Users as UsersIcon, GraduationCap, BarChart2, TrendingUp } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const NAV = [
  { to: '/overview', label: 'Overview', icon: BarChart2, roles: ['setter', 'admin', 'closer'] },
  { to: '/stats', label: 'Stats', icon: TrendingUp, roles: ['setter', 'admin', 'closer'] },
  { to: '/queue', label: 'Queue', icon: Phone, roles: ['admin'] },
  { to: '/users', label: 'Users', icon: UsersIcon, roles: ['admin'] },
  { to: '/training', label: 'Training', icon: GraduationCap, roles: ['setter', 'admin', 'closer'] },
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

export default function Layout() {
  const { profile, signOut } = useAuth()
  const links = NAV.filter((l) => l.roles.includes(profile?.role))

  return (
    <div className="flex min-h-screen bg-base">
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-line bg-elevated">
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

        <div className="border-t border-line p-3">
          <div className="flex items-center justify-between rounded-lg px-2 py-2">
            <div className="min-w-0">
              <p className="truncate font-sans text-sm font-medium text-fg-primary">{profile?.full_name}</p>
              <p className="eyebrow !text-fg-faint">{profile?.role}</p>
            </div>
            <button onClick={signOut} className="flex-shrink-0 text-fg-faint hover:text-fg-primary" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-end border-b border-line bg-elevated px-6">
          <NotificationBell />
        </header>
        <main className="flex-1 px-6 py-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
