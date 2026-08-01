import { useState, useEffect, useRef, FormEvent } from 'react';
import {
  UserCircle,
  Mail,
  Lock,
  Camera,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

type Tab = 'profile' | 'email' | 'password';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '');
      setAvatarUrl(profile.avatar_url ?? null);
    }
    if (user?.email) {
      setNewEmail(user.email);
    }
  }, [profile, user?.email]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      setProfileMsg({ type: 'error', text: 'Image must be under 2 MB.' });
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setProfileMsg({ type: 'error', text: 'Only JPG, PNG, WebP, or GIF images are allowed.' });
      return;
    }

    setUploadingAvatar(true);
    setProfileMsg(null);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      const url = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(url);

      const { error: rpcError } = await supabase.rpc('update_own_profile', {
        p_display_name: displayName,
        p_avatar_url: url,
      });

      if (rpcError) throw rpcError;
      await refreshProfile();
      setProfileMsg({ type: 'success', text: 'Avatar updated successfully.' });
    } catch (err: unknown) {
      setProfileMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload avatar.',
      });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const { error } = await supabase.rpc('update_own_profile', {
        p_display_name: displayName.trim(),
        p_avatar_url: avatarUrl,
      });
      if (error) throw error;
      await refreshProfile();
      setProfileMsg({ type: 'success', text: 'Profile saved successfully.' });
    } catch (err: unknown) {
      setProfileMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save profile.',
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangeEmail(e: FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    if (!newEmail.trim()) {
      setEmailMsg({ type: 'error', text: 'Email cannot be empty.' });
      return;
    }
    if (newEmail.trim() === user?.email) {
      setEmailMsg({ type: 'error', text: 'This is already your email address.' });
      return;
    }

    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail.trim(),
      });

      if (error) throw error;

      setEmailMsg({
        type: 'success',
        text: 'Email change initiated. Please check both your old and new inbox to confirm the change.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change email.';
      setEmailMsg({
        type: 'error',
        text: msg.includes('rate limit')
          ? 'Too many requests. Please wait before trying again.'
          : msg,
      });
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setPasswordMsg({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change password.';
      setPasswordMsg({
        type: 'error',
        text: msg.includes('rate limit')
          ? 'Too many requests. Please wait before trying again.'
          : msg,
      });
    } finally {
      setSavingPassword(false);
    }
  }

  const roleLabel =
    profile?.role === 'admin' ? 'Administrator'
    : profile?.role === 'teacher' ? 'Teacher'
    : 'Student';

  const tabs: { id: Tab; label: string; icon: typeof UserCircle }[] = [
    { id: 'profile', label: 'Profile', icon: UserCircle },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'password', label: 'Password', icon: Lock },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Profile Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your account information, email, and password.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        {/* Tabs sidebar */}
        <div className="flex gap-2 lg:flex-col">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          {/* Profile tab */}
          {tab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-100">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-slate-400">
                        {(user?.email?.[0] ?? 'U').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50"
                    title="Upload avatar"
                  >
                    {uploadingAvatar ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Camera size={13} />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Avatar</p>
                  <p className="text-xs text-slate-400">
                    JPG, PNG, WebP or GIF. Max 2 MB.
                  </p>
                </div>
              </div>

              {/* Display name + email (read-only) */}
              <Input
                label="Display name"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Email address
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                  <Mail size={15} className="text-slate-400" />
                  <span className="text-sm text-slate-600">{user?.email}</span>
                  <span className="ml-auto rounded-lg bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
                    {roleLabel}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  To change your email, go to the Email tab.
                </p>
              </div>

              {profileMsg && (
                <div
                  className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
                    profileMsg.type === 'success'
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-red-100 bg-red-50 text-red-700'
                  }`}
                >
                  {profileMsg.type === 'success' ? (
                    <CheckCircle size={16} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  )}
                  {profileMsg.text}
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" loading={savingProfile}>
                  Save changes
                </Button>
              </div>
            </form>
          )}

          {/* Email tab */}
          {tab === 'email' && (
            <form onSubmit={handleChangeEmail} className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Change Email</h3>
                <p className="mt-1 text-sm text-slate-500">
                  After updating, you'll need to confirm the change via a link sent to
                  both your old and new email address.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Current email
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                  <Mail size={15} className="text-slate-400" />
                  <span className="text-sm text-slate-600">{user?.email}</span>
                </div>
              </div>

              <Input
                label="New email address"
                type="email"
                placeholder="new@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />

              {emailMsg && (
                <div
                  className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
                    emailMsg.type === 'success'
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-red-100 bg-red-50 text-red-700'
                  }`}
                >
                  {emailMsg.type === 'success' ? (
                    <CheckCircle size={16} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  )}
                  {emailMsg.text}
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" loading={savingEmail}>
                  Update email
                </Button>
              </div>
            </form>
          )}

          {/* Password tab */}
          {tab === 'password' && (
            <form onSubmit={handleChangePassword} className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Change Password</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Choose a strong password of at least 6 characters.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasswords((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
                >
                  {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showPasswords ? 'Hide' : 'Show'}
                </button>
              </div>

              <Input
                label="New password"
                type={showPasswords ? 'text' : 'password'}
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <Input
                label="Confirm new password"
                type={showPasswords ? 'text' : 'password'}
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />

              {passwordMsg && (
                <div
                  className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
                    passwordMsg.type === 'success'
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-red-100 bg-red-50 text-red-700'
                  }`}
                >
                  {passwordMsg.type === 'success' ? (
                    <CheckCircle size={16} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  )}
                  {passwordMsg.text}
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" loading={savingPassword}>
                  Change password
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
