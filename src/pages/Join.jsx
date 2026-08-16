import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'

export default function Join() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { signIn } = useAuth()

  const [checking, setChecking] = useState(true)
  const [checkError, setCheckError] = useState('')
  const [role, setRole] = useState('')

  const [form, setForm] = useState({ full_name: '', username: '', password: '', confirm: '' })
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function check() {
      const { data, error } = await supabase.functions.invoke('claim-invite', {
        body: { action: 'check', token },
      })
      if (error || data?.error) {
        setCheckError(data?.error || 'This invite link is invalid.')
      } else {
        setRole(data.role)
      }
      setChecking(false)
    }
    check()
  }, [token])

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')

    if (form.password !== form.confirm) {
      setSubmitError('Passwords do not match')
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await supabase.functions.invoke('claim-invite', {
        body: {
          action: 'claim',
          token,
          full_name: form.full_name,
          username: form.username,
          password: form.password,
        },
      })
      if (error || data?.error) throw new Error(data?.error || 'Failed to activate account')

      await signIn(form.username, form.password)
      navigate('/', { replace: true })
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-6">
      <div className="w-full max-w-sm rounded-card border border-line bg-elevated p-8">
        <span className="font-display text-xl font-semibold tracking-tight text-fg-primary">Restorix Portal</span>

        {checking ? (
          <p className="mt-4 font-sans text-sm text-fg-secondary">Checking invite…</p>
        ) : checkError ? (
          <p className="mt-4 font-sans text-sm text-danger">{checkError}</p>
        ) : (
          <>
            <p className="mt-1 font-sans text-sm text-fg-secondary">
              Set up your <span className="capitalize">{role}</span> account
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <Field label="Full name">
                <input className={inputClass()} value={form.full_name} onChange={set('full_name')} required />
              </Field>
              <Field label="Username">
                <input
                  className={inputClass()}
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
                  pattern="[a-z0-9_\-]+"
                  title="Lowercase letters, numbers, underscores, and hyphens only"
                  required
                />
              </Field>
              <Field label="Password">
                <input
                  className={inputClass()}
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  minLength={8}
                  required
                />
              </Field>
              <Field label="Confirm password">
                <input
                  className={inputClass()}
                  type="password"
                  value={form.confirm}
                  onChange={set('confirm')}
                  minLength={8}
                  required
                />
              </Field>

              {submitError && <p className="font-sans text-sm text-danger">{submitError}</p>}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
