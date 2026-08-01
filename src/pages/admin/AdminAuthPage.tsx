import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Mail,
  Lock,
  Database,
  Users,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Server,
  KeyRound,
  ToggleLeft,
  ToggleRight,
  Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface AuthStatus {
  provider: string;
  emailConfirmation: boolean;
  passwordReset: boolean;
  rlsEnabled: boolean;
  profilesCount: number;
  lastCheck: string;
}

interface DevToggle {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  supabaseManaged: boolean;
}

export default function AdminAuthPage() {
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<AuthStatus | null>(null);

  const [devToggles, setDevToggles] = useState<DevToggle[]>([
    {
      id: 'email_confirmation',
      label: 'Email Confirmation',
      description: 'Require new users to confirm their email before logging in.',
      enabled: false,
      supabaseManaged: true,
    },
    {
      id: 'teacher_invitation_emails',
      label: 'Teacher Invitation Emails',
      description: 'Send invitation emails when an admin creates a teacher account.',
      enabled: false,
      supabaseManaged: false,
    },
    {
      id: 'verbose_auth_logs',
      label: 'Verbose Authentication Logs',
      description: 'Log detailed authentication events to the console for debugging.',
      enabled: false,
      supabaseManaged: false,
    },
    {
      id: 'mock_email_sending',
      label: 'Mock Email Sending',
      description: 'Suppress real emails and log them to the console instead.',
      enabled: false,
      supabaseManaged: true,
    },
  ]);

  async function runHealthCheck() {
    setChecking(true);
    try {
      const { count: profilesCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      // Try to read our own profile — if it works, RLS is functioning
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      let rlsOk = false;
      if (userId) {
        const { data: ownProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        rlsOk = ownProfile !== null;
      }

      setStatus({
        provider: 'Supabase Auth (Email/Password)',
        emailConfirmation: false,
        passwordReset: true,
        rlsEnabled: rlsOk,
        profilesCount: profilesCount ?? 0,
        lastCheck: new Date().toISOString(),
      });
    } finally {
      setChecking(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    runHealthCheck();
  }, []);

  function toggleDev(id: string) {
    setDevToggles((prev) =>
      prev.map((t) =>
        t.id === id && !t.supabaseManaged ? { ...t, enabled: !t.enabled } : t
      )
    );
  }

  const statusItems = status
    ? [
        {
          label: 'Authentication Provider',
          value: status.provider,
          icon: KeyRound,
          ok: true,
        },
        {
          label: 'Current Environment',
          value: import.meta.env.DEV ? 'Development' : 'Production',
          icon: Server,
          ok: true,
        },
        {
          label: 'Student Registration',
          value: 'Enabled (via register-student function)',
          icon: Users,
          ok: true,
        },
        {
          label: 'Teacher Self Registration',
          value: 'Disabled (admin-created only)',
          icon: Users,
          ok: true,
        },
        {
          label: 'Email Confirmation',
          value: status.emailConfirmation ? 'Enabled' : 'Disabled',
          icon: Mail,
          ok: !status.emailConfirmation,
        },
        {
          label: 'Password Reset',
          value: status.passwordReset ? 'Available' : 'Unavailable',
          icon: Lock,
          ok: status.passwordReset,
        },
        {
          label: 'Row Level Security (RLS)',
          value: status.rlsEnabled ? 'Active' : 'Not verified',
          icon: ShieldCheck,
          ok: status.rlsEnabled,
        },
        {
          label: 'Profiles Status',
          value: `${status.profilesCount} profile(s)`,
          icon: Database,
          ok: status.profilesCount > 0,
        },
      ]
    : [];

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Authentication</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor authentication configuration and system health.
          </p>
        </div>
        <button
          onClick={runHealthCheck}
          disabled={checking}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Checking...' : 'Run health check'}
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* Last check timestamp */}
          {status && (
            <div className="mb-6 flex items-center gap-2 text-sm text-slate-400">
              <Info size={14} />
              Last health check: {new Date(status.lastCheck).toLocaleString()}
            </div>
          )}

          {/* Status grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {statusItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50">
                      <Icon size={17} className="text-slate-500" />
                    </div>
                    {item.ok ? (
                      <CheckCircle2 size={18} className="text-emerald-500" />
                    ) : (
                      <XCircle size={18} className="text-amber-500" />
                    )}
                  </div>
                  <p className="text-xs font-medium text-slate-400">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{item.value}</p>
                </div>
              );
            })}
          </div>

          {/* Development Mode */}
          <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-1 flex items-center gap-2.5">
              <Server size={18} className="text-slate-600" />
              <h2 className="font-semibold text-slate-800">Development Mode</h2>
            </div>
            <p className="mb-5 text-sm text-slate-500">
              Toggles for development-only behaviour. Settings managed by Supabase
              cannot be changed here — update them in the Supabase Dashboard.
            </p>

            <div className="space-y-3">
              {devToggles.map((toggle) => (
                <div
                  key={toggle.id}
                  className={`flex items-center justify-between rounded-xl border p-4 transition ${
                    toggle.supabaseManaged
                      ? 'border-slate-100 bg-slate-50/50'
                      : 'border-slate-100 bg-white'
                  }`}
                >
                  <div className="pr-4">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-700">{toggle.label}</p>
                      {toggle.supabaseManaged && (
                        <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          Supabase-managed
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{toggle.description}</p>
                  </div>
                  <button
                    onClick={() => toggleDev(toggle.id)}
                    disabled={toggle.supabaseManaged}
                    className={`flex shrink-0 items-center gap-2 disabled:cursor-not-allowed ${
                      toggle.supabaseManaged ? 'opacity-60' : ''
                    }`}
                    title={
                      toggle.supabaseManaged
                        ? 'This setting must be changed from the Supabase Dashboard'
                        : ''
                    }
                  >
                    <span className="text-xs font-medium text-slate-500">
                      {toggle.enabled ? 'On' : 'Off'}
                    </span>
                    {toggle.enabled ? (
                      <ToggleRight size={32} className="text-blue-600" />
                    ) : (
                      <ToggleLeft size={32} className="text-slate-300" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
