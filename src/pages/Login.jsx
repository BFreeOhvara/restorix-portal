import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useBrand } from '../hooks/useBrand'
import { Button } from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'
import ParticleField from '../components/ui/ParticleField'

export default function Login() {
  const { signIn } = useAuth()
  const brand = useBrand()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(username, password)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    // Prompt 511 — the login page sits outside <Layout/> (App.jsx renders it
    // directly, pre-auth, so there's no sidebar to offset around), so the
    // dot-network canvas gets its own fixed full-viewport wrapper here
    // rather than reusing Layout's `left-60`-offset one. Same z-0/z-10 split
    // as Layout.jsx and restorix-marketing's Hero.jsx use for this exact
    // background/content stacking pattern.
    <div className="relative min-h-screen bg-base">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <ParticleField className="h-full w-full" />
      </div>
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-card border border-line bg-elevated p-8">
          <span className="font-display text-xl font-semibold tracking-tight text-fg-primary">{brand.wordmark}</span>
          <p className="mt-1 font-sans text-sm text-fg-secondary">Sign in to manage your leads, calls, and pipeline.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <Field label="Username">
              <input
                className={inputClass()}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Password">
              <input
                className={inputClass()}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            {error && <p className="font-sans text-sm text-danger">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 font-sans text-xs text-fg-faint">
            Accounts are created by an admin. Contact your administrator if you don't have one.
          </p>
        </div>
      </div>
    </div>
  )
}
