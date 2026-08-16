import { NavLink, Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function Layout() {
  const { profile, signOut } = useAuth()

  const links = [
    profile?.role !== 'closer' && { to: '/queue', label: 'Queue' },
    { to: '/booked', label: 'Booked' },
    profile?.role === 'admin' && { to: '/users', label: 'Users' },
  ].filter(Boolean)

  return (
    <div className="min-h-screen bg-base">
      <header className="border-b border-line bg-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="font-display text-lg font-semibold tracking-tight text-fg-primary">
              Restorix
            </span>
            <nav className="flex items-center gap-5">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    `font-sans text-sm transition-colors ${
                      isActive ? 'font-semibold text-accent' : 'text-fg-secondary hover:text-fg-primary'
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-sans text-sm font-medium text-fg-primary">{profile?.full_name}</p>
              <p className="eyebrow !text-fg-faint">{profile?.role}</p>
            </div>
            <button onClick={signOut} className="text-fg-faint hover:text-fg-primary" title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
