import { useState, FormEvent } from 'react';
import { GraduationCap, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface Props {
  onSwitchToRegister: () => void;
  onSwitchToForgot: () => void;
}

export default function LoginPage({ onSwitchToRegister, onSwitchToForgot }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      setError(
        msg.includes('Invalid login credentials')
          ? 'Incorrect email or password.'
          : msg
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
            <GraduationCap size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">CAM</h1>
          <p className="mt-1 text-sm text-slate-400">Class &amp; Assignment Management</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <h2 className="mb-1 text-xl font-semibold text-slate-800">Welcome</h2>
          <p className="mb-6 text-sm text-slate-500">Sign in to your account to continue.</p>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onSwitchToForgot}
                className="text-sm text-blue-600 transition hover:text-blue-700 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <Button
              type="submit"
              loading={loading}
              className="w-full"
              size="lg"
            >
              Sign in
            </Button>
          </form>
        </div>

        {/* Register link — students only */}
        <p className="mt-6 text-center text-sm text-slate-400">
          New student?{' '}
          <button
            onClick={onSwitchToRegister}
            className="font-medium text-blue-400 hover:text-blue-300 hover:underline"
          >
            Create a student account
          </button>
        </p>
      </div>
    </div>
  );
}
