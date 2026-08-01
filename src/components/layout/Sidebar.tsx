import { ReactNode } from 'react';
import { Role } from '@/types/database';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  GraduationCap,
  LogOut,
  ChevronRight,
  School,
  ClipboardList,
  FileText,
  CheckSquare,
  UserCircle,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  label: string;
  page: string;
  icon: ReactNode;
}

const navByRole: Record<Role, NavItem[]> = {
  admin: [
    { label: 'Dashboard', page: 'admin-dashboard', icon: <LayoutDashboard size={18} /> },
    { label: 'Teachers', page: 'admin-teachers', icon: <Users size={18} /> },
    { label: 'Users', page: 'admin-users', icon: <UserCog size={18} /> },
    { label: 'Authentication', page: 'admin-auth', icon: <ShieldCheck size={18} /> },
    { label: 'Question Bank', page: 'admin-question-library', icon: <BookOpen size={18} /> },
    { label: 'Profile', page: 'profile', icon: <UserCircle size={18} /> },
  ],
  teacher: [
    { label: 'Dashboard', page: 'teacher-dashboard', icon: <LayoutDashboard size={18} /> },
    { label: 'Classes', page: 'teacher-classes', icon: <School size={18} /> },
    { label: 'Courses', page: 'teacher-courses', icon: <BookOpen size={18} /> },
    { label: 'Question Bank', page: 'teacher-question-library', icon: <BookOpen size={18} /> },
    { label: 'Assignment Templates', page: 'teacher-assignment-templates', icon: <FileText size={18} /> },
    { label: 'Assignments', page: 'teacher-assignments', icon: <ClipboardList size={18} /> },
    { label: 'Grading', page: 'teacher-grading', icon: <CheckSquare size={18} /> },
    { label: 'Students', page: 'teacher-students', icon: <Users size={18} /> },
    { label: 'Profile', page: 'profile', icon: <UserCircle size={18} /> },
  ],
  student: [
    { label: 'Dashboard', page: 'student-dashboard', icon: <LayoutDashboard size={18} /> },
    { label: 'My Classes', page: 'student-classes', icon: <GraduationCap size={18} /> },
    { label: 'Profile', page: 'profile', icon: <UserCircle size={18} /> },
  ],
};

interface Props {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function Sidebar({ currentPage, onNavigate }: Props) {
  const { profile, user, signOut } = useAuth();
  if (!profile) return null;

  const items = navByRole[profile.role];
  const roleLabel =
    profile.role === 'admin'
      ? 'Administrator'
      : profile.role === 'teacher'
      ? 'Teacher'
      : 'Student';

  return (
    <aside className="flex h-full w-64 flex-col bg-slate-900 text-slate-100">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-slate-800 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
          <GraduationCap size={20} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-white">CAM</p>
          <p className="text-xs text-slate-400">Class Assessment Management</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          {roleLabel}
        </p>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const isActive = currentPage === item.page;
            return (
              <li key={item.page}>
                <button
                  onClick={() => onNavigate(item.page)}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {isActive && <ChevronRight size={14} className="text-blue-200" />}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-800 px-4 py-4">
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-800 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {(user?.email?.[0] ?? 'U').toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-slate-200">
              {user?.email}
            </p>
            <p className="text-[11px] text-slate-500 capitalize">{profile.role}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
