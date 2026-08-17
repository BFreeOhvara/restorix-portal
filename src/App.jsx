import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Join from './pages/Join'
import Overview from './pages/Overview'
import Stats from './pages/Stats'
import Queue from './pages/Queue'
import Users from './pages/Users'
import Training from './pages/Training'

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
  return <Navigate to="/overview" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/join/:token" element={<Join />} />
            <Route
              path="/*"
              element={
                <Gate>
                  <Routes>
                    <Route element={<Layout />}>
                      <Route path="/" element={<Home />} />
                      <Route path="/overview" element={<Overview />} />
                      <Route path="/stats" element={<Stats />} />
                      <Route
                        path="/queue"
                        element={
                          <RoleRoute roles={['admin']}>
                            <Queue />
                          </RoleRoute>
                        }
                      />
                      <Route
                        path="/users"
                        element={
                          <RoleRoute roles={['admin']}>
                            <Users />
                          </RoleRoute>
                        }
                      />
                      <Route path="/training" element={<Training />} />
                    </Route>
                  </Routes>
                </Gate>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
