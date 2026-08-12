import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { AnnotationDataPage } from './pages/AnnotationDataPage'
import { LabelManagementPage } from './pages/LabelManagementPage'
import { LoginPage } from './pages/LoginPage'
import { ProjectManagementPage } from './pages/ProjectManagementPage'
import { TeamMembersPage } from './pages/TeamMembersPage'
import { VideoAnnotationPage } from './pages/VideoAnnotationPage'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { authApi } from './services/api'

function App() {
  const [session, setSession] = useState(() => authApi.getStoredSession())
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let active = true
    authApi.restoreSession().then((restored) => { if (active) setSession(restored) }).finally(() => { if (active) setCheckingSession(false) })
    return () => { active = false }
  }, [])

  if (checkingSession) return <main className="annotation-load-state"><p>正在验证登录状态...</p></main>

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/workbench" replace /> : <LoginPage onLogin={() => setSession(authApi.getStoredSession())} />} />
      <Route path="/workbench" element={session ? <WorkbenchPage session={session} /> : <Navigate to="/login" replace />} />
      <Route path="/projects" element={session ? <ProjectManagementPage session={session} /> : <Navigate to="/login" replace />} />
      <Route path="/projects/:projectId/annotation-data" element={session ? <AnnotationDataPage session={session} /> : <Navigate to="/login" replace />} />
      <Route path="/labels" element={session ? <LabelManagementPage session={session} /> : <Navigate to="/login" replace />} />
      <Route path="/team-members" element={session ? <TeamMembersPage session={session} /> : <Navigate to="/login" replace />} />
      <Route path="/annotation/:taskId" element={session ? <VideoAnnotationPage session={session} /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={session ? '/workbench' : '/login'} replace />} />
    </Routes>
  )
}

export default App
