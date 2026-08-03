import { ReactNode, useState } from 'react';
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
  ShieldCheck,
  UserCog,
  Pin,
  PinOff,
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
    { label: 'Classes', page: 'admin-classes', icon: <School size={18} /> },
    { label: 'Courses', page: 'admin-courses', icon: <BookOpen size={18} /> },
    { label: 'Question Bank', page: 'admin-question-library', icon: <BookOpen size={18} /> },
    { label: 'Assignment Presets', page: 'admin-assignment-templates', icon: <FileText size={18} /> },
    { label: 'Assignments', page: 'admin-assignments', icon: <ClipboardList size={18} /> },
    { label: 'Grading', page: 'admin-grading', icon: <CheckSquare size={18} /> },
    { label: 'Students', page: 'admin-students', icon: <Users size={18} /> },
    { label: 'Teachers', page: 'admin-teachers', icon: <Users size={18} /> },
    { label: 'Users', page: 'admin-users', icon: <UserCog size={18} /> },
    { label: 'Authentication', page: 'admin-auth', icon: <ShieldCheck size={18} /> },
  ],
  teacher: [
    { label: 'Dashboard', page: 'teacher-dashboard', icon: <LayoutDashboard size={18} /> },
    { label: 'Classes', page: 'teacher-classes', icon: <School size={18} /> },
    { label: 'Courses', page: 'teacher-courses', icon: <BookOpen size={18} /> },
    { label: 'Question Bank', page: 'teacher-question-library', icon: <BookOpen size={18} /> },
    { label: 'Assignment Presets', page: 'teacher-assignment-templates', icon: <FileText size={18} /> },
    { label: 'Assignments', page: 'teacher-assignments', icon: <ClipboardList size={18} /> },
    { label: 'Grading', page: 'teacher-grading', icon: <CheckSquare size={18} /> },
    { label: 'Students', page: 'teacher-students', icon: <Users size={18} /> },
  ],
  student: [
    { label: 'Dashboard', page: 'student-dashboard', icon: <LayoutDashboard size={18} /> },
    { label: 'My Classes', page: 'student-classes', icon: <GraduationCap size={18} /> },
    { label: 'My Assignments', page: 'student-assignments', icon: <ClipboardList size={18} /> },
  ],
};

interface Props {
  currentPage: string;
  onNavigate: (page: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ currentPage, onNavigate, collapsed, onToggleCollapse }: Props) {
  const { profile, user, signOut } = useAuth();
  const [hovered, setHovered] = useState(false);
  if (!profile) return null;

  const items = navByRole[profile.role];
  const roleLabel =
    profile.role === 'admin'
      ? 'Administrator'
      : profile.role === 'teacher'
      ? 'Teacher'
      : 'Student';

  // When collapsed and hovered, show expanded content.
  // When pinned (not collapsed), always expanded.
  const showExpanded = !collapsed || hovered;
  const widthClass = showExpanded ? 'w-64' : 'w-16';

  return (
    <aside
      className={`flex h-full flex-col bg-slate-900 text-slate-100 transition-[width] duration-200 ${widthClass}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Scrollable panel — logo, pin toggle, nav, and account all scroll together */}
      <div className="flex-1 overflow-y-auto">
        {/* Logo + pin toggle */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-3 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600">
            <GraduationCap size={20} className="text-white" />
          </div>
          {showExpanded && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight text-white">CAM</p>
              <p className="truncate text-xs text-slate-400">Class Assessment Management</p>
            </div>
          )}
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Pin sidebar open' : 'Unpin to auto-collapse'}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
          >
            {collapsed ? <Pin size={16} /> : <PinOff size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="px-2 py-4">
          {showExpanded && (
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              {roleLabel}
            </p>
          )}
          <ul className="space-y-0.5">
            {items.map((item) => {
              const isActive = currentPage === item.page;
              return (
                <li key={item.page}>
                  <button
                    onClick={() => onNavigate(item.page)}
                    title={showExpanded ? undefined : item.label}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                      showExpanded ? '' : 'justify-center'
                    } ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {showExpanded && <span className="flex-1 text-left">{item.label}</span>}
                    {showExpanded && isActive && <ChevronRight size={14} className="text-blue-200" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Account section — clickable to open profile */}
        <div className="border-t border-slate-800 px-3 py-4">
          <button
            onClick={() => onNavigate('profile')}
            title={showExpanded ? undefined : `${user?.email ?? ''}`}
            className={`mb-3 flex w-full items-center gap-3 rounded-xl bg-slate-800 px-3 py-2.5 transition hover:bg-slate-700 ${
              showExpanded ? '' : 'justify-center'
            }`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              {(user?.email?.[0] ?? 'U').toUpperCase()}
            </div>
            {showExpanded && (
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-xs font-medium text-slate-200">{user?.email}</p>
                <p className="text-[11px] capitalize text-slate-500">{profile.role}</p>
              </div>
            )}
          </button>
          <button
            onClick={signOut}
            title={showExpanded ? undefined : 'Sign out'}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-800 hover:text-slate-300 ${
              showExpanded ? '' : 'justify-center'
            }`}
          >
            <LogOut size={16} />
            {showExpanded && 'Sign out'}
          </button>
        </div>
      </div>
    </aside>
  );
}
