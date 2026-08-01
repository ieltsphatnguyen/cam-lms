import { useState, useEffect, FormEvent } from 'react';
import {
  Plus,
  Pencil,
  School,
  Users,
  Copy,
  CheckCheck,
  AlertCircle,
  Hash,
  Archive,
  ArchiveRestore,
  Eye,
  EyeOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface ClassRow {
  id: number;
  name: string;
  class_code: string | null;
  archived_at: string | null;
  student_count: number;
}

interface FormState {
  name: string;
  class_code: string;
}

type ModalMode = 'create' | 'edit';

export default function TeacherClassesPage() {
  const { profile } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>({ name: '', class_code: '' });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<number | null>(null);

  async function loadClasses() {
    if (!profile?.teacher_id) return;

    const { data: tcRows } = await supabase
      .from('teacherclasses')
      .select('class_id')
      .eq('teacher_id', profile.teacher_id);

    const classIds = (tcRows ?? []).map((r) => r.class_id);
    if (classIds.length === 0) {
      setClasses([]);
      setLoading(false);
      return;
    }

    const { data: classRows } = await supabase
      .from('classes')
      .select('id, name, class_code, archived_at')
      .in('id', classIds)
      .order('name');

    const counts: Record<number, number> = {};
    await Promise.all(
      (classRows ?? []).map(async (c) => {
        const { count } = await supabase
          .from('classstudents')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', c.id);
        counts[c.id] = count ?? 0;
      })
    );

    setClasses(
      (classRows ?? []).map((c) => ({ ...c, student_count: counts[c.id] ?? 0 }))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadClasses();
  }, [profile?.teacher_id]);

  const visible = showArchived
    ? classes
    : classes.filter((c) => c.archived_at === null);
  const archivedCount = classes.filter((c) => c.archived_at !== null).length;

  function openCreate() {
    setModalMode('create');
    setEditingId(null);
    setForm({ name: '', class_code: '' });
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(cls: ClassRow) {
    setModalMode('edit');
    setEditingId(cls.id);
    setForm({ name: cls.name, class_code: cls.class_code ?? '' });
    setFormError('');
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) {
      setFormError('Class name is required.');
      return;
    }
    if (!form.class_code.trim()) {
      setFormError('Class code is required.');
      return;
    }

    setFormLoading(true);
    try {
      if (modalMode === 'create') {
        const { data: newClass, error: insertError } = await supabase
          .from('classes')
          .insert({
            name: form.name.trim(),
            class_code: form.class_code.trim().toUpperCase(),
          })
          .select('id')
          .single();

        if (insertError) {
          if (insertError.code === '23505') {
            throw new Error('That class code is already taken. Please choose a different one.');
          }
          throw insertError;
        }

        const { error: linkError } = await supabase
          .from('teacherclasses')
          .insert({ teacher_id: profile!.teacher_id!, class_id: newClass.id });

        if (linkError) throw linkError;
      } else {
        const { error: updateError } = await supabase
          .from('classes')
          .update({
            name: form.name.trim(),
            class_code: form.class_code.trim().toUpperCase(),
          })
          .eq('id', editingId!);

        if (updateError) {
          if (updateError.code === '23505') {
            throw new Error('That class code is already taken. Please choose a different one.');
          }
          throw updateError;
        }
      }

      setModalOpen(false);
      setLoading(true);
      await loadClasses();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setFormLoading(false);
    }
  }

  async function toggleArchive(cls: ClassRow) {
    setArchivingId(cls.id);
    const isArchiving = cls.archived_at === null;
    const { error } = await supabase
      .from('classes')
      .update({ archived_at: isArchiving ? new Date().toISOString() : null })
      .eq('id', cls.id);

    if (!error) {
      setClasses((prev) =>
        prev.map((c) =>
          c.id === cls.id
            ? { ...c, archived_at: isArchiving ? new Date().toISOString() : null }
            : c
        )
      );
    }
    setArchivingId(null);
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Classes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create and manage your classes. Share the class code with students.
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate}>
          New Class
        </Button>
      </div>

      {/* Archived toggle */}
      {archivedCount > 0 && (
        <div className="mb-5">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            {showArchived ? <EyeOff size={14} /> : <Eye size={14} />}
            {showArchived
              ? 'Hide archived classes'
              : `Show ${archivedCount} archived ${archivedCount === 1 ? 'class' : 'classes'}`}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : visible.length === 0 && !showArchived ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 text-center">
          <School size={36} className="text-slate-300" />
          <div>
            <p className="font-medium text-slate-600">No active classes</p>
            <p className="mt-0.5 text-sm text-slate-400">
              Create your first class and share the code with students.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={openCreate}>
            Create a class
          </Button>
        </div>
      ) : (
        <>
          {/* Active classes */}
          {visible.filter((c) => !c.archived_at).length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible
                .filter((c) => !c.archived_at)
                .map((cls) => (
                  <ClassCard
                    key={cls.id}
                    cls={cls}
                    onEdit={openEdit}
                    onToggleArchive={toggleArchive}
                    onCopyCode={copyCode}
                    copiedCode={copiedCode}
                    archivingId={archivingId}
                  />
                ))}
            </div>
          )}

          {/* Archived classes section */}
          {showArchived && visible.filter((c) => c.archived_at).length > 0 && (
            <div className="mt-8">
              <div className="mb-4 flex items-center gap-2">
                <Archive size={15} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                  Archived
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible
                  .filter((c) => c.archived_at)
                  .map((cls) => (
                    <ClassCard
                      key={cls.id}
                      cls={cls}
                      onEdit={openEdit}
                      onToggleArchive={toggleArchive}
                      onCopyCode={copyCode}
                      copiedCode={copiedCode}
                      archivingId={archivingId}
                    />
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === 'create' ? 'New Class' : 'Edit Class'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {formError}
            </div>
          )}
          <Input
            label="Class name"
            placeholder="e.g. IELTS Academic — Group A"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Class code"
            placeholder="e.g. IELTS-A1"
            value={form.class_code}
            onChange={(e) => setForm({ ...form, class_code: e.target.value })}
            hint="Students use this code to join the class. Must be unique."
            required
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={formLoading}>
              {modalMode === 'create' ? 'Create class' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

interface ClassCardProps {
  cls: ClassRow;
  onEdit: (cls: ClassRow) => void;
  onToggleArchive: (cls: ClassRow) => void;
  onCopyCode: (code: string) => void;
  copiedCode: string | null;
  archivingId: number | null;
}

function ClassCard({
  cls,
  onEdit,
  onToggleArchive,
  onCopyCode,
  copiedCode,
  archivingId,
}: ClassCardProps) {
  const isArchived = cls.archived_at !== null;
  const isProcessing = archivingId === cls.id;

  return (
    <div
      className={`group rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
        isArchived ? 'border-slate-200 opacity-70' : 'border-slate-100'
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            isArchived ? 'bg-slate-100' : 'bg-blue-50'
          }`}
        >
          {isArchived ? (
            <Archive size={18} className="text-slate-400" />
          ) : (
            <School size={20} className="text-blue-600" />
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          {!isArchived && (
            <button
              onClick={() => onEdit(cls)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Edit class"
            >
              <Pencil size={14} />
            </button>
          )}
          <button
            onClick={() => onToggleArchive(cls)}
            disabled={isProcessing}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition disabled:cursor-wait ${
              isArchived
                ? 'text-emerald-500 hover:bg-emerald-50'
                : 'text-slate-400 hover:bg-amber-50 hover:text-amber-600'
            }`}
            title={isArchived ? 'Restore class' : 'Archive class'}
          >
            {isProcessing ? (
              <LoadingSpinner size="sm" />
            ) : isArchived ? (
              <ArchiveRestore size={14} />
            ) : (
              <Archive size={14} />
            )}
          </button>
        </div>
      </div>

      <h3
        className={`font-semibold leading-snug ${
          isArchived ? 'text-slate-500' : 'text-slate-800'
        }`}
      >
        {cls.name}
      </h3>

      {isArchived && (
        <p className="mt-1 text-xs text-slate-400">
          Archived {new Date(cls.archived_at!).toLocaleDateString()}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5">
          <Hash size={12} className="text-slate-400" />
          <span className="font-mono text-sm font-medium text-slate-700">
            {cls.class_code ?? '—'}
          </span>
        </div>
        {cls.class_code && !isArchived && (
          <button
            onClick={() => onCopyCode(cls.class_code!)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="Copy class code"
          >
            {copiedCode === cls.class_code ? (
              <CheckCheck size={14} className="text-emerald-500" />
            ) : (
              <Copy size={14} />
            )}
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
        <Users size={13} />
        <span>
          {cls.student_count} {cls.student_count === 1 ? 'student' : 'students'} enrolled
        </span>
      </div>
    </div>
  );
}
