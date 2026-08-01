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
  Trash2,
  BookOpen,
  X,
  AlertCircle,
  FileText,
  Mic,
  Tag,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import QuestionForm from '@/components/questions/QuestionForm';
import QuestionPreview from '@/components/questions/QuestionPreview';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchQuestions,
  fetchQuestionTypes,
  createQuestion,
  updateQuestion,
  archiveQuestion,
  restoreQuestion,
  deleteQuestion,
  duplicateQuestion,
  fetchAllTags,
  fetchCategoriesForType,
  CATEGORY_OPTIONS,
  type QuestionFilters,
} from '@/lib/questions';
import type {
  Question,
  QuestionType,
  QuestionWithDetails,
  ResponseType,
} from '@/types/database';

type View = 'list' | 'create' | 'edit';

export default function TeacherQuestionLibraryPage() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [view, setView] = useState<View>('list');
  const [questions, setQuestions] = useState<QuestionWithDetails[]>([]);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [previewTypeName, setPreviewTypeName] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('mine');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<number | ''>('');
  const [responseTypeFilter, setResponseTypeFilter] = useState<
    ResponseType | ''
  >('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [tagFilter, setTagFilter] = useState<string>('');

  // Filter options
  const [allTags, setAllTags] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const currentUserId = user?.id ?? '';

  useEffect(() => {
    fetchQuestionTypes()
      .then(setQuestionTypes)
      .catch(() => setError('Failed to load question types.'));
  }, []);

  useEffect(() => {
    fetchAllTags().then(setAllTags).catch(() => {});
  }, [questions]);

  // Load categories when type filter changes
  useEffect(() => {
    if (typeFilter) {
      fetchCategoriesForType(typeFilter).then(setAvailableCategories).catch(() => {});
    } else {
      setAvailableCategories([]);
    }
  }, [typeFilter, questions]);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: QuestionFilters = {
        ownerId: ownerFilter as QuestionFilters['ownerId'],
        status: statusFilter,
        search: search || undefined,
        category: categoryFilter || undefined,
        typeId: typeFilter || undefined,
        responseType: responseTypeFilter || undefined,
        tags: tagFilter ? [tagFilter] : undefined,
      };
      const data = await fetchQuestions(currentUserId, filters);
      setQuestions(data);
    } catch {
      setError('Failed to load questions.');
    } finally {
      setLoading(false);
    }
  }, [
    currentUserId,
    ownerFilter,
    statusFilter,
    search,
    categoryFilter,
    typeFilter,
    responseTypeFilter,
    tagFilter,
  ]);

  useEffect(() => {
    if (view === 'list') {
      loadQuestions();
    }
  }, [view, loadQuestions]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (view === 'list') loadQuestions();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function getTypeName(typeId: number): string {
    return questionTypes.find((qt) => qt.id === typeId)?.name ?? 'Unknown';
  }

  async function handleCreate(data: Parameters<typeof createQuestion>[0]) {
    setSubmitting(true);
    setError(null);
    try {
      await createQuestion(data);
      setView('list');
    } catch {
      setError('Failed to create question.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(data: Parameters<typeof updateQuestion>[1]) {
    if (!editingQuestion) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateQuestion(editingQuestion.id, data);
      setEditingQuestion(null);
      setView('list');
    } catch {
      setError('Failed to update question.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(q: Question) {
    try {
      await archiveQuestion(q.id);
      await loadQuestions();
    } catch {
      setError('Failed to archive question.');
    }
  }

  async function handleRestore(q: Question) {
    try {
      await restoreQuestion(q.id);
      await loadQuestions();
    } catch {
      setError('Failed to restore question.');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteQuestion(deleteTarget.id);
      setDeleteTarget(null);
      await loadQuestions();
    } catch {
      setError('Failed to delete question.');
    }
  }

  async function handleDuplicate(q: Question) {
    try {
      await duplicateQuestion(q, currentUserId);
      await loadQuestions();
    } catch {
      setError('Failed to duplicate question.');
    }
  }

  function handleEdit(q: Question) {
    setEditingQuestion(q);
    setView('edit');
  }

  function handlePreview(q: Question) {
    setPreviewQuestion(q);
    setPreviewTypeName(getTypeName(q.type_id));
  }

  const isOwner = useCallback(
    (q: Question) => q.owner_id === currentUserId || isAdmin,
    [currentUserId, isAdmin],
  );

  const hasActiveFilters = useMemo(
    () =>
      categoryFilter ||
      typeFilter ||
      responseTypeFilter ||
      tagFilter ||
      ownerFilter !== 'mine' ||
      statusFilter !== 'active',
    [categoryFilter, typeFilter, responseTypeFilter, tagFilter, ownerFilter, statusFilter],
  );

  function clearFilters() {
    setOwnerFilter('mine');
    setCategoryFilter('');
    setTypeFilter('');
    setResponseTypeFilter('');
    setStatusFilter('active');
    setTagFilter('');
  }

  // ── Create / Edit view ──────────────────────────────────
  if (view === 'create' || view === 'edit') {
    return (
      <div className="p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {view === 'create' ? 'New Question' : 'Edit Question'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {view === 'create'
                ? 'Create a new question for your Question Bank.'
                : editingQuestion?.owner_id === currentUserId || isAdmin
                  ? 'Update your question.'
                  : 'Viewing — you can duplicate or use this question.'}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setView('list');
              setEditingQuestion(null);
            }}
          >
            Back to list
          </Button>
        </div>

        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <QuestionForm
            questionTypes={questionTypes}
            initialData={editingQuestion}
            currentUserId={currentUserId}
            onSubmit={(data) =>
              view === 'create' ? handleCreate(data) : handleUpdate(data)
            }
            onCancel={() => {
              setView('list');
              setEditingQuestion(null);
            }}
            onDuplicate={(q) => {
              handleDuplicate(q);
              setView('list');
              setEditingQuestion(null);
            }}
            submitting={submitting}
          />
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Question Bank</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create, manage, and reuse questions across your assignments.
          </p>
        </div>
        <Button
          icon={<Plus size={16} />}
          onClick={() => {
            setEditingQuestion(null);
            setView('create');
          }}
        >
          New Question
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
            placeholder="Search by prompt or tags..."
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
            {/* Owner filter */}
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

            {/* Status filter */}
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

            {/* Type filter */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Question Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value ? parseInt(e.target.value) : '');
                  setCategoryFilter('');
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="">All types</option>
                {questionTypes.map((qt) => (
                  <option key={qt.id} value={qt.id}>
                    {qt.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Response type filter */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Response Type
              </label>
              <select
                value={responseTypeFilter}
                onChange={(e) =>
                  setResponseTypeFilter(e.target.value as ResponseType | '')
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="">All</option>
                <option value="text">Text</option>
                <option value="audio">Audio</option>
              </select>
            </div>

            {/* Category filter — depends on selected type */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                disabled={!typeFilter}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">
                  {typeFilter ? 'All categories' : 'Select a type first'}
                </option>
                {/* If type has predefined options, show those */}
                {typeFilter && CATEGORY_OPTIONS[typeFilter] && (
                  <>
                    {CATEGORY_OPTIONS[typeFilter].map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    {/* Also show any custom categories from existing questions */}
                    {availableCategories
                      .filter((c) => !CATEGORY_OPTIONS[typeFilter].includes(c))
                      .map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                  </>
                )}
                {/* For types without predefined options, show existing categories */}
                {typeFilter && !CATEGORY_OPTIONS[typeFilter] && (
                  <>
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* Tag filter */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Tag
              </label>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="">All tags</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
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

      {/* Questions list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen size={40} className="text-slate-300" />
          <p className="mt-4 text-sm font-medium text-slate-500">
            No questions found.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {hasActiveFilters
              ? 'Try adjusting your filters.'
              : 'Click "New Question" to create your first question.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {questions.map((q) => {
            const canEdit = isOwner(q);
            const isArchived = q.status === 'archived';
            // Build category display
            let categoryDisplay: string | null = null;
            if (q.category) {
              if (q.category === 'Others' && q.category_secondary) {
                categoryDisplay = q.category_secondary;
              } else if (
                q.type_id === 3 &&
                q.category &&
                q.category_secondary
              ) {
                categoryDisplay = `${q.category} / ${q.category_secondary}`;
              } else {
                categoryDisplay = q.category;
              }
            }
            return (
              <div
                key={q.id}
                className={`group flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                  isArchived ? 'border-slate-100 opacity-60' : 'border-slate-100'
                }`}
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {q.type_name}
                      </span>
                      {categoryDisplay && (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          {categoryDisplay}
                        </span>
                      )}
                      {isArchived && (
                        <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
                          Archived
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Prompt preview */}
                <p className="mb-3 line-clamp-3 flex-1 text-xs text-slate-500">
                  {q.content}
                </p>

                {/* Meta row */}
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  {q.response_type === 'audio' ? (
                    <span className="flex items-center gap-1">
                      <Mic size={11} />
                      Audio
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <FileText size={11} />
                      Text
                    </span>
                  )}
                  {q.tags && q.tags.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Tag size={11} />
                      {q.tags.length} tag{q.tags.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Eye size={13} />}
                    onClick={() => handlePreview(q)}
                  >
                    Preview
                  </Button>
                  {canEdit && !isArchived && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Edit3 size={13} />}
                      onClick={() => handleEdit(q)}
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Copy size={13} />}
                    onClick={() => handleDuplicate(q)}
                  >
                    Duplicate
                  </Button>
                  {canEdit && !isArchived && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Archive size={13} />}
                      onClick={() => handleArchive(q)}
                    >
                      Archive
                    </Button>
                  )}
                  {canEdit && isArchived && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RotateCcw size={13} />}
                      onClick={() => handleRestore(q)}
                    >
                      Restore
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={13} />}
                      onClick={() => setDeleteTarget(q)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview modal */}
      <Modal
        isOpen={previewQuestion !== null}
        onClose={() => setPreviewQuestion(null)}
        title="Student Preview"
        size="lg"
      >
        {previewQuestion && (
          <QuestionPreview
            question={previewQuestion}
            typeName={previewTypeName}
          />
        )}
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Question"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to permanently delete this question? This
            action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
