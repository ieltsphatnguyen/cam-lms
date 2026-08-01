import { useState } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import AppShell from '@/components/layout/AppShell';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminTeachersPage from '@/pages/admin/AdminTeachersPage';
import AdminAuthPage from '@/pages/admin/AdminAuthPage';
import AdminUsersPage from '@/pages/admin/AdminUsersPage';
import TeacherDashboard from '@/pages/teacher/TeacherDashboard';
import TeacherClassesPage from '@/pages/teacher/TeacherClassesPage';
import TeacherCoursesPage from '@/pages/teacher/TeacherCoursesPage';
import TeacherAssignmentTemplatesPage from '@/pages/teacher/TeacherAssignmentTemplatesPage';
import TeacherQuestionLibraryPage from '@/pages/teacher/TeacherQuestionLibraryPage';
import AdminQuestionLibraryPage from '@/pages/teacher/TeacherQuestionLibraryPage';
import TeacherAssignmentsPage from '@/pages/teacher/TeacherAssignmentsPage';
import TeacherGradingPage from '@/pages/teacher/TeacherGradingPage';
import TeacherStudentsPage from '@/pages/teacher/TeacherStudentsPage';
import StudentDashboard from '@/pages/student/StudentDashboard';
import StudentClassesPage from '@/pages/student/StudentClassesPage';
import ProfilePage from '@/pages/shared/ProfilePage';

function defaultPageForRole(role: string): string {
  if (role === 'admin') return 'admin-dashboard';
  if (role === 'teacher') return 'teacher-dashboard';
  return 'student-dashboard';
}

function PageContent({
  page,
  onNavigate,
}: {
  page: string;
  onNavigate: (p: string) => void;
}) {
  switch (page) {
    case 'admin-dashboard':
      return <AdminDashboard />;
    case 'admin-teachers':
      return <AdminTeachersPage />;
    case 'admin-auth':
      return <AdminAuthPage />;
    case 'admin-users':
      return <AdminUsersPage />;
    case 'admin-question-library':
      return <AdminQuestionLibraryPage />;
    case 'teacher-dashboard':
      return <TeacherDashboard />;
    case 'teacher-classes':
      return <TeacherClassesPage />;
    case 'teacher-courses':
      return <TeacherCoursesPage />;
    case 'teacher-assignment-templates':
      return <TeacherAssignmentTemplatesPage />;
    case 'teacher-question-library':
      return <TeacherQuestionLibraryPage />;
    case 'teacher-assignments':
      return <TeacherAssignmentsPage />;
    case 'teacher-grading':
      return <TeacherGradingPage />;
    case 'teacher-students':
      return <TeacherStudentsPage />;
    case 'student-dashboard':
      return <StudentDashboard />;
    case 'student-classes':
      return <StudentClassesPage />;
    case 'profile':
      return <ProfilePage />;
    default:
      return (
        <div className="flex h-full items-center justify-center p-8 text-slate-400">
          Page not found.
        </div>
      );
  }
}

function AppRouter() {
  const { user, profile, loading, authView, sessionExpired, accountDisabled, setAuthView, clearSessionExpired, clearAccountDisabled } = useAuth();
  const [currentPage, setCurrentPage] = useState<string>('');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Unauthenticated views
  if (!user || !profile) {
    if (authView === 'register') {
      return <RegisterPage onSwitchToLogin={() => setAuthView('login')} />;
    }
    if (authView === 'forgot-password') {
      return (
        <ForgotPasswordPage
          onBackToLogin={() => setAuthView('login')}
        />
      );
    }
    if (authView === 'reset-password') {
      return (
        <ResetPasswordPage
          onBackToLogin={() => {
            setAuthView('login');
            clearSessionExpired();
          }}
        />
      );
    }
    return (
      <>
        <LoginPage
          onSwitchToRegister={() => setAuthView('register')}
          onSwitchToForgot={() => setAuthView('forgot-password')}
        />
        {sessionExpired && (
          <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-amber-50 border border-amber-200 px-5 py-3 text-sm text-amber-700 shadow-lg">
            Your session has expired. Please sign in again.
          </div>
        )}
        {accountDisabled && (
          <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-red-50 border border-red-200 px-5 py-3 text-sm text-red-700 shadow-lg">
            Your account has been disabled. Please contact your administrator.
          </div>
        )}
      </>
    );
  }

  // Authenticated — prevent showing login if already logged in
  const rolePrefix = profile.role === 'admin' ? 'admin' : profile.role;
  const activePage =
    currentPage && (currentPage.startsWith(rolePrefix) || currentPage === 'profile')
      ? currentPage
      : defaultPageForRole(profile.role);

  return (
    <AppShell currentPage={activePage} onNavigate={setCurrentPage}>
      <PageContent page={activePage} onNavigate={setCurrentPage} />
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
