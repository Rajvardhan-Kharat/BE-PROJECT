import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { PatientDirectoryPage } from './pages/PatientDirectoryPage'
import { PatientOverviewPage } from './pages/PatientOverviewPage'
import { DocumentUploadPage } from './pages/DocumentUploadPage'
import { ExtractionReviewPage } from './pages/ExtractionReviewPage'
import { VerificationQueuePage } from './pages/VerificationQueuePage'
import { RecordComparisonPage } from './pages/RecordComparisonPage'
import { MedicationSafetyPage } from './pages/MedicationSafetyPage'
import { TimelineAuditPage } from './pages/TimelineAuditPage'
import { EmergencySummaryPage } from './pages/EmergencySummaryPage'
import { AgentExecutionLogsPage } from './pages/AgentExecutionLogsPage'
import { DevUiPage } from './pages/DevUiPage'
import { EmptyState } from './components/ui/EmptyState'
import { CheckSquare, ScrollText } from 'lucide-react'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'patients',
        element: <PatientDirectoryPage />,
      },
      {
        path: 'patients/:id',
        element: <PatientOverviewPage />,
      },
      {
        path: 'patients/:id/safety',
        element: <MedicationSafetyPage />,
      },
      {
        path: 'patients/:id/timeline',
        element: <TimelineAuditPage />,
      },
      {
        path: 'patients/:id/emergency-summary',
        element: <EmergencySummaryPage />,
      },
      {
        path: 'emergency-summary',
        element: <EmergencySummaryPage />,
      },
      {
        path: 'safety',
        element: <MedicationSafetyPage />,
      },
      {
        path: 'timeline',
        element: <TimelineAuditPage />,
      },
      {
        path: 'agent-runs',
        element: <AgentExecutionLogsPage />,
      },
      {
        path: 'upload',
        element: <DocumentUploadPage />,
      },
      {
        path: 'documents/:id/review',
        element: <ExtractionReviewPage />,
      },
      {
        path: 'verification',
        element: (
          <ProtectedRoute allowedRoles={['doctor', 'senior_doctor', 'system_admin']}>
            <VerificationQueuePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'verification/:versionId/compare',
        element: (
          <ProtectedRoute allowedRoles={['doctor', 'senior_doctor', 'system_admin']}>
            <RecordComparisonPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'worklist',
        element: (
          <ProtectedRoute allowedRoles={['doctor', 'senior_doctor']}>
            <div className="space-y-4">
              <h1 className="text-xl font-semibold text-slate-900">Clinical Worklist</h1>
              <p className="text-xs text-slate-500">
                Active clinician tasks scoped to your care team.
              </p>
              <EmptyState
                icon={<CheckSquare className="w-4 h-4 text-slate-500" />}
                title="Worklist empty"
                description="No active clinical tasks scheduled for your care team."
              />
            </div>
          </ProtectedRoute>
        ),
      },
      {
        path: 'audit',
        element: (
          <ProtectedRoute allowedRoles={['hospital_admin', 'system_admin', 'senior_doctor']}>
            <div className="space-y-4">
              <h1 className="text-xl font-semibold text-slate-900">Audit Trail</h1>
              <p className="text-xs text-slate-500">
                Immutable audit logs for permission checks, overrides, and AI proposals.
              </p>
              <EmptyState
                icon={<ScrollText className="w-4 h-4 text-slate-500" />}
                title="Audit log empty"
                description="No recent security alerts or denied accesses recorded."
              />
            </div>
          </ProtectedRoute>
        ),
      },
      {
        path: 'dev/ui',
        element: <DevUiPage />,
      },
      {
        path: '*',
        element: <Navigate to="/dashboard" replace />,
      },
    ],
  },
])
