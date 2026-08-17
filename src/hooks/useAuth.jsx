import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const profileUserId = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) {
        profileUserId.current = null
        setProfile(null)
        return
      }
      if (profileUserId.current === session.user.id) return
      fetchProfile(session.user.id)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    setProfileLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error || !data) {
      profileUserId.current = null
      setProfile(null)
    } else {
      profileUserId.current = userId
      setProfile(data)
    }
    setProfileLoading(false)
  }

  async function signIn(username, password) {
    const input = username.trim()
    const email = input.includes('@') ? input : `${input}@restorix.internal`
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    const { data: profileData } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', authData.user.id)
      .single()

    if (profileData?.is_active === false) {
      await supabase.auth.signOut()
      throw new Error('Your account has been deactivated. Contact your administrator.')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (session?.user?.id) await fetchProfile(session.user.id)
  }

  const loading = session === undefined || profileLoading

  return (
    <AuthContext.Provider value={{ session, profile, signIn, signOut, refreshProfile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
