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
import { ConsentSettingsPage } from './pages/ConsentSettingsPage'
import { PatientAccessLogPage } from './pages/PatientAccessLogPage'
import { BreakGlassEmergencyViewPage } from './pages/BreakGlassEmergencyViewPage'
import { AdminBreakGlassReviewPage } from './pages/AdminBreakGlassReviewPage'
import { AriaChatPage } from './pages/AriaChatPage'
import { AriaSharingPage } from './pages/AriaSharingPage'
import { FollowUpTrackerPage } from './pages/FollowUpTrackerPage'
import { CollaborationWorkspacePage } from './pages/CollaborationWorkspacePage'
import { CorrectionDashboardPage } from './pages/CorrectionDashboardPage'
import { DevUiPage } from './pages/DevUiPage'
import { EmptyState } from './components/ui/EmptyState'
import { ScrollText } from 'lucide-react'

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
        path: 'patients/:id/consent',
        element: <ConsentSettingsPage />,
      },
      {
        path: 'consent',
        element: <ConsentSettingsPage />,
      },
      {
        path: 'patients/:id/access-log',
        element: <PatientAccessLogPage />,
      },
      {
        path: 'access-log',
        element: <PatientAccessLogPage />,
      },
      {
        path: 'aria',
        element: <AriaChatPage />,
      },
      {
        path: 'aria/shares',
        element: <AriaSharingPage />,
      },
      {
        path: 'patients/:id/break-glass-view',
        element: <BreakGlassEmergencyViewPage />,
      },
      {
        path: 'admin/break-glass',
        element: (
          <ProtectedRoute allowedRoles={['hospital_admin', 'system_admin', 'senior_doctor']}>
            <AdminBreakGlassReviewPage />
          </ProtectedRoute>
        ),
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
        path: 'follow-ups',
        element: <FollowUpTrackerPage />,
      },
      {
        path: 'patients/:id/follow-ups',
        element: <FollowUpTrackerPage />,
      },
      {
        path: 'workspace',
        element: (
          <ProtectedRoute allowedRoles={['doctor', 'senior_doctor', 'system_admin']}>
            <CollaborationWorkspacePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'patients/:id/workspace',
        element: (
          <ProtectedRoute allowedRoles={['doctor', 'senior_doctor', 'system_admin']}>
            <CollaborationWorkspacePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'corrections',
        element: (
          <ProtectedRoute allowedRoles={['doctor', 'senior_doctor', 'hospital_admin', 'system_admin']}>
            <CorrectionDashboardPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'metrics/corrections',
        element: (
          <ProtectedRoute allowedRoles={['doctor', 'senior_doctor', 'hospital_admin', 'system_admin']}>
            <CorrectionDashboardPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'worklist',
        element: (
          <ProtectedRoute allowedRoles={['doctor', 'senior_doctor', 'system_admin']}>
            <CollaborationWorkspacePage />
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
