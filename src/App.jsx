import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Queue from './pages/Queue'
import Booked from './pages/Booked'
import Users from './pages/Users'

const queryClient = new QueryClient()

function Gate({ children }) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base">
        <p className="font-sans text-sm text-fg-secondary">Loading…</p>
      </div>
    )
  }
  if (!session || !profile) return <Login />
  return children
}

function RoleRoute({ roles, children }) {
  const { profile } = useAuth()
  if (!roles.includes(profile.role)) return <Navigate to="/" replace />
  return children
}

function Home() {
  const { profile } = useAuth()
  return <Navigate to={profile.role === 'closer' ? '/booked' : '/queue'} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Gate>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route
                  path="/queue"
                  element={
                    <RoleRoute roles={['setter', 'admin']}>
                      <Queue />
                    </RoleRoute>
                  }
                />
                <Route path="/booked" element={<Booked />} />
                <Route
                  path="/users"
                  element={
                    <RoleRoute roles={['admin']}>
                      <Users />
                    </RoleRoute>
                  }
                />
              </Route>
            </Routes>
          </Gate>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
