import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList,
  Plus,
  Search,
  Eye,
  Trash2,
  AlertCircle,
  FileText,
  Layers,
  Shuffle,
  X,
  CheckCircle2,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchTemplates,
  fetchTemplateQuestions,
  fetchTemplateRandomRules,
  fetchDrafts,
  fetchDraftQuestions,
  resolveTemplateToDraft,
  deleteDraft,
  fetchClassesForFilter,
  canonicalTypeRank,
} from '@/lib/templates';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import type {
  AssignmentTemplateWithDetails,
  AssignmentDraftWithDetails,
  QuestionWithDetails,
  RandomQuestionRule,
} from '@/types/database';

type View = 'list' | 'create';

export default function TeacherAssignmentsPage() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const currentUserId = user?.id ?? '';

  const [view, setView] = useState<View>('list');
  const [drafts, setDrafts] = useState<AssignmentDraftWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create-draft flow
  const [templates, setTemplates] = useState<AssignmentTemplateWithDetails[]>([]);
  const [selectedTemplate, setSelectedTemplate] =
    useState<AssignmentTemplateWithDetails | null>(null);
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | ''>('');
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [templateQuestions, setTemplateQuestions] = useState<
    QuestionWithDetails[]
  >([]);
  const [templateRules, setTemplateRules] = useState<RandomQuestionRule[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState<{
    draftId: number;
    unresolved: number;
  } | null>(null);

  // Draft detail
  const [viewingDraft, setViewingDraft] =
    useState<AssignmentDraftWithDetails | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<
    QuestionWithDetails[]
  >([]);
  const [loadingDraftQuestions, setLoadingDraftQuestions] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] =
    useState<AssignmentDraftWithDetails | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'draft' | 'published' | 'all'
  >('all');

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDrafts(currentUserId, {
        ownerId: isAdmin ? 'everyone' : 'mine',
        status: statusFilter,
        search: search || undefined,
      });
      setDrafts(data);
    } catch {
      setError('Failed to load assignments.');
    } finally {
      setLoading(false);
    }
  }, [currentUserId, isAdmin, statusFilter, search]);

  useEffect(() => {
    if (view === 'list') loadDrafts();
  }, [view, loadDrafts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (view === 'list') loadDrafts();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Load templates + classes when entering create view
  useEffect(() => {
    if (view === 'create') {
      fetchTemplates(currentUserId, { ownerId: isAdmin ? 'everyone' : 'mine' })
        .then(setTemplates)
        .catch(() => {});
      fetchClassesForFilter()
        .then(setClasses)
        .catch(() => {});
    }
  }, [view, currentUserId, isAdmin]);

  async function handleSelectTemplate(t: AssignmentTemplateWithDetails) {
    setSelectedTemplate(t);
    setDraftName(t.name);
    setDraftDescription(t.description ?? '');
    setLoadingTemplate(true);
    try {
      const [qs, rs] = await Promise.all([
        fetchTemplateQuestions(t.id),
        fetchTemplateRandomRules(t.id),
      ]);
      setTemplateQuestions(qs);
      setTemplateRules(rs);
    } catch {
      setTemplateQuestions([]);
      setTemplateRules([]);
    } finally {
      setLoadingTemplate(false);
    }
  }

  async function handleResolve() {
    if (!selectedTemplate) return;
    setResolving(true);
    setError(null);
    try {
      const result = await resolveTemplateToDraft(
        selectedTemplate.id,
        selectedClassId || null,
        draftName.trim() || selectedTemplate.name,
        draftDescription.trim() || null,
        currentUserId,
      );
      setResolveResult({
        draftId: result.draft_id,
        unresolved: result.unresolved_rules,
      });
    } catch {
      setError('Failed to create assignment draft. Please try again.');
    } finally {
      setResolving(false);
    }
  }

  async function handleViewDraft(d: AssignmentDraftWithDetails) {
    setViewingDraft(d);
    setLoadingDraftQuestions(true);
    try {
      const qs = await fetchDraftQuestions(d.id);
      setDraftQuestions(qs);
    } catch {
      setDraftQuestions([]);
    } finally {
      setLoadingDraftQuestions(false);
    }
  }

  async function handleDeleteDraft() {
    if (!deleteTarget) return;
    try {
      await deleteDraft(deleteTarget.id);
      setDeleteTarget(null);
      await loadDrafts();
    } catch {
      setError('Failed to delete draft.');
    }
  }

  const hasRules = templateRules.length > 0;
  const hasQuestions = templateQuestions.length > 0;

  // ── Create view ──────────────────────────────────────────
  if (view === 'create') {
    if (resolveResult) {
      return (
        <div className="p-6 md:p-8">
          <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            {resolveResult.unresolved === 0 ? (
              <>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 size={28} className="text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">
                  Assignment Draft Created
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  All random rules have been resolved into real questions. The
                  draft is now fixed — every student will receive the same
                  questions.
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                  <AlertCircle size={28} className="text-amber-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">
                  Draft Created with Warnings
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {resolveResult.unresolved} random rule
                  {resolveResult.unresolved !== 1 ? 's' : ''} could not be
                  resolved — no matching unused questions were found. You can
                  still review the draft and manually select questions for the
                  unresolved rules.
                </p>
                <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-left">
                  <p className="text-xs text-amber-700">
                    All matching questions may have already been used for this
                    class. Try broadening your template's random rule filters,
                    allow reuse, or select questions manually in the draft.
                  </p>
                </div>
              </>
            )}
            <div className="mt-6 flex justify-center gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setResolveResult(null);
                  setView('list');
                }}
              >
                Back to list
              </Button>
              <Button
                onClick={() => {
                  setResolveResult(null);
                  // Find the newly created draft and view it
                  loadDrafts().then(() => {
                    setView('list');
                  });
                }}
              >
                View Drafts
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Create Assignment Draft
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Select a template to resolve into a fixed set of questions.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setView('list');
              setSelectedTemplate(null);
            }}
          >
            Back to list
          </Button>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Template selection */}
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                1. Choose a Template
              </label>
              {templates.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                  No templates available. Create assignment templates first.
                </div>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTemplate(t)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        selectedTemplate?.id === t.id
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-800">
                        {t.name}
                      </p>
                      {t.description && (
                        <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500">
                          {t.description}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-400">
                        {t.question_count} question
                        {t.question_count !== 1 ? 's' : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Class + name */}
            {selectedTemplate && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    2. Target Class{' '}
                    <span className="font-normal text-slate-400">
                      (optional — for per-class question history)
                    </span>
                  </label>
                  <select
                    value={selectedClassId}
                    onChange={(e) =>
                      setSelectedClassId(
                        e.target.value ? parseInt(e.target.value) : '',
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="">No specific class</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    3. Draft Name
                  </label>
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Assignment draft name"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Description{' '}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    rows={4}
                    placeholder="Assignment description..."
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </>
            )}
          </div>

          {/* Template preview */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Template Contents
            </label>
            {!selectedTemplate ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
                Select a template to see its contents
              </div>
            ) : loadingTemplate ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="md" />
              </div>
            ) : (
              <TemplateContentsPreview
                questions={templateQuestions}
                rules={templateRules}
              />
            )}

            {selectedTemplate && !loadingTemplate && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <p className="text-xs text-blue-700">
                  {hasRules && hasQuestions
                    ? `This template has ${templateQuestions.length} fixed question${templateQuestions.length !== 1 ? 's' : ''} and ${templateRules.length} random rule${templateRules.length !== 1 ? 's' : ''}. Each rule will be resolved into one real question.`
                    : hasRules
                      ? `This template has ${templateRules.length} random rule${templateRules.length !== 1 ? 's' : ''}. Each will be resolved into one real question from your Question Bank.`
                      : `This template has ${templateQuestions.length} fixed question${templateQuestions.length !== 1 ? 's' : ''}. No random resolution needed.`}
                </p>
              </div>
            )}

            {selectedTemplate && !loadingTemplate && (
              <Button
                onClick={handleResolve}
                loading={resolving}
                className="w-full"
                icon={<Shuffle size={16} />}
              >
                {hasRules
                  ? 'Resolve & Create Draft'
                  : 'Create Draft'}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Assignments</h1>
          <p className="p-1 mt-1 text-sm text-slate-500">
            Create assignment drafts from templates and track submissions.
          </p>
        </div>
        <Button
          icon={<Plus size={16} />}
          onClick={() => {
            setSelectedTemplate(null);
            setTemplateQuestions([]);
            setTemplateRules([]);
            setDraftName('');
            setDraftDescription('');
            setSelectedClassId('');
            setView('create');
          }}
        >
          New Draft
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Search + status filter */}
      <div className="mb-4 flex gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drafts..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value as 'draft' | 'published' | 'all',
            )
          }
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400"
        >
          <option value="all">All</option>
          <option value="draft">Drafts</option>
          <option value="published">Published</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : drafts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList size={40} className="text-slate-300" />
          <p className="mt-4 text-sm font-medium text-slate-500">
            No assignments yet.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Click "New Draft" to create one from a template.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {drafts.map((d) => (
            <div
              key={d.id}
              className="flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-slate-800">
                    {d.name}
                  </h3>
                  {d.template_name && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      From: {d.template_name}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                    d.status === 'published'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {d.status === 'published' ? 'Published' : 'Draft'}
                </span>
              </div>

              {d.description && (
                <p className="mb-3 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500">
                  {d.description}
                </p>
              )}

              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Layers size={11} />
                  {d.question_count} question
                  {d.question_count !== 1 ? 's' : ''}
                </span>
                {d.class_name && (
                  <span className="flex items-center gap-1">
                    <FileText size={11} />
                    {d.class_name}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Eye size={13} />}
                  onClick={() => handleViewDraft(d)}
                >
                  View
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={13} />}
                  onClick={() => setDeleteTarget(d)}
                  className="text-red-500 hover:text-red-700"
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Draft detail modal */}
      <Modal
        isOpen={viewingDraft !== null}
        onClose={() => setViewingDraft(null)}
        title={viewingDraft?.name ?? 'Draft'}
        size="lg"
      >
        {loadingDraftQuestions ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Layers size={16} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-700">
                {draftQuestions.length} resolved question
                {draftQuestions.length !== 1 ? 's' : ''}
              </span>
              {viewingDraft?.class_name && (
                <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {viewingDraft.class_name}
                </span>
              )}
            </div>
            {draftQuestions.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                No questions in this draft.
              </p>
            ) : (
              draftQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="mb-2 flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold text-blue-700">
                      {idx + 1}
                    </span>
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {q.type_name}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">
                    {q.content}
                  </p>
                  {q.description && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400">
                      {q.description}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Draft"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete "{deleteTarget?.name}"? This action
            cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteDraft}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Template Contents Preview ──────────────────────────────

function TemplateContentsPreview({
  questions,
  rules,
}: {
  questions: QuestionWithDetails[];
  rules: RandomQuestionRule[];
}) {
  type Item =
    | { kind: 'question'; data: QuestionWithDetails }
    | { kind: 'rule'; data: RandomQuestionRule };
  const combined: Item[] = [
    ...questions.map((q) => ({ kind: 'question' as const, data: q })),
    ...rules.map((r) => ({ kind: 'rule' as const, data: r })),
  ];
  combined.sort((a, b) => {
    const rankA =
      a.kind === 'question'
        ? canonicalTypeRank(a.data.type_id)
        : canonicalTypeRank(a.data.question_type_id);
    const rankB =
      b.kind === 'question'
        ? canonicalTypeRank(b.data.type_id)
        : canonicalTypeRank(b.data.question_type_id);
    return rankA - rankB;
  });

  if (combined.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
        This template is empty.
      </div>
    );
  }

  return (
    <div className="max-h-96 space-y-2 overflow-y-auto">
      {combined.map((item, idx) => {
        if (item.kind === 'question') {
          const q = item.data;
          return (
            <div
              key={`q-${q.id}`}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold text-blue-700">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 whitespace-pre-wrap text-sm text-slate-700">
                  {q.content}
                </p>
                <span className="mt-1 inline-block rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {q.type_name}
                </span>
              </div>
            </div>
          );
        }
        const r = item.data;
        const typeName =
          r.question_type_id === QUESTION_TYPE_IDS.WRITING_TASK_1
            ? 'Writing Task 1'
            : r.question_type_id === QUESTION_TYPE_IDS.WRITING_TASK_2
              ? 'Writing Task 2'
              : r.question_type_id === QUESTION_TYPE_IDS.SPEAKING_PART_1
                ? 'Speaking Part 1'
                : r.question_type_id === QUESTION_TYPE_IDS.SPEAKING_PART_2
                  ? 'Speaking Part 2'
                  : r.question_type_id === QUESTION_TYPE_IDS.SPEAKING_PART_3
                    ? 'Speaking Part 3'
                    : r.question_type_id === QUESTION_TYPE_IDS.EXTRA_HOMEWORK
                      ? 'Extra Homework'
                      : 'Custom Question';
        return (
          <div
            key={`r-${r.id}`}
            className="flex items-center gap-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 px-4 py-3"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-xs font-semibold text-amber-700">
              {idx + 1}
            </span>
            <Shuffle size={14} className="text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-800">
                Random {typeName}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {r.category && (
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {r.category}
                  </span>
                )}
                {r.tags && r.tags.length > 0 && (
                  <span className="text-xs text-amber-600">
                    {r.tags.join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
