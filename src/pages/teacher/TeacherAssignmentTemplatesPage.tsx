import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit3,
  Copy,
  Archive,
  RotateCcw,
  Layers,
  X,
  AlertCircle,
  FileText,
  Mic,
  Tag,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import TemplateForm from '@/components/templates/TemplateForm';
import TemplatePreview from '@/components/templates/TemplatePreview';
import DuplicateTemplateDialog from '@/components/templates/DuplicateTemplateDialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchTemplates,
  fetchTemplate,
  fetchTemplateQuestions,
  createTemplate,
  updateTemplate,
  updateTemplateQuestions,
  archiveTemplate,
  restoreTemplate,
  duplicateTemplate,
  fetchTeachersForFilter,
  DuplicateTemplateError,
  type TemplateFilters,
} from '@/lib/templates';
import type {
  AssignmentTemplate,
  AssignmentTemplateWithDetails,
  QuestionWithDetails,
} from '@/types/database';

type View = 'list' | 'create' | 'edit';

export default function TeacherAssignmentTemplatesPage() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [view, setView] = useState<View>('list');
  const [templates, setTemplates] = useState<AssignmentTemplateWithDetails[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing state
  const [editingTemplate, setEditingTemplate] = useState<AssignmentTemplate | null>(null);
  const [editingQuestionIds, setEditingQuestionIds] = useState<number[]>([]);

  // Preview modal
  const [previewTemplate, setPreviewTemplate] = useState<AssignmentTemplate | null>(null);

  // Duplicate dialog (from save)
  const [duplicateInfo, setDuplicateInfo] = useState<{ id: number; name: string } | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('mine');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [createdByFilter, setCreatedByFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Filter options
  const [teachers, setTeachers] = useState<{ id: string; display_name: string }[]>([]);

  const currentUserId = user?.id ?? '';

  useEffect(() => {
    fetchTeachersForFilter().then(setTeachers).catch(() => {});
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: TemplateFilters = {
        ownerId: ownerFilter as TemplateFilters['ownerId'],
        status: statusFilter,
        search: search || undefined,
        createdBy: createdByFilter || undefined,
      };
      const data = await fetchTemplates(currentUserId, filters);
      setTemplates(data);
    } catch {
      setError('Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }, [currentUserId, ownerFilter, statusFilter, search, createdByFilter]);

  useEffect(() => {
    if (view === 'list') {
      loadTemplates();
    }
  }, [view, loadTemplates]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (view === 'list') loadTemplates();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleCreate(data: {
    name: string;
    description: string;
    questionIds: number[];
  }) {
    setSubmitting(true);
    setError(null);
    try {
      await createTemplate(
        { name: data.name, description: data.description || null },
        data.questionIds,
      );
      setView('list');
    } catch (err) {
      if (err instanceof DuplicateTemplateError) {
        setDuplicateInfo(err.duplicate);
      } else {
        setError('Failed to create template.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(data: {
    name: string;
    description: string;
    questionIds: number[];
  }) {
    if (!editingTemplate) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateTemplate(editingTemplate.id, {
        name: data.name,
        description: data.description || null,
      });
      await updateTemplateQuestions(editingTemplate.id, data.questionIds);
      setEditingTemplate(null);
      setView('list');
    } catch (err) {
      if (err instanceof DuplicateTemplateError) {
        setDuplicateInfo(err.duplicate);
      } else {
        setError('Failed to update template.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(t: AssignmentTemplate) {
    try {
      await archiveTemplate(t.id);
      await loadTemplates();
    } catch {
      setError('Failed to archive template.');
    }
  }

  async function handleRestore(t: AssignmentTemplate) {
    try {
      await restoreTemplate(t.id);
      await loadTemplates();
    } catch {
      setError('Failed to restore template.');
    }
  }

  async function handleDuplicate(t: AssignmentTemplate) {
    try {
      const questions = await fetchTemplateQuestions(t.id);
      const questionIds = questions.map((q) => q.id);
      await duplicateTemplate(t, questionIds);
      await loadTemplates();
    } catch (err) {
      if (err instanceof DuplicateTemplateError) {
        setDuplicateInfo(err.duplicate);
      } else {
        setError('Failed to duplicate template.');
      }
    }
  }

  async function handleEdit(t: AssignmentTemplate) {
    try {
      const full = await fetchTemplate(t.id);
      if (!full) return;
      const questions = await fetchTemplateQuestions(t.id);
      setEditingTemplate(full);
      setEditingQuestionIds(questions.map((q) => q.id));
      setView('edit');
    } catch {
      setError('Failed to load template for editing.');
    }
  }

  const isOwner = useCallback(
    (t: AssignmentTemplate) => t.owner_id === currentUserId || isAdmin,
    [currentUserId, isAdmin],
  );

  const hasActiveFilters = useMemo(
    () =>
      ownerFilter !== 'mine' ||
      statusFilter !== 'active' ||
      createdByFilter !== '',
    [ownerFilter, statusFilter, createdByFilter],
  );

  function clearFilters() {
    setOwnerFilter('mine');
    setStatusFilter('active');
    setCreatedByFilter('');
  }

  // ── Create / Edit view ──────────────────────────────────
  if (view === 'create' || view === 'edit') {
    return (
      <div className="p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {view === 'create' ? 'New Assignment Template' : 'Edit Template'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {view === 'create'
                ? 'Build a reusable assignment blueprint from Question Bank questions.'
                : isOwner(editingTemplate as AssignmentTemplate)
                  ? 'Update your template.'
                  : 'Viewing — you can duplicate this template.'}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setView('list');
              setEditingTemplate(null);
            }}
          >
            Back to list
          </Button>
        </div>

        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <TemplateForm
            initialName={editingTemplate?.name ?? ''}
            initialDescription={editingTemplate?.description ?? ''}
            initialQuestionIds={editingQuestionIds}
            currentUserId={currentUserId}
            onSubmit={view === 'create' ? handleCreate : handleUpdate}
            onCancel={() => {
              setView('list');
              setEditingTemplate(null);
            }}
            submitting={submitting}
          />
        </div>

        {/* Duplicate dialog (from save attempt) */}
        <DuplicateTemplateDialog
          isOpen={duplicateInfo !== null}
          duplicate={duplicateInfo}
          onClose={() => setDuplicateInfo(null)}
          onReturnToEditing={() => setDuplicateInfo(null)}
        />
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Assignment Templates
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Reusable assignment blueprints built from Question Bank questions.
          </p>
        </div>
        <Button
          icon={<Plus size={16} />}
          onClick={() => {
            setEditingTemplate(null);
            setEditingQuestionIds([]);
            setView('create');
          }}
        >
          New Template
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Search + filter toggle */}
      <div className="mb-4 flex gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or description..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <Button
          variant={showFilters ? 'primary' : 'secondary'}
          icon={<Filter size={16} />}
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters
        </Button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Owner
              </label>
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="mine">Mine</option>
                <option value="everyone">Everyone</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as 'active' | 'archived' | 'all',
                  )
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Created By
              </label>
              <select
                value={createdByFilter}
                onChange={(e) => setCreatedByFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="">All teachers</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {hasActiveFilters && (
            <div className="flex justify-end">
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-700"
              >
                <X size={13} />
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Templates list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Layers size={40} className="text-slate-300" />
          <p className="mt-4 text-sm font-medium text-slate-500">
            No templates found.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {hasActiveFilters
              ? 'Try adjusting your filters.'
              : 'Click "New Template" to create your first template.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const canEdit = isOwner(t);
            const isArchived = t.status === 'archived';
            return (
              <div
                key={t.id}
                className={`group flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                  isArchived ? 'border-slate-100 opacity-60' : 'border-slate-100'
                }`}
              >
                <div className="mb-3">
                  <h3 className="truncate text-sm font-semibold text-slate-800">
                    {t.name}
                  </h3>
                  {t.description && (
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500">
                      {t.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      <Layers size={10} />
                      {t.question_count} question{t.question_count !== 1 ? 's' : ''}
                    </span>
                    {isArchived && (
                      <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
                        Archived
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    by {t.owner_display_name}
                  </p>
                </div>

                {/* Actions */}
                <div className="mt-auto flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Eye size={13} />}
                    onClick={() => setPreviewTemplate(t)}
                  >
                    Preview
                  </Button>
                  {canEdit && !isArchived && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Edit3 size={13} />}
                      onClick={() => handleEdit(t)}
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Copy size={13} />}
                    onClick={() => handleDuplicate(t)}
                  >
                    Duplicate
                  </Button>
                  {canEdit && !isArchived && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Archive size={13} />}
                      onClick={() => handleArchive(t)}
                    >
                      Archive
                    </Button>
                  )}
                  {canEdit && isArchived && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RotateCcw size={13} />}
                      onClick={() => handleRestore(t)}
                    >
                      Restore
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template preview modal */}
      <TemplatePreview
        isOpen={previewTemplate !== null}
        onClose={() => setPreviewTemplate(null)}
        templateId={previewTemplate?.id ?? 0}
        templateName={previewTemplate?.name ?? ''}
      />

      {/* Duplicate dialog (from list actions) */}
      <DuplicateTemplateDialog
        isOpen={duplicateInfo !== null && view === 'list'}
        duplicate={duplicateInfo}
        onClose={() => setDuplicateInfo(null)}
        onReturnToEditing={() => setDuplicateInfo(null)}
      />
    </div>
  );
}
