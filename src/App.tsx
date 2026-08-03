import { useState, useEffect } from 'react';
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
import StudentAssignmentsPage from '@/pages/student/StudentAssignmentsPage';
import StudentAssignmentDetailPage from '@/pages/student/StudentAssignmentDetailPage';
import StudentWorkspace from '@/pages/student/StudentWorkspace';
import ProfilePage from '@/pages/shared/ProfilePage';
import type { StudentAssignmentItem } from '@/types/database';

function defaultPageForRole(role: string): string {
  if (role === 'admin') return 'admin-dashboard';
  if (role === 'teacher') return 'teacher-dashboard';
  return 'student-dashboard';
}

function PageContent({
  page,
  onNavigate,
  navState,
}: {
  page: string;
  onNavigate: (p: string, state?: unknown) => void;
  navState?: unknown;
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
    case 'admin-classes':
      return <TeacherClassesPage />;
    case 'admin-courses':
      return <TeacherCoursesPage />;
    case 'admin-assignment-templates':
      return <TeacherAssignmentTemplatesPage />;
    case 'admin-assignments':
      return <TeacherAssignmentsPage />;
    case 'admin-grading':
      return <TeacherGradingPage />;
    case 'admin-students':
      return <TeacherStudentsPage />;
    case 'teacher-dashboard':
      return <TeacherDashboard onNavigate={onNavigate} />;
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
      return <TeacherGradingPage navState={navState} />;
    case 'teacher-students':
      return <TeacherStudentsPage />;
    case 'student-dashboard':
      return <StudentDashboard onOpenAssignments={() => onNavigate('student-assignments')} onNavigate={onNavigate} />;
    case 'student-classes':
      return <StudentClassesPage />;
    case 'student-assignments':
      return (
        <StudentAssignmentsPage
          onOpenAssignment={(id) => onNavigate('student-assignment-detail', { assignmentId: id })}
        />
      );
    case 'student-assignment-detail': {
      const detailState = navState as { assignmentId: number } | undefined;
      if (!detailState?.assignmentId) {
        return <StudentAssignmentsPage onOpenAssignment={(id) => onNavigate('student-assignment-detail', { assignmentId: id })} />;
      }
      return (
        <StudentAssignmentDetailPage
          assignmentId={detailState.assignmentId}
          onBack={() => onNavigate('student-assignments')}
          onOpenItem={(item) => onNavigate('student-workspace', { item, assignmentName: item.type_name })}
        />
      );
    }
    case 'student-workspace': {
      const wsState = navState as { item: StudentAssignmentItem; assignmentName: string } | undefined;
      if (!wsState?.item) {
        return <StudentAssignmentsPage onOpenAssignment={(id) => onNavigate('student-assignment-detail', { assignmentId: id })} />;
      }
      return (
        <StudentWorkspace
          item={wsState.item}
          assignmentName={wsState.assignmentName}
          onBack={() => onNavigate('student-assignment-detail', { assignmentId: wsState.item.published_assignment_id })}
          onComplete={() => onNavigate('student-assignment-detail', { assignmentId: wsState.item.published_assignment_id })}
        />
      );
    }
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
  const [pageState, setPageState] = useState<unknown>(undefined);
  const [navKey, setNavKey] = useState(0);

  // Browser back/forward support
  useEffect(() => {
    const handler = () => {
      const st = window.history.state as { page?: string; state?: unknown; navKey?: number } | null;
      if (st?.page) {
        setCurrentPage(st.page);
        setPageState(st.state);
        if (st.navKey !== undefined) setNavKey(st.navKey);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const pushHistory = (page: string, state: unknown) => {
    const newKey = navKey + 1;
    setNavKey(newKey);
    window.history.pushState({ page, state, navKey: newKey }, '');
  };

  // Initialize history state on first render
  useEffect(() => {
    window.history.replaceState({ page: currentPage, state: pageState, navKey: 0 }, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const isWorkspace = activePage === 'student-workspace';

  if (isWorkspace) {
    return (
      <div className="h-screen overflow-hidden bg-slate-50">
        <PageContent
          key={navKey}
          page={activePage}
          onNavigate={(page, state) => {
            setCurrentPage(page);
            setPageState(state);
            pushHistory(page, state);
          }}
          navState={pageState}
        />
      </div>
    );
  }

  return (
    <AppShell
      currentPage={activePage}
      onNavigate={(page) => {
        setCurrentPage(page);
        setPageState(undefined);
        pushHistory(page, undefined);
      }}
    >
      <PageContent
        key={navKey}
        page={activePage}
        onNavigate={(page, state) => {
          setCurrentPage(page);
          setPageState(state);
          pushHistory(page, state);
        }}
        navState={pageState}
      />
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
