import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
import Layout from './components/Layout'
import Login from './pages/Login'
import Join from './pages/Join'
import Overview from './pages/Overview'
import Stats from './pages/Stats'
import Pipeline from './pages/Pipeline'
import Users from './pages/Users'
import Training from './pages/Training'
import Activity from './pages/Activity'
import SetterActivity from './pages/SetterActivity'
import Commissions from './pages/Commissions'
import MyGoals from './pages/MyGoals'
import Messages from './pages/Messages'
import MyCalls from './pages/MyCalls'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Survey from './pages/Survey'
import MyLeads from './pages/MyLeads'
import MyPipeline from './pages/MyPipeline'
import BugReports from './pages/BugReports'

const queryClient = new QueryClient()

// Prompt 546 — routes a `client` account must never reach. `client` gets
// only /overview (its own dashboard branch inside Overview.jsx), /profile,
// and /settings; everything else is internal-staff-only. RoleRoute
// redirects a client hitting these to / → /overview.
const INTERNAL_ROLES = ['setter', 'closer', 'admin']

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
        <ThemeProvider>
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
                      <Route
                        path="/stats"
                        element={
                          <RoleRoute roles={INTERNAL_ROLES}>
                            <Stats />
                          </RoleRoute>
                        }
                      />
                      <Route
                        path="/pipeline"
                        element={
                          <RoleRoute roles={['admin']}>
                            <Pipeline />
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
                      <Route
                        path="/training"
                        element={
                          <RoleRoute roles={INTERNAL_ROLES}>
                            <Training />
                          </RoleRoute>
                        }
                      />
                      <Route
                        path="/messages"
                        element={
                          <RoleRoute roles={INTERNAL_ROLES}>
                            <Messages />
                          </RoleRoute>
                        }
                      />
                      <Route
                        path="/my-calls"
                        element={
                          <RoleRoute roles={INTERNAL_ROLES}>
                            <MyCalls />
                          </RoleRoute>
                        }
                      />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route
                        path="/commissions"
                        element={
                          <RoleRoute roles={INTERNAL_ROLES}>
                            <Commissions />
                          </RoleRoute>
                        }
                      />
                      <Route
                        path="/activity"
                        element={
                          <RoleRoute roles={['setter']}>
                            <Activity />
                          </RoleRoute>
                        }
                      />
                      <Route
                        path="/setter-activity"
                        element={
                          <RoleRoute roles={['closer']}>
                            <SetterActivity />
                          </RoleRoute>
                        }
                      />
                      <Route
                        path="/goals"
                        element={
                          <RoleRoute roles={['setter', 'admin']}>
                            <MyGoals />
                          </RoleRoute>
                        }
                      />
                      <Route
                        path="/survey"
                        element={
                          <RoleRoute roles={['closer', 'admin']}>
                            <Survey />
                          </RoleRoute>
                        }
                      />
                      <Route
                        path="/my-leads"
                        element={
                          <RoleRoute roles={['closer']}>
                            <MyLeads />
                          </RoleRoute>
                        }
                      />
                      <Route
                        path="/my-pipeline"
                        element={
                          <RoleRoute roles={['closer']}>
                            <MyPipeline />
                          </RoleRoute>
                        }
                      />
                      <Route
                        path="/bug-reports"
                        element={
                          <RoleRoute roles={['admin']}>
                            <BugReports />
                          </RoleRoute>
                        }
                      />
                    </Route>
                  </Routes>
                </Gate>
              }
            />
          </Routes>
        </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
