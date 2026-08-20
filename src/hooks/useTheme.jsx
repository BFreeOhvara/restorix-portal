import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

const ThemeContext = createContext(null)

// Prompt 502 — three-way system/light/dark, same shape as most mature
// apps' theme settings (per Prompt 501's scoping doc), not a plain on/off
// toggle. `theme_preference` lives on `profiles` and follows the same
// self-service-RPC pattern as `update_own_timezone`. Logged-out screens
// (Login/Join) have no profile to read yet, so they fall back to 'system'
// — there's nothing to persist an override to before a user exists.
export function ThemeProvider({ children }) {
  const { profile } = useAuth()
  const preference = profile?.theme_preference || 'system'
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setSystemPrefersDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme = preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  async function setThemePreference(next) {
    if (!profile) return
    await supabase.rpc('update_own_theme_preference', { p_theme_preference: next })
  }

  return (
    <ThemeContext.Provider value={{ themePreference: preference, resolvedTheme, setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
