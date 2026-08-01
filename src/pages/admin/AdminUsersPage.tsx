import { useState, useEffect } from 'react';
import {
  Users,
  Search,
  AlertCircle,
  CheckCircle,
  KeyRound,
  Ban,
  RotateCcw,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  Calendar,
  History,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface ManagedUser {
  id: string;
  role: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  disabled: boolean;
  teacher_id: number | null;
  student_id: number | null;
  created_at: string;
  last_sign_in_at: string | null;
  auth_created_at: string | null;
}

interface AuditEntry {
  id: string;
  admin_email: string;
  target_email: string;
  previous_role: string;
  new_role: string;
  created_at: string;
}

type Filter = 'all' | 'teacher' | 'student' | 'admin';
type ActionType = 'reset_password' | 'disable' | 'restore' | 'change_role' | null;

const ROLE_ORDER: Record<string, number> = { student: 0, teacher: 1, admin: 2 };

import { formatDate as fmtDate, formatDateTime as fmtDateTime } from '@/lib/format';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return fmtDate(iso) || '—';
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return fmtDateTime(iso) || '—';
}

function roleBadgeClass(role: string): string {
  if (role === 'admin') return 'bg-purple-50 text-purple-600';
  if (role === 'teacher') return 'bg-blue-50 text-blue-600';
  return 'bg-emerald-50 text-emerald-600';
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');

  const [actionUser, setActionUser] = useState<ManagedUser | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const [showAuditLog, setShowAuditLog] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated.');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user-management?action=list`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Failed to load users.');
      setUsers(payload.users ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }

  async function loadAuditLog() {
    try {
      const { data, error: auditError } = await supabase
        .from('role_audit_log')
        .select('id, admin_email, target_email, previous_role, new_role, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (auditError) throw auditError;
      setAuditLog(data ?? []);
    } catch {
      // Audit log load failure is non-fatal
    }
  }

  useEffect(() => {
    loadUsers();
    loadAuditLog();
  }, []);

  function openAction(u: ManagedUser, type: Exclude<ActionType, null>) {
    setActionUser(u);
    setActionType(type);
    setActionError('');
    setActionSuccess('');
    setNewPassword('');
    if (type === 'change_role') {
      // Default to the next role up or down
      const current = ROLE_ORDER[u.role] ?? 0;
      if (u.role === 'student') setNewRole('teacher');
      else if (u.role === 'teacher') setNewRole('admin');
      else setNewRole('teacher');
    } else {
      setNewRole('');
    }
  }

  function closeAction() {
    setActionUser(null);
    setActionType(null);
    setActionError('');
    setActionSuccess('');
    setNewPassword('');
    setNewRole('');
  }

  async function executeAction() {
    if (!actionUser || !actionType) return;
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated.');

      const body: Record<string, string> = { user_id: actionUser.id };

      if (actionType === 'reset_password') {
        if (newPassword.length < 6) {
          setActionError('Password must be at least 6 characters.');
          setActionLoading(false);
          return;
        }
        body.password = newPassword;
      }

      if (actionType === 'change_role') {
        body.new_role = newRole;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user-management?action=${actionType}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Action failed.');

      if (actionType === 'reset_password') {
        setActionSuccess('Password reset successfully. The user can now sign in with the new password.');
      } else if (actionType === 'disable') {
        setActionSuccess('Account has been disabled. The user will not be able to sign in.');
        setUsers((prev) => prev.map((u) => u.id === actionUser.id ? { ...u, disabled: true } : u));
      } else if (actionType === 'restore') {
        setActionSuccess('Account has been restored. The user can sign in again.');
        setUsers((prev) => prev.map((u) => u.id === actionUser.id ? { ...u, disabled: false } : u));
      } else if (actionType === 'change_role') {
        const prevRole = actionUser.role;
        const roleLabel = newRole.charAt(0).toUpperCase() + newRole.slice(1);
        setActionSuccess(`Role changed from ${prevRole} to ${roleLabel}.`);
        setUsers((prev) => prev.map((u) => u.id === actionUser.id ? { ...u, role: newRole } : u));
        loadAuditLog();
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  }

  const filtered = users.filter((u) => {
    if (filter !== 'all' && u.role !== filter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        u.email.toLowerCase().includes(q) ||
        (u.display_name?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const adminCount = users.filter((u) => u.role === 'admin' && !u.disabled).length;

  const modalTitle =
    actionType === 'reset_password' ? 'Reset Password'
    : actionType === 'disable' ? 'Disable Account'
    : actionType === 'restore' ? 'Restore Account'
    : 'Change Role';

  // Role change modal content
  const roleChangeDescription = actionUser
    ? actionUser.role === 'student'
      ? `Promote this student to Teacher. They will be able to create classes and manage assignments.`
      : actionUser.role === 'teacher'
      ? newRole === 'admin'
        ? `Promote this teacher to Administrator. They will receive full system access including user management.`
        : `Demote this teacher to Student. They will lose the ability to create classes and manage assignments.`
      : `Demote this administrator to Teacher. They will lose user management access but can still manage classes.`
    : '';

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Users</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage user accounts, roles, and permissions. Accounts are never permanently deleted.
          </p>
        </div>
        <button
          onClick={() => setShowAuditLog(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          <History size={15} />
          Activity Log
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Search + filter */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'admin', 'teacher', 'student'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-xl px-3.5 py-2 text-sm font-medium capitalize transition ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f === 'all' ? 'All' : f + 's'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 text-center">
          <Users size={32} className="text-slate-300" />
          <p className="text-sm text-slate-500">No users found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">User</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Role</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Last Login</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Created</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((u) => {
                const isSelf = u.id === user?.id;
                const isLastAdmin = u.role === 'admin' && !u.disabled && adminCount <= 1;
                return (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-sm font-bold text-slate-400">
                              {(u.email[0] ?? 'U').toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">
                            {u.display_name ?? u.email}
                          </p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium capitalize ${roleBadgeClass(u.role)}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {isSelf ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                          You
                        </span>
                      ) : u.disabled ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
                          <Ban size={11} />
                          Disabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600">
                          <CheckCircle size={11} />
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock size={12} className="text-slate-400" />
                        {formatDate(u.last_sign_in_at)}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Calendar size={12} className="text-slate-400" />
                        {formatDate(u.auth_created_at ?? u.created_at)}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Role change */}
                        <button
                          onClick={() => openAction(u, 'change_role')}
                          disabled={isSelf}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-purple-50 hover:text-purple-600 disabled:cursor-not-allowed disabled:opacity-30"
                          title={isSelf ? 'You cannot change your own role' : 'Change role'}
                        >
                          {ROLE_ORDER[u.role] < 2 ? (
                            <ArrowUpCircle size={15} />
                          ) : (
                            <ArrowDownCircle size={15} />
                          )}
                        </button>
                        {/* Reset password */}
                        <button
                          onClick={() => openAction(u, 'reset_password')}
                          disabled={isSelf}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                          title={isSelf ? 'You cannot reset your own password from here' : 'Reset password'}
                        >
                          <KeyRound size={15} />
                        </button>
                        {/* Disable / Restore */}
                        {u.disabled ? (
                          <button
                            onClick={() => openAction(u, 'restore')}
                            disabled={isSelf}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-30"
                            title="Restore account"
                          >
                            <RotateCcw size={15} />
                          </button>
                        ) : (
                          <button
                            onClick={() => openAction(u, 'disable')}
                            disabled={isSelf || isLastAdmin}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-amber-50 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-30"
                            title={isLastAdmin ? 'At least one administrator must remain active' : 'Disable account'}
                          >
                            <Ban size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Action modal */}
      <Modal
        isOpen={actionUser !== null && !actionSuccess}
        onClose={closeAction}
        title={modalTitle}
        size="sm"
      >
        {actionUser && actionType && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-500">
                {(actionUser.email[0] ?? 'U').toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {actionUser.display_name ?? actionUser.email}
                </p>
                <p className="text-xs text-slate-400">{actionUser.email}</p>
              </div>
            </div>

            {actionType === 'change_role' && (
              <>
                <p className="text-sm text-slate-500">{roleChangeDescription}</p>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">New role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  >
                    {actionUser.role !== 'student' && (
                      <option value="student">Student</option>
                    )}
                    {actionUser.role !== 'teacher' && (
                      <option value="teacher">Teacher</option>
                    )}
                    {actionUser.role !== 'admin' && (
                      <option value="admin">Administrator</option>
                    )}
                  </select>
                </div>
                {newRole === 'admin' && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    This user will receive full system access, including user management.
                  </div>
                )}
                {actionUser.role === 'admin' && newRole !== 'admin' && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    {adminCount <= 1
                      ? 'At least one administrator must remain active.'
                      : 'This administrator will lose user management access.'}
                  </div>
                )}
              </>
            )}

            {actionType === 'reset_password' && (
              <>
                <p className="text-sm text-slate-500">
                  Set a new password for this user. They'll need to use this password
                  the next time they sign in.
                </p>
                <Input
                  label="New password"
                  type="text"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </>
            )}

            {actionType === 'disable' && (
              <p className="text-sm text-slate-500">
                The user will be signed out and won't be able to sign in. Their data
                is preserved and the account can be restored at any time.
              </p>
            )}

            {actionType === 'restore' && (
              <p className="text-sm text-slate-500">
                The user will be able to sign in again with their existing password.
              </p>
            )}

            {actionError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {actionError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" type="button" onClick={closeAction}>
                Cancel
              </Button>
              <Button
                variant={
                  actionType === 'disable' ? 'danger'
                  : actionType === 'change_role' && actionUser.role === 'admin' && newRole !== 'admin' ? 'danger'
                  : 'primary'
                }
                loading={actionLoading}
                onClick={executeAction}
                disabled={
                  actionType === 'change_role' &&
                  actionUser.role === 'admin' &&
                  newRole !== 'admin' &&
                  adminCount <= 1
                }
              >
                {actionType === 'change_role' && (
                  newRole === 'admin' ? 'Promote to Admin' : 'Demote to ' + (newRole.charAt(0).toUpperCase() + newRole.slice(1))
                )}
                {actionType === 'reset_password' && 'Reset password'}
                {actionType === 'disable' && 'Disable account'}
                {actionType === 'restore' && 'Restore account'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Success modal */}
      <Modal
        isOpen={actionSuccess !== ''}
        onClose={closeAction}
        title="Success"
        size="sm"
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle size={24} className="text-emerald-600" />
          </div>
          <p className="text-sm font-medium text-slate-700">{actionSuccess}</p>
          <Button variant="secondary" onClick={closeAction} className="mt-2 w-full">
            Done
          </Button>
        </div>
      </Modal>

      {/* Activity Log modal */}
      <Modal
        isOpen={showAuditLog}
        onClose={() => setShowAuditLog(false)}
        title="Activity Log — Role Changes"
        size="lg"
      >
        {auditLog.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
            <History size={24} className="text-slate-300" />
            <p className="text-sm text-slate-500">No role changes have been recorded yet.</p>
          </div>
        ) : (
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {auditLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white">
                  {ROLE_ORDER[entry.new_role] > ROLE_ORDER[entry.previous_role] ? (
                    <ArrowUpCircle size={15} className="text-emerald-500" />
                  ) : (
                    <ArrowDownCircle size={15} className="text-amber-500" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{entry.admin_email}</span>{' '}
                    {ROLE_ORDER[entry.new_role] > ROLE_ORDER[entry.previous_role] ? 'promoted' : 'demoted'}{' '}
                    <span className="font-medium">{entry.target_email}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    <span className="capitalize">{entry.previous_role}</span>
                    {' → '}
                    <span className="capitalize">{entry.new_role}</span>
                  </p>
                </div>
                <p className="shrink-0 text-xs text-slate-400">
                  {formatDateTime(entry.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
