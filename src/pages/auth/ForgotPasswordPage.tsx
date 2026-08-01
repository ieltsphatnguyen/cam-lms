import { useState, FormEvent } from 'react';
import { GraduationCap, Mail, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface Props {
  onBackToLogin: () => void;
}

export default function ForgotPasswordPage({ onBackToLogin }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/#reset-password` }
      );

      if (resetError) throw resetError;
      setSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email.';
      setError(
        msg.includes('rate limit')
          ? 'Too many requests. Please wait a moment before trying again.'
          : msg
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
            <GraduationCap size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">CAM</h1>
          <p className="mt-1 text-sm text-slate-400">Password Recovery</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle size={28} className="text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">Check your inbox</h2>
              <p className="text-sm text-slate-500">
                We've sent a password reset link to <strong>{email}</strong>.
                Click the link in the email to set a new password.
              </p>
              <Button variant="secondary" className="mt-2 w-full" onClick={onBackToLogin}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h2 className="mb-1 text-xl font-semibold text-slate-800">Forgot password?</h2>
              <p className="mb-6 text-sm text-slate-500">
                Enter your email and we'll send you a link to reset your password.
              </p>

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
                <Button type="submit" loading={loading} className="w-full" size="lg">
                  Send reset link
                </Button>
              </form>

              <button
                onClick={onBackToLogin}
                className="mt-6 flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
              >
                <ArrowLeft size={14} />
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
