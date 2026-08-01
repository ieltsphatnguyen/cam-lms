import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList,
  Plus,
  Search,
  Filter,
  Eye,
  Edit3,
  Copy,
  Trash2,
  AlertCircle,
  FileText,
  Layers,
  X,
  Clock,
  Calendar,
  BookOpen,
  ChevronLeft,
  Save,
  Send,
  CheckCircle2,
  Mic,
  Tag,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import QuestionForm from '@/components/questions/QuestionForm';
import QuestionPreview from '@/components/questions/QuestionPreview';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  fetchTemplates,
  fetchDrafts,
  fetchDraftItems,
  resolveTemplateToDraft,
  deleteDraft,
  duplicateDraft,
  fetchClassesForFilter,
  createEmptyDraft,
  addQuestionToDraft,
  removeQuestionFromDraft,
  clearDraftQuestions,
  replaceDraftFromTemplate,
  updateAssignmentItem,
  saveDraftAsPreset,
  parseIntervalToSeconds,
} from '@/lib/templates';
import {
  fetchQuestions,
  fetchQuestionTypes,
  fetchAllTags,
  fetchCategoriesForType,
  createQuestion,
  archiveQuestion,
  CATEGORY_OPTIONS,
  QUESTION_TYPE_IDS,
  type QuestionFilters,
} from '@/lib/questions';
import type {
  AssignmentTemplateWithDetails,
  AssignmentDraftWithDetails,
  QuestionWithDetails,
  QuestionType,
  Question,
  AssignmentItem,
  ResponseType,
} from '@/types/database';

type View = 'list' | 'edit';

// ── Time limit defaults per question type (in seconds) ─────
const DEFAULT_TIME_LIMIT_SECONDS: Record<number, number | null> = {
  [QUESTION_TYPE_IDS.WRITING_TASK_1]: 20 * 60,        // 20 min
  [QUESTION_TYPE_IDS.WRITING_TASK_2]: 40 * 60,        // 40 min
  [QUESTION_TYPE_IDS.SPEAKING_PART_1]: 5 * 60,         // 5 min
  [QUESTION_TYPE_IDS.SPEAKING_PART_2]: 3 * 60 + 10,   // 3 min 10 sec
  [QUESTION_TYPE_IDS.SPEAKING_PART_3]: 5 * 60,         // 5 min
  [QUESTION_TYPE_IDS.EXTRA_HOMEWORK]: 30 * 60,         // 30 min
  [QUESTION_TYPE_IDS.CUSTOM]: null,                    // empty
};

// ── Helper: format datetime-local input value ──────────────
function toLocalDatetimeInput(date: Date): string {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function parseLocalDatetimeInput(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

// ── Helper: calculate due date from available_from + due_after_days ─
function calcDueDate(availableFrom: string | null, dueAfterDays: number | null): string | null {
  if (!availableFrom || !dueAfterDays || dueAfterDays <= 0) return null;
  const base = new Date(availableFrom);
  base.setDate(base.getDate() + dueAfterDays);
  base.setHours(23, 59, 0, 0);
  return base.toISOString();
}

// ── Helper: format seconds as "Xm Ys" ────────────────────────
function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

export default function TeacherAssignmentsPage() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const currentUserId = user?.id ?? '';

  const [view, setView] = useState<View>('list');
  const [drafts, setDrafts] = useState<AssignmentDraftWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit flow state
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | ''>('');
  const [assignmentName, setAssignmentName] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');

  // Preset selection (optional). draftItems is the single source of truth;
  // selecting a preset resolves it into draft questions immediately.
  const [presets, setPresets] = useState<AssignmentTemplateWithDetails[]>([]);
  const [selectedPreset, setSelectedPreset] =
    useState<AssignmentTemplateWithDetails | null>(null);
  // Pending preset: selected before the draft row exists. Resolved once the
  // draft is created (class + name filled).
  const [pendingPreset, setPendingPreset] = useState<AssignmentTemplateWithDetails | null>(null);

  // Draft state (the live assignment being built)
  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftItems, setDraftItems] = useState<AssignmentItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savePresetModal, setSavePresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);

  // Add Question wizard
  const [addQuestionModal, setAddQuestionModal] = useState(false);
  const [addQuestionStep, setAddQuestionStep] = useState<'choose' | 'bank' | 'create' | 'saveDecision'>('choose');
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [bankQuestions, setBankQuestions] = useState<QuestionWithDetails[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [newQuestionData, setNewQuestionData] = useState<Question | null>(null);
  const [creatingQuestion, setCreatingQuestion] = useState(false);

  // Multi-selection in bank wizard
  const [selectedBankIds, setSelectedBankIds] = useState<Set<number>>(new Set());
  const [addingBatch, setAddingBatch] = useState(false);

  // Preview in bank wizard
  const [previewQuestion, setPreviewQuestion] = useState<QuestionWithDetails | null>(null);

  // Bank wizard filters (matching Question Library)
  const [bankSearch, setBankSearch] = useState('');
  const [bankTypeFilter, setBankTypeFilter] = useState<number | ''>('');
  const [bankResponseTypeFilter, setBankResponseTypeFilter] = useState<ResponseType | ''>('');
  const [bankCategoryFilter, setBankCategoryFilter] = useState('');
  const [bankTagFilter, setBankTagFilter] = useState('');
  const [bankOwnerFilter, setBankOwnerFilter] = useState<string>('everyone');
  const [bankStatusFilter, setBankStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [bankAllTags, setBankAllTags] = useState<string[]>([]);
  const [bankAvailableCategories, setBankAvailableCategories] = useState<string[]>([]);
  const [bankShowFilters, setBankShowFilters] = useState(false);

  // Duplicate
  const [duplicateTarget, setDuplicateTarget] =
    useState<AssignmentDraftWithDetails | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] =
    useState<AssignmentDraftWithDetails | null>(null);

  // List filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'draft' | 'published' | 'all'>('all');

  // ── Load functions ──────────────────────────────────────────

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

  // Load presets + classes + question types when entering edit view
  useEffect(() => {
    if (view === 'edit') {
      fetchTemplates(currentUserId, { ownerId: isAdmin ? 'everyone' : 'mine' })
        .then(setPresets)
        .catch(() => {});
      fetchClassesForFilter()
        .then(setClasses)
        .catch(() => {});
      fetchQuestionTypes()
        .then(setQuestionTypes)
        .catch(() => {});
    }
  }, [view, currentUserId, isAdmin]);

  // ── Start new assignment ───────────────────────────────────

  function startNewAssignment() {
    setSelectedClassId('');
    setAssignmentName('');
    setAssignmentDescription('');
    setSelectedPreset(null);
    setDraftId(null);
    setDraftItems([]);
    setPendingPreset(null);
    setError(null);
    setView('edit');
  }

  // ── Edit existing draft ────────────────────────────────────

  async function handleEditDraft(d: AssignmentDraftWithDetails) {
    setError(null);
    setView('edit');
    setAssignmentName(d.name);
    setAssignmentDescription(d.description ?? '');
    setSelectedClassId(d.class_id ?? '');
    setDraftId(d.id);
    setDraftItems([]);
    setSelectedPreset(null);
    setPendingPreset(null);

    // If the draft has a template_id, find the matching preset
    if (d.template_id) {
      // Ensure presets are loaded
      const allPresets =
        presets.length > 0
          ? presets
          : await fetchTemplates(currentUserId, {
              ownerId: isAdmin ? 'everyone' : 'mine',
            });
      if (presets.length === 0) setPresets(allPresets);
      const p = allPresets.find((t) => t.id === d.template_id);
      if (p) setSelectedPreset(p);
    }

    await loadDraftItems(d.id);
  }

  // ── Preset selection ────────────────────────────────────────
  // Selecting a preset must immediately replace Assignment Items.
  // If the draft already exists, we resolve the template into draft
  // questions right away. If not, we defer until the draft is created.

  async function handleSelectPreset(p: AssignmentTemplateWithDetails) {
    setSelectedPreset(p);
    setPendingPreset(null);
    if (!assignmentName.trim()) {
      setAssignmentName(p.name);
      setAssignmentDescription(p.description ?? '');
    }

    // If the draft already exists, replace its questions immediately.
    if (draftId) {
      setSaving(true);
      try {
        const items = await replaceDraftFromTemplate(
          draftId,
          p.id,
          selectedClassId || null,
        );
        setDraftItems(items);
      } catch {
        setError('Failed to apply preset to assignment.');
      } finally {
        setSaving(false);
      }
    } else {
      // Defer — resolve once the draft row is created.
      setPendingPreset(p);
    }
  }

  async function handleClearPreset() {
    setSelectedPreset(null);
    setPendingPreset(null);

    // If the draft already exists, clear its questions.
    if (draftId) {
      setSaving(true);
      try {
        await clearDraftQuestions(draftId);
        setDraftItems([]);
      } catch {
        setError('Failed to clear assignment questions.');
      } finally {
        setSaving(false);
      }
    }
  }

  // ── Auto-save draft when class/name changes ────────────────

  // Create the draft row automatically when both class and name are provided.
  // If a pendingPreset exists, resolve it into draft questions immediately.
  async function ensureDraftCreated(): Promise<number | null> {
    if (draftId) return draftId;
    if (!selectedClassId || !assignmentName.trim()) return null;

    setSaving(true);
    try {
      if (selectedPreset || pendingPreset) {
        const preset = selectedPreset ?? pendingPreset;
        const result = await resolveTemplateToDraft(
          preset!.id,
          selectedClassId || null,
          assignmentName.trim(),
          assignmentDescription.trim() || null,
        );
        setDraftId(result.draft_id);
        setPendingPreset(null);
        await loadDraftItems(result.draft_id);
        return result.draft_id;
      } else {
        const id = await createEmptyDraft(
          selectedClassId,
          assignmentName.trim(),
          assignmentDescription.trim() || null,
        );
        setDraftId(id);
        setDraftItems([]);
        return id;
      }
    } catch {
      setError('Failed to create assignment. Please try again.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  // Update draft name/description/class when they change (if draft already exists)
  async function updateDraftMeta() {
    if (!draftId) return;
    try {
      const { error: uErr } = await supabase
        .from('assignment_drafts')
        .update({
          name: assignmentName.trim(),
          description: assignmentDescription.trim() || null,
          class_id: selectedClassId || null,
        })
        .eq('id', draftId);
      if (uErr) throw uErr;
    } catch {
      // silent
    }
  }

  // ── Load draft items ────────────────────────────────────────

  async function loadDraftItems(id: number) {
    setLoadingItems(true);
    try {
      const items = await fetchDraftItems(id);
      setDraftItems(items);
    } catch {
      setDraftItems([]);
    } finally {
      setLoadingItems(false);
    }
  }

  // ── Add Question wizard ────────────────────────────────────

  function openAddQuestionWizard() {
    setAddQuestionModal(true);
    setAddQuestionStep('choose');
    setNewQuestionData(null);
    setBankSearch('');
    setBankTypeFilter('');
    setBankResponseTypeFilter('');
    setBankCategoryFilter('');
    setBankTagFilter('');
    setBankOwnerFilter('everyone');
    setBankStatusFilter('active');
    setBankShowFilters(false);
    // Pre-populate selection from existing draft items so every question
    // already in the assignment appears checked.
    setSelectedBankIds(new Set(draftItems.map((item) => item.question_id)));
  }

  async function loadBankQuestions() {
    setBankLoading(true);
    try {
      const filters: QuestionFilters = {
        ownerId: bankOwnerFilter as QuestionFilters['ownerId'],
        status: bankStatusFilter,
        search: bankSearch || undefined,
        category: bankCategoryFilter || undefined,
        typeId: bankTypeFilter || undefined,
        responseType: bankResponseTypeFilter || undefined,
        tags: bankTagFilter ? [bankTagFilter] : undefined,
      };
      const data = await fetchQuestions(currentUserId, filters);
      setBankQuestions(data);
    } catch {
      setBankQuestions([]);
    } finally {
      setBankLoading(false);
    }
  }

  useEffect(() => {
    if (addQuestionStep === 'bank') {
      loadBankQuestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    addQuestionStep,
    bankSearch,
    bankTypeFilter,
    bankResponseTypeFilter,
    bankCategoryFilter,
    bankTagFilter,
    bankOwnerFilter,
    bankStatusFilter,
  ]);

  // Load tags when bank questions change
  useEffect(() => {
    if (addQuestionStep === 'bank') {
      fetchAllTags().then(setBankAllTags).catch(() => {});
    }
  }, [addQuestionStep, bankQuestions]);

  // Load categories when type filter changes
  useEffect(() => {
    if (bankTypeFilter) {
      fetchCategoriesForType(bankTypeFilter).then(setBankAvailableCategories).catch(() => {});
    } else {
      setBankAvailableCategories([]);
    }
  }, [bankTypeFilter, bankQuestions]);

  function toggleBankSelection(qid: number) {
    setSelectedBankIds((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  }

  // ── Sync Question Bank selection with Assignment Items ─────
  // Done synchronizes the wizard selection with draftItems:
  //   - Questions newly checked → add to draft
  //   - Questions newly unchecked → remove from draft
  //   - Questions already in draft and still checked → no-op
  // Duplicate IDs are impossible because we diff against existing items.
  async function handleAddSelectedQuestions() {
    const id = await ensureDraftCreated();
    if (!id) return;
    setAddingBatch(true);
    try {
      const existingIds = new Set(draftItems.map((item) => item.question_id));
      const targetIds = selectedBankIds;

      // Add newly checked questions
      const toAdd = [...targetIds].filter((qid) => !existingIds.has(qid));
      for (const qid of toAdd) {
        await addQuestionToDraft(id, qid);
      }

      // Remove newly unchecked questions
      const toRemove = [...existingIds].filter((qid) => !targetIds.has(qid));
      for (const qid of toRemove) {
        await removeQuestionFromDraft(id, qid);
      }

      await loadDraftItems(id);
      setAddQuestionModal(false);
      setSelectedBankIds(new Set());
    } catch {
      setError('Failed to update assignment questions.');
    } finally {
      setAddingBatch(false);
    }
  }

  async function handleCreateNewQuestion(data: Parameters<typeof createQuestion>[0]) {
    setCreatingQuestion(true);
    try {
      const q = await createQuestion(data);
      setNewQuestionData(q);
      setAddQuestionStep('saveDecision');
    } catch {
      setError('Failed to create question.');
    } finally {
      setCreatingQuestion(false);
    }
  }

  async function handleQuestionSaveChoice(choice: 'assignment' | 'bank') {
    const id = await ensureDraftCreated();
    if (!id || !newQuestionData) return;
    try {
      await addQuestionToDraft(id, newQuestionData.id);
      if (choice === 'assignment') {
        await archiveQuestion(newQuestionData.id);
      }
      await loadDraftItems(id);
      setAddQuestionModal(false);
    } catch {
      setError('Failed to add question to assignment.');
    }
  }

  // ── Remove question from draft ──────────────────────────────

  async function handleRemoveQuestion(questionId: number) {
    if (!draftId) return;
    try {
      await removeQuestionFromDraft(draftId, questionId);
      await loadDraftItems(draftId);
    } catch {
      setError('Failed to remove question.');
    }
  }

  // ── Update item metadata (scheduling) ──────────────────────

  async function handleUpdateItem(
    questionId: number,
    update: {
      available_from: string | null;
      due_date: string | null;
      due_after_days: number | null;
      timed: boolean;
      time_limit_seconds: number | null;
    },
  ) {
    if (!draftId) return;
    try {
      await updateAssignmentItem(draftId, questionId, update);
      await loadDraftItems(draftId);
    } catch {
      // Silent fail for inline updates
    }
  }

  // ── Save as Preset ─────────────────────────────────────────

  async function handleSaveAsPreset() {
    if (!draftId || !presetName.trim()) return;
    setSavingPreset(true);
    try {
      await saveDraftAsPreset(draftId, presetName.trim(), presetDesc.trim() || null);
      setSavePresetModal(false);
      setPresetName('');
      setPresetDesc('');
    } catch {
      setError('Failed to save as preset.');
    } finally {
      setSavingPreset(false);
    }
  }

  // ── Publish (entry point only) ─────────────────────────────

  async function handlePublish() {
    if (!draftId) return;
    setPublishing(true);
    try {
      setError('Publishing will be available in the next milestone.');
    } finally {
      setPublishing(false);
    }
  }

  // ── List view handlers ─────────────────────────────────────

  async function handleDuplicate() {
    if (!duplicateTarget) return;
    try {
      await duplicateDraft(duplicateTarget);
      setDuplicateTarget(null);
      await loadDrafts();
    } catch {
      setError('Failed to duplicate assignment.');
    }
  }

  async function handleDeleteDraft() {
    if (!deleteTarget) return;
    try {
      await deleteDraft(deleteTarget.id);
      setDeleteTarget(null);
      await loadDrafts();
    } catch {
      setError('Failed to delete assignment.');
    }
  }

  const hasActiveBankFilters = useMemo(
    () =>
      bankCategoryFilter ||
      bankTypeFilter ||
      bankResponseTypeFilter ||
      bankTagFilter ||
      bankOwnerFilter !== 'everyone' ||
      bankStatusFilter !== 'active',
    [bankCategoryFilter, bankTypeFilter, bankResponseTypeFilter, bankTagFilter, bankOwnerFilter, bankStatusFilter],
  );

  // ════════════════════════════════════════════════════════════
  // EDIT VIEW
  // ════════════════════════════════════════════════════════════

  if (view === 'edit') {
    const canSave = selectedClassId !== '' && assignmentName.trim() !== '';

    return (
      <div className="p-6 md:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {draftId ? 'Edit Assignment' : 'New Assignment'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {draftId
                ? 'Add questions, set scheduling, then save as draft or publish.'
                : 'Choose a class and name your assignment. You can use a preset or start from scratch.'}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setView('list');
              setDraftId(null);
              setDraftItems([]);
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

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* ── LEFT COLUMN: Assignment-level info ─────────── */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Assignment Details
              </h2>

              {/* Target Class (required) */}
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Target Class <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value ? parseInt(e.target.value) : '');
                    if (draftId) updateDraftMeta();
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                >
                  <option value="">Select a class...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assignment Name (required) */}
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Assignment Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={assignmentName}
                  onChange={(e) => {
                    setAssignmentName(e.target.value);
                    if (draftId) updateDraftMeta();
                  }}
                  placeholder="e.g. IELTS Practice Week 3"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              {/* Description (optional) */}
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Description{' '}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  value={assignmentDescription}
                  onChange={(e) => {
                    setAssignmentDescription(e.target.value);
                    if (draftId) updateDraftMeta();
                  }}
                  rows={3}
                  placeholder="Assignment description..."
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              {/* Assignment Preset (optional) */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Assignment Preset{' '}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <select
                  value={selectedPreset?.id ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      handleClearPreset();
                    } else {
                      const p = presets.find((t) => t.id === parseInt(val));
                      if (p) handleSelectPreset(p);
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                >
                  <option value="">No preset — start from scratch</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.question_count} question{p.question_count !== 1 ? 's' : ''})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Save as Preset */}
            {draftId && (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                  Reuse
                </h2>
                <Button
                  variant="secondary"
                  icon={<Save size={16} />}
                  onClick={() => {
                    setPresetName(assignmentName);
                    setPresetDesc(assignmentDescription);
                    setSavePresetModal(true);
                  }}
                  className="w-full"
                >
                  Save as Assignment Preset
                </Button>
                <p className="mt-2 text-xs text-slate-400">
                  Save this assignment as a reusable preset for future assignments.
                </p>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN: Live Assignment Editor ───────── */}
          <div className="space-y-4">
            {/* Assignment Items header */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Assignment Items ({draftItems.length})
              </h2>
              <Button
                size="sm"
                icon={<Plus size={14} />}
                onClick={openAddQuestionWizard}
                disabled={!canSave}
              >
                Add Question
              </Button>
            </div>

            {!canSave ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center">
                <ClipboardList size={40} className="text-slate-300" />
                <p className="mt-4 text-sm font-medium text-slate-500">
                  Select a class and name your assignment to begin
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  The editor will activate once both fields are filled
                </p>
              </div>
            ) : loadingItems ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="md" />
              </div>
            ) : draftItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
                <BookOpen size={32} className="text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-500">
                  No questions in this assignment yet
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Click "Add Question" to get started
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {draftItems.map((item, idx) => (
                  <AssignmentItemCard
                    key={item.id}
                    item={item}
                    index={idx}
                    onRemove={() => handleRemoveQuestion(item.question_id)}
                    onUpdate={(update) => handleUpdateItem(item.question_id, update)}
                  />
                ))}
              </div>
            )}

            {/* Bottom action buttons */}
            {canSave && (
              <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
                <Button
                  variant="secondary"
                  icon={<Save size={16} />}
                  loading={saving}
                  onClick={async () => {
                    await ensureDraftCreated();
                    if (draftId) await updateDraftMeta();
                    loadDrafts();
                    setView('list');
                  }}
                >
                  Save as Draft
                </Button>
                <Button
                  icon={<Send size={16} />}
                  onClick={handlePublish}
                  loading={publishing}
                  disabled={draftItems.length === 0}
                >
                  Publish
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ── Add Question Wizard Modal ────────────────────── */}
        <Modal
          isOpen={addQuestionModal}
          onClose={() => setAddQuestionModal(false)}
          title={
            addQuestionStep === 'choose'
              ? 'Add Question'
              : addQuestionStep === 'bank'
                ? `Choose from Question Bank${selectedBankIds.size > 0 ? ` (${selectedBankIds.size} selected)` : ''}`
                : addQuestionStep === 'create'
                  ? 'Create New Question'
                  : 'Save Question?'
          }
          size={addQuestionStep === 'create' ? 'xl' : 'lg'}
        >
          {addQuestionStep === 'choose' && (
            <div className="space-y-3">
              <button
                onClick={() => setAddQuestionStep('bank')}
                className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
                  <BookOpen size={22} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Use Question Bank
                  </p>
                  <p className="text-xs text-slate-500">
                    Browse and select existing questions
                  </p>
                </div>
              </button>
              <button
                onClick={() => setAddQuestionStep('create')}
                className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
                  <Plus size={22} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Create New Question
                  </p>
                  <p className="text-xs text-slate-500">
                    Write a new question from scratch
                  </p>
                </div>
              </button>
            </div>
          )}

          {addQuestionStep === 'bank' && (
            <div className="space-y-4">
              {/* Search + filter toggle */}
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={bankSearch}
                    onChange={(e) => setBankSearch(e.target.value)}
                    placeholder="Search by prompt or tags..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
                <Button
                  size="sm"
                  variant={bankShowFilters ? 'primary' : 'secondary'}
                  icon={<Filter size={16} />}
                  onClick={() => setBankShowFilters((v) => !v)}
                >
                  Filters
                </Button>
              </div>

              {/* Filter panel — matches Question Library */}
              {bankShowFilters && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    {/* Owner */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Owner
                      </label>
                      <select
                        value={bankOwnerFilter}
                        onChange={(e) => setBankOwnerFilter(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
                      >
                        <option value="mine">Mine</option>
                        <option value="everyone">Everyone</option>
                      </select>
                    </div>
                    {/* Status */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Status
                      </label>
                      <select
                        value={bankStatusFilter}
                        onChange={(e) =>
                          setBankStatusFilter(e.target.value as 'active' | 'archived' | 'all')
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
                      >
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                        <option value="all">All</option>
                      </select>
                    </div>
                    {/* Type */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Question Type
                      </label>
                      <select
                        value={bankTypeFilter}
                        onChange={(e) => {
                          setBankTypeFilter(e.target.value ? parseInt(e.target.value) : '');
                          setBankCategoryFilter('');
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
                    {/* Response Type */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Response Type
                      </label>
                      <select
                        value={bankResponseTypeFilter}
                        onChange={(e) =>
                          setBankResponseTypeFilter(e.target.value as ResponseType | '')
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
                      >
                        <option value="">All</option>
                        <option value="text">Text</option>
                        <option value="audio">Audio</option>
                      </select>
                    </div>
                    {/* Category */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Category
                      </label>
                      <select
                        value={bankCategoryFilter}
                        onChange={(e) => setBankCategoryFilter(e.target.value)}
                        disabled={!bankTypeFilter}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="">
                          {bankTypeFilter ? 'All categories' : 'Select a type first'}
                        </option>
                        {bankTypeFilter && CATEGORY_OPTIONS[bankTypeFilter] && (
                          <>
                            {CATEGORY_OPTIONS[bankTypeFilter].map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                            {bankAvailableCategories
                              .filter((c) => !CATEGORY_OPTIONS[bankTypeFilter].includes(c))
                              .map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                          </>
                        )}
                        {bankTypeFilter && !CATEGORY_OPTIONS[bankTypeFilter] && (
                          <>
                            {bankAvailableCategories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>
                    {/* Tag */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Tag
                      </label>
                      <select
                        value={bankTagFilter}
                        onChange={(e) => setBankTagFilter(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
                      >
                        <option value="">All tags</option>
                        {bankAllTags.map((tag) => (
                          <option key={tag} value={tag}>
                            {tag}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {hasActiveBankFilters && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          setBankOwnerFilter('everyone');
                          setBankCategoryFilter('');
                          setBankTypeFilter('');
                          setBankResponseTypeFilter('');
                          setBankStatusFilter('active');
                          setBankTagFilter('');
                        }}
                        className="flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-700"
                      >
                        <X size={13} />
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Questions list with multi-select */}
              {bankLoading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner size="md" />
                </div>
              ) : bankQuestions.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No questions found. Try adjusting your search.
                </p>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {bankQuestions.map((q) => {
                    const isSelected = selectedBankIds.has(q.id);
                    return (
                      <div
                        key={q.id}
                        className={`flex items-start gap-3 rounded-xl border p-4 transition cursor-pointer ${
                          isSelected
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                        }`}
                        onClick={() => toggleBankSelection(q.id)}
                      >
                        <div
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
                            isSelected
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <CheckCircle2 size={14} className="text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                              {q.type_name}
                            </span>
                            {q.response_type === 'audio' ? (
                              <span className="flex items-center gap-0.5 text-xs text-slate-400">
                                <Mic size={10} />
                                Audio
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5 text-xs text-slate-400">
                                <FileText size={10} />
                                Text
                              </span>
                            )}
                            {q.tags && q.tags.length > 0 && (
                              <span className="flex items-center gap-0.5 text-xs text-slate-400">
                                <Tag size={10} />
                                {q.tags.length}
                              </span>
                            )}
                          </div>
                          <p className="line-clamp-2 whitespace-pre-wrap text-sm text-slate-700">
                            {q.content}
                          </p>
                        </div>
                        {/* Preview button — does not interrupt selection */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewQuestion(q);
                          }}
                          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                          title="Preview question"
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom bar: Back + Done */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setAddQuestionStep('choose')}
                  className="flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
                <Button
                  onClick={handleAddSelectedQuestions}
                  loading={addingBatch}
                  disabled={selectedBankIds.size === 0}
                  icon={<CheckCircle2 size={16} />}
                >
                  Done ({selectedBankIds.size} selected)
                </Button>
              </div>
            </div>
          )}

          {addQuestionStep === 'create' && (
            <QuestionForm
              questionTypes={questionTypes}
              initialData={null}
              currentUserId={currentUserId}
              onSubmit={handleCreateNewQuestion}
              onCancel={() => setAddQuestionStep('choose')}
              onDuplicate={() => {}}
              submitting={creatingQuestion}
            />
          )}

          {addQuestionStep === 'saveDecision' && newQuestionData && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-medium text-emerald-700">
                  Question created successfully!
                </p>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-600">
                  {newQuestionData.content}
                </p>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-slate-700">
                  Save Question?
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => handleQuestionSaveChoice('assignment')}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                      <FileText size={18} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        Add to this Assignment only
                      </p>
                      <p className="text-xs text-slate-500">
                        The question will not appear in your Question Bank
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => handleQuestionSaveChoice('bank')}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                      <BookOpen size={18} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        Add to Question Bank
                      </p>
                      <p className="text-xs text-slate-500">
                        Save to Question Bank and add to this Assignment
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* ── Preview Modal (non-interrupting) ──────────────── */}
        <Modal
          isOpen={previewQuestion !== null}
          onClose={() => setPreviewQuestion(null)}
          title="Question Preview"
          size="lg"
        >
          {previewQuestion && (
            <QuestionPreview
              question={previewQuestion}
              typeName={previewQuestion.type_name}
            />
          )}
        </Modal>

        {/* ── Save as Preset Modal ───────────────────────────── */}
        <Modal
          isOpen={savePresetModal}
          onClose={() => setSavePresetModal(false)}
          title="Save as Assignment Preset"
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Preset Name
              </label>
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name..."
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Description{' '}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                value={presetDesc}
                onChange={(e) => setPresetDesc(e.target.value)}
                rows={3}
                placeholder="Preset description..."
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setSavePresetModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveAsPreset}
                loading={savingPreset}
                disabled={!presetName.trim()}
              >
                Save Preset
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // LIST VIEW
  // ════════════════════════════════════════════════════════════

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Assignments</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create assignments from presets or from scratch, and track submissions.
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={startNewAssignment}>
          New Assignment
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
            placeholder="Search assignments..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as 'draft' | 'published' | 'all')
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
            Click "New Assignment" to create one.
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
                      From preset: {d.template_name}
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
                  icon={<Edit3 size={13} />}
                  onClick={() => handleEditDraft(d)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Copy size={13} />}
                  onClick={() => setDuplicateTarget(d)}
                >
                  Duplicate
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

      {/* Duplicate confirmation */}
      <Modal
        isOpen={duplicateTarget !== null}
        onClose={() => setDuplicateTarget(null)}
        title="Duplicate Assignment"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Create a copy of "{duplicateTarget?.name}"? The copy will be a new
            draft with the same questions and scheduling.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDuplicateTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleDuplicate}>Duplicate</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Assignment"
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

// ═══════════════════════════════════════════════════════════════
// AssignmentItemCard — live editable item with scheduling
// ═══════════════════════════════════════════════════════════════

function AssignmentItemCard({
  item,
  index,
  onRemove,
  onUpdate,
}: {
  item: AssignmentItem;
  index: number;
  onRemove: () => void;
  onUpdate: (update: {
    available_from: string | null;
    due_date: string | null;
    due_after_days: number | null;
    timed: boolean;
    time_limit_seconds: number | null;
  }) => void;
}) {
  // Parse the stored time_limit interval into seconds
  const storedSeconds = parseIntervalToSeconds(item.time_limit);

  const [showSchedule, setShowSchedule] = useState(false);
  const [availableFrom, setAvailableFrom] = useState<string>(
    item.available_from ? toLocalDatetimeInput(new Date(item.available_from)) : '',
  );
  const [dueAfterDays, setDueAfterDays] = useState<string>(
    item.due_after_days?.toString() ?? '',
  );
  const [dueDate, setDueDate] = useState<string>(
    item.due_date ? toLocalDatetimeInput(new Date(item.due_date)) : '',
  );
  const [timed, setTimed] = useState(item.timed);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<string>(
    storedSeconds !== null ? Math.floor(storedSeconds / 60).toString() : '',
  );
  const [timeLimitSeconds, setTimeLimitSeconds] = useState<string>(
    storedSeconds !== null ? (storedSeconds % 60).toString() : '',
  );

  // Auto-calculate due date when available_from or due_after_days changes
  useEffect(() => {
    if (availableFrom && dueAfterDays) {
      const days = parseInt(dueAfterDays);
      if (days > 0) {
        const calculated = calcDueDate(parseLocalDatetimeInput(availableFrom), days);
        if (calculated) {
          setDueDate(toLocalDatetimeInput(new Date(calculated)));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableFrom, dueAfterDays]);

  function handleTimedToggle(checked: boolean) {
    setTimed(checked);
    if (checked && storedSeconds === null) {
      // Auto-populate recommended default based on question type
      const defaultSec = item.type_id ? (DEFAULT_TIME_LIMIT_SECONDS[item.type_id] ?? null) : null;
      if (defaultSec !== null && defaultSec !== undefined) {
        setTimeLimitMinutes(Math.floor(defaultSec / 60).toString());
        setTimeLimitSeconds((defaultSec % 60).toString());
      } else {
        setTimeLimitMinutes('');
        setTimeLimitSeconds('');
      }
    }
  }

  function handleSaveSchedule() {
    const af = availableFrom ? parseLocalDatetimeInput(availableFrom) : null;
    const dd = dueDate ? parseLocalDatetimeInput(dueDate) : null;
    const dad = dueAfterDays ? parseInt(dueAfterDays) : null;

    // Convert minutes + seconds inputs to total seconds
    let totalSeconds: number | null = null;
    if (timed) {
      const mins = timeLimitMinutes ? parseInt(timeLimitMinutes) : 0;
      const secs = timeLimitSeconds ? parseInt(timeLimitSeconds) : 0;
      totalSeconds = mins * 60 + secs;
      if (totalSeconds === 0) totalSeconds = null;
    }

    onUpdate({
      available_from: af,
      due_date: dd,
      due_after_days: dad,
      timed,
      time_limit_seconds: totalSeconds,
    });
    setShowSchedule(false);
  }

  const displaySeconds = parseIntervalToSeconds(item.time_limit);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-700">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {item.type_name ?? 'Unknown'}
            </span>
            {item.timed && displaySeconds !== null && (
              <span className="flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                <Clock size={10} />
                {formatSeconds(displaySeconds)}
              </span>
            )}
            {item.available_from && (
              <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                <Calendar size={10} />
                {new Date(item.available_from).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">
            {item.content}
          </p>
        </div>
        <button
          onClick={onRemove}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          title="Remove from assignment"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scheduling section */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        {!showSchedule ? (
          <button
            onClick={() => setShowSchedule(true)}
            className="flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-700"
          >
            <Calendar size={13} />
            {item.available_from || item.due_date || item.timed
              ? 'Edit scheduling'
              : 'Set availability & due date'}
          </button>
        ) : (
          <div className="space-y-3">
            {/* Available From + Due After */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Available From
                </label>
                <input
                  type="datetime-local"
                  value={availableFrom}
                  onChange={(e) => setAvailableFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Due After (days)
                </label>
                <input
                  type="number"
                  min="1"
                  value={dueAfterDays}
                  onChange={(e) => setDueAfterDays(e.target.value)}
                  placeholder="e.g. 3"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>

            {/* Due Date (auto-calculated, editable) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Due Date{' '}
                <span className="font-normal text-slate-400">
                  (auto-calculated from Available From + Due After)
                </span>
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {/* Time Limit: Minutes + Seconds */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={timed}
                  onChange={(e) => handleTimedToggle(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Timed
              </label>
              {timed && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      value={timeLimitMinutes}
                      onChange={(e) => setTimeLimitMinutes(e.target.value)}
                      placeholder="0"
                      className="w-16 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                    />
                    <span className="text-xs text-slate-500">min</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={timeLimitSeconds}
                      onChange={(e) => setTimeLimitSeconds(e.target.value)}
                      placeholder="0"
                      className="w-16 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                    />
                    <span className="text-xs text-slate-500">sec</span>
                  </div>
                </div>
              )}
            </div>

            {/* Save / Cancel */}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowSchedule(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveSchedule}>
                Save Schedule
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
