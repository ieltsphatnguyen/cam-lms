import { useState, useEffect, FormEvent } from 'react';
import {
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  UserCheck,
  Mail,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Teacher } from '@/types/database';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface TeacherWithEmail extends Teacher {
  email?: string;
}

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<TeacherWithEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  async function loadTeachers() {
    const { data } = await supabase.from('teachers').select('id, name');
    setTeachers(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadTeachers();
  }, []);

  function openModal() {
    setForm({ name: '', email: '', password: '' });
    setFormError('');
    setFormSuccess('');
    setModalOpen(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setFormError('All fields are required.');
      return;
    }
    if (form.password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    setFormLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated.');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-teacher`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
          }),
        }
      );

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Failed to create teacher.');

      setFormSuccess(`Teacher "${form.name.trim()}" was created successfully.`);
      setForm({ name: '', email: '', password: '' });
      await loadTeachers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create teacher.');
    } finally {
      setFormLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Teachers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create and manage teacher accounts.
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openModal}>
          Add Teacher
        </Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : teachers.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 text-center">
          <UserCheck size={32} className="text-slate-300" />
          <p className="text-sm text-slate-500">No teachers yet.</p>
          <Button variant="secondary" size="sm" onClick={openModal}>
            Add the first teacher
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Name
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  ID
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {teachers.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-4 font-medium text-slate-800">{t.name}</td>
                  <td className="px-5 py-4 text-slate-400">#{t.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Teacher"
      >
        {formSuccess ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle size={24} className="text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-slate-700">{formSuccess}</p>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Done
              </Button>
              <Button onClick={() => { setFormSuccess(''); }}>
                Add another
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <p className="text-sm text-slate-500">
              The teacher will receive login credentials and can sign in immediately.
            </p>
            {formError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {formError}
              </div>
            )}
            <Input
              label="Full name"
              placeholder="Sarah Johnson"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="Email address"
              type="email"
              placeholder="sarah@school.edu"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Input
              label="Initial password"
              type="password"
              placeholder="At least 6 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              hint="The teacher should change this after first sign-in."
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={formLoading}>
                Create teacher
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
