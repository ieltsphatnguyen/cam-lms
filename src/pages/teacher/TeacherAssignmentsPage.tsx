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
  RotateCcw,
  UserCircle,
  School,
  PlusCircle,
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
  publishDraft,
  fetchPublishedAssignments,
  fetchPublishedAssignment,
  fetchPublishedItems,
  duplicatePublishedToDraft,
  unpublishDraft,
} from '@/lib/templates';
import PresetBrowserModal, { PresetSummary } from '@/components/templates/PresetBrowser';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  fetchQuestions,
  fetchQuestionTypes,
  fetchAllTags,
  fetchCategoriesForType,
  createQuestion,
  archiveQuestion,
  CATEGORY_OPTIONS,
  QUESTION_TYPE_IDS,
  DEFAULT_RESPONSE_TYPE,
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
  PublishedAssignmentWithDetails,
  PublishedAssignmentItem,
} from '@/types/database';

type View = 'list' | 'edit' | 'published';

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
  const [published, setPublished] = useState<PublishedAssignmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Published view state
  const [viewingPublished, setViewingPublished] = useState<PublishedAssignmentWithDetails | null>(null);
  const [publishedItems, setPublishedItems] = useState<PublishedAssignmentItem[]>([]);
  const [loadingPublishedItems, setLoadingPublishedItems] = useState(false);

  // Duplicate published
  const [duplicatePublishedTarget, setDuplicatePublishedTarget] =
    useState<PublishedAssignmentWithDetails | null>(null);

  // Unpublish published
  const [unpublishTarget, setUnpublishTarget] =
    useState<PublishedAssignmentWithDetails | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);

  // Preset browser modal
  const [showPresetBrowser, setShowPresetBrowser] = useState(false);

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

  // ── Load functions ──────────────────────────────────────────

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [draftData, pubData] = await Promise.all([
        fetchDrafts(currentUserId, {
          ownerId: isAdmin ? 'everyone' : 'mine',
          status: 'draft',
          search: search || undefined,
        }),
        fetchPublishedAssignments(currentUserId, isAdmin),
      ]);
      setDrafts(draftData);
      setPublished(pubData);
    } catch {
      setError('Failed to load assignments.');
    } finally {
      setLoading(false);
    }
  }, [currentUserId, isAdmin, search]);

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
  // Creates the draft row immediately so the editor always edits an
  // existing draft. No placeholder name/class — the schema allows both
  // to be null until the teacher fills them in.

  async function startNewAssignment() {
    setError(null);
    setView('edit');
    setSelectedClassId('');
    setAssignmentName('');
    setAssignmentDescription('');
    setSelectedPreset(null);
    setDraftItems([]);
    setDraftId(null);
    try {
      const id = await createEmptyDraft(null, null, null);
      setDraftId(id);
    } catch {
      setError('Failed to create assignment. Please try again.');
    }
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
  // The draft always exists, so selecting a preset resolves it into
  // draft questions immediately.

  async function handleSelectPreset(p: AssignmentTemplateWithDetails) {
    setSelectedPreset(p);
    if (!assignmentName.trim()) {
      setAssignmentName(p.name);
      setAssignmentDescription(p.description ?? '');
    }
    if (!draftId) return;

    setSaving(true);
    try {
      const items = await replaceDraftFromTemplate(
        draftId,
        p.id,
        selectedClassId || null,
      );
      setDraftItems(items);
      if (assignmentName.trim()) await updateDraftMeta(assignmentName, assignmentDescription, selectedClassId);
    } catch {
      setError('Failed to apply preset to assignment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleClearPreset() {
    setSelectedPreset(null);
    if (!draftId) return;

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

  // ── Auto-save draft metadata ────────────────────────────────
  // The draft always exists, so edits persist directly. Accepts the new
  // values as arguments so callers can pass fresh state without waiting
  // for a re-render.

  async function updateDraftMeta(
    name: string,
    description: string,
    classId: number | '',
  ) {
    if (!draftId) return;
    try {
      const { error: uErr } = await supabase
        .from('assignment_drafts')
        .update({
          name: name.trim() || null,
          description: description.trim() || null,
          class_id: classId || null,
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
    if (!draftId) return;
    const id = draftId;
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
    if (!draftId || !newQuestionData) return;
    const id = draftId;
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
      prep_time_seconds: number | null;
      recording_time_seconds: number | null;
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

  // ── Publish ────────────────────────────────────────────────
  // Drafts may be incomplete, but publishing requires a target class,
  // an assignment name, and at least one assignment item.

  async function handlePublish() {
    if (!draftId) return;
    const missing: string[] = [];
    if (!selectedClassId) missing.push('a target class');
    if (!assignmentName.trim()) missing.push('an assignment name');
    if (draftItems.length === 0) missing.push('at least one assignment item');
    if (missing.length > 0) {
      setError(
        `Cannot publish — please add ${missing.join(', ')} before publishing.`,
      );
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      await updateDraftMeta(assignmentName, assignmentDescription, selectedClassId);
      await publishDraft(draftId);
      await loadDrafts();
      setView('list');
      setDraftId(null);
      setDraftItems([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to publish assignment.',
      );
    } finally {
      setPublishing(false);
    }
  }

  // ── View published assignment ─────────────────────────────

  async function handleViewPublished(p: PublishedAssignmentWithDetails) {
    setError(null);
    setViewingPublished(p);
    setView('published');
    setLoadingPublishedItems(true);
    try {
      const items = await fetchPublishedItems(p.id);
      setPublishedItems(items);
    } catch {
      setPublishedItems([]);
    } finally {
      setLoadingPublishedItems(false);
    }
  }

  async function handleDuplicatePublished() {
    if (!duplicatePublishedTarget) return;
    try {
      await duplicatePublishedToDraft(duplicatePublishedTarget.id);
      setDuplicatePublishedTarget(null);
      await loadDrafts();
    } catch {
      setError('Failed to duplicate published assignment.');
    }
  }

  async function handleUnpublish() {
    if (!unpublishTarget) return;
    setUnpublishing(true);
    try {
      await unpublishDraft(unpublishTarget.id);
      setUnpublishTarget(null);
      await loadDrafts();
    } catch {
      setError('Failed to unpublish assignment.');
    } finally {
      setUnpublishing(false);
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
  // PUBLISHED VIEW
  // ════════════════════════════════════════════════════════════

  if (view === 'published' && viewingPublished) {
    return (
      <div className="p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {viewingPublished.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Published to {viewingPublished.class_name} on{' '}
              {formatDate(viewingPublished.published_at)}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <UserCircle size={13} className="text-slate-400" />
                <span className="font-medium text-slate-600">Publisher:</span>{' '}
                {viewingPublished.owner_display_name || 'Unknown'}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-400" />
                <span className="font-medium text-slate-600">Published:</span>{' '}
                {formatDateTime(viewingPublished.published_at)}
              </span>
              <span className="flex items-center gap-1.5">
                <School size={13} className="text-slate-400" />
                <span className="font-medium text-slate-600">Target Class:</span>{' '}
                {viewingPublished.class_name}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            icon={<ChevronLeft size={16} />}
            onClick={() => {
              setView('list');
              setViewingPublished(null);
              setPublishedItems([]);
            }}
          >
            Back to list
          </Button>
        </div>

        {viewingPublished.description && (
          <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="whitespace-pre-wrap text-sm text-slate-600">
              {viewingPublished.description}
            </p>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Assignment Items ({publishedItems.length})
          </h2>
          <span className="rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            Published — Read Only
          </span>
        </div>

        {loadingPublishedItems ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ) : publishedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
            <BookOpen size={32} className="text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">
              No questions in this assignment
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {publishedItems.map((item, idx) => (
              <PublishedItemCard key={item.id} item={item} index={idx} />
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
          <Button
            variant="secondary"
            icon={<Copy size={16} />}
            onClick={() => setDuplicatePublishedTarget(viewingPublished)}
          >
            Duplicate to New Draft
          </Button>
          {(viewingPublished.owner_id === currentUserId || isAdmin) && (
            <Button
              variant="ghost"
              icon={<RotateCcw size={16} />}
              onClick={() => setUnpublishTarget(viewingPublished)}
              className="text-amber-600 hover:text-amber-800"
            >
              Unpublish
            </Button>
          )}
          {!isAdmin && viewingPublished.owner_id !== currentUserId && (
            <span className="text-xs text-slate-400">
              View only — you can edit this assignment only if you own it.
            </span>
          )}
        </div>
      </div>
    );
  }

  // EDIT VIEW
  // ════════════════════════════════════════════════════════════

  if (view === 'edit') {
    // The draft always exists, so editing is available immediately.
    // Required-field validation lives in the publish workflow.
    const canSave = draftId !== null;

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
                    const v = e.target.value ? parseInt(e.target.value) : '';
                    setSelectedClassId(v);
                    if (draftId) updateDraftMeta(assignmentName, assignmentDescription, v);
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
                    const v = e.target.value;
                    setAssignmentName(v);
                    if (draftId) updateDraftMeta(v, assignmentDescription, selectedClassId);
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
                    const v = e.target.value;
                    setAssignmentDescription(v);
                    if (draftId) updateDraftMeta(assignmentName, v, selectedClassId);
                  }}
                  rows={3}
                  placeholder="Assignment description..."
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              {/* Assignment Preset Summary */}
              <PresetSummary
                preset={selectedPreset}
                onBrowse={() => setShowPresetBrowser(true)}
                onClear={handleClearPreset}
              />
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

            {!draftId ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center">
                <LoadingSpinner size="md" />
                <p className="mt-4 text-sm font-medium text-slate-500">
                  Creating assignment...
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
                    if (draftId) await updateDraftMeta(assignmentName, assignmentDescription, selectedClassId);
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
              <div className="border-t border-slate-100 pt-4">
                <button
                  onClick={() => {
                    setNewQuestionData(null);
                    setAddQuestionStep('create');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <PlusCircle size={16} className="text-blue-600" />
                  Create Another Question
                </button>
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

        {/* Preset Browser Modal */}
        <PresetBrowserModal
          isOpen={showPresetBrowser}
          onClose={() => setShowPresetBrowser(false)}
          currentUserId={currentUserId}
          selectedPresetId={selectedPreset?.id ?? null}
          onSelectPreset={handleSelectPreset}
        />
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
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* DRAFTS */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Drafts ({drafts.length})
              </h2>
            </div>
            {drafts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
                <ClipboardList size={36} className="text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-500">
                  No drafts yet.
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
                        <h3
                          onClick={() => handleEditDraft(d)}
                          className="cursor-pointer truncate text-sm font-semibold text-slate-800 transition hover:text-blue-600 hover:underline"
                        >
                          {d.name || 'Untitled Draft'}
                        </h3>
                        {d.template_name && (
                          <p className="mt-0.5 text-xs text-slate-400">
                            From preset: {d.template_name}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Draft
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
          </div>

          {/* PUBLISHED */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Published ({published.length})
              </h2>
            </div>
            {published.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                <Send size={32} className="text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-500">
                  No published assignments yet.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Publish a draft to make it visible to students.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {published.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3
                          onClick={() => handleViewPublished(p)}
                          className="cursor-pointer truncate text-sm font-semibold text-slate-800 transition hover:text-blue-600 hover:underline"
                        >
                          {p.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {p.class_name}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Published
                      </span>
                      {p.owner_id !== currentUserId && !isAdmin && (
                        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          View only
                        </span>
                      )}
                    </div>

                    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Layers size={11} />
                        {p.item_count} question
                        {p.item_count !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {formatDate(p.published_at)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Eye size={13} />}
                        onClick={() => handleViewPublished(p)}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Copy size={13} />}
                        onClick={() => setDuplicatePublishedTarget(p)}
                      >
                        Duplicate
                      </Button>
                      {(p.owner_id === currentUserId || isAdmin) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<RotateCcw size={13} />}
                          onClick={() => setUnpublishTarget(p)}
                          className="text-amber-600 hover:text-amber-800"
                        >
                          Unpublish
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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

      {/* Duplicate published confirmation */}
      <Modal
        isOpen={duplicatePublishedTarget !== null}
        onClose={() => setDuplicatePublishedTarget(null)}
        title="Duplicate Published Assignment"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Create a new draft from "{duplicatePublishedTarget?.name}"? The
            original published assignment will not be changed.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setDuplicatePublishedTarget(null)}
            >
              Cancel
            </Button>
            <Button onClick={handleDuplicatePublished}>Duplicate to Draft</Button>
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

      {/* Unpublish confirmation */}
      <Modal
        isOpen={unpublishTarget !== null}
        onClose={() => setUnpublishTarget(null)}
        title="Unpublish Assignment"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Unpublish "{unpublishTarget?.name}"? This will convert it back into
            an editable draft. Students will no longer see it.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setUnpublishTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUnpublish}
              loading={unpublishing}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Unpublish
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
    prep_time_seconds: number | null;
    recording_time_seconds: number | null;
  }) => void;
}) {
  // Parse the stored time_limit interval into seconds
  const storedSeconds = parseIntervalToSeconds(item.time_limit);
  const isPart2OrCustomSpeaking =
    item.type_id === QUESTION_TYPE_IDS.SPEAKING_PART_2 ||
    (item.type_id === QUESTION_TYPE_IDS.CUSTOM &&
      (item.rule_response_type === 'audio' ||
        (item.type_id && DEFAULT_RESPONSE_TYPE[item.type_id] === 'audio')));

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
  const [prepMinutes, setPrepMinutes] = useState<string>(
    item.prep_time_seconds ? Math.floor(item.prep_time_seconds / 60).toString() : '',
  );
  const [prepSeconds, setPrepSeconds] = useState<string>(
    item.prep_time_seconds ? (item.prep_time_seconds % 60).toString() : '',
  );
  const [recordingMinutes, setRecordingMinutes] = useState<string>(
    item.recording_time_seconds ? Math.floor(item.recording_time_seconds / 60).toString() : '',
  );
  const [recordingSeconds, setRecordingSeconds] = useState<string>(
    item.recording_time_seconds ? (item.recording_time_seconds % 60).toString() : '',
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
    if (checked) {
      if (isPart2OrCustomSpeaking) {
        // Auto-populate Part 2 defaults: 1 min prep, 2 min recording
        if (item.prep_time_seconds === null) {
          setPrepMinutes('1');
          setPrepSeconds('0');
        }
        if (item.recording_time_seconds === null) {
          setRecordingMinutes('2');
          setRecordingSeconds('0');
        }
      } else {
        // Auto-populate recommended default based on question type
        const defaultSec = item.type_id ? (DEFAULT_TIME_LIMIT_SECONDS[item.type_id] ?? null) : null;
        if (defaultSec !== null && defaultSec !== undefined && storedSeconds === null) {
          setTimeLimitMinutes(Math.floor(defaultSec / 60).toString());
          setTimeLimitSeconds((defaultSec % 60).toString());
        } else if (storedSeconds === null) {
          setTimeLimitMinutes('');
          setTimeLimitSeconds('');
        }
      }
    }
  }

  function handleSaveSchedule() {
    const af = availableFrom ? parseLocalDatetimeInput(availableFrom) : null;
    const dd = dueDate ? parseLocalDatetimeInput(dueDate) : null;
    const dad = dueAfterDays ? parseInt(dueAfterDays) : null;

    let totalSeconds: number | null = null;
    let prepSec: number | null = null;
    let recSec: number | null = null;

    if (timed) {
      if (isPart2OrCustomSpeaking) {
        const pMin = prepMinutes ? parseInt(prepMinutes) : 0;
        const pSec = prepSeconds ? parseInt(prepSeconds) : 0;
        prepSec = pMin * 60 + pSec;
        if (prepSec === 0) prepSec = null;

        const rMin = recordingMinutes ? parseInt(recordingMinutes) : 0;
        const rSec = recordingSeconds ? parseInt(recordingSeconds) : 0;
        recSec = rMin * 60 + rSec;
        if (recSec === 0) recSec = null;
      } else {
        const mins = timeLimitMinutes ? parseInt(timeLimitMinutes) : 0;
        const secs = timeLimitSeconds ? parseInt(timeLimitSeconds) : 0;
        totalSeconds = mins * 60 + secs;
        if (totalSeconds === 0) totalSeconds = null;
      }
    }

    onUpdate({
      available_from: af,
      due_date: dd,
      due_after_days: dad,
      timed,
      time_limit_seconds: totalSeconds,
      prep_time_seconds: prepSec,
      recording_time_seconds: recSec,
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
                {formatDate(item.available_from)}
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

            {/* Time Limit: Part 2/Custom Speaking uses prep + recording timers */}
            {isPart2OrCustomSpeaking ? (
              <div className="space-y-3">
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
                  <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                    {/* Preparation */}
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">Preparation</label>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number" min="0" value={prepMinutes}
                            onChange={(e) => setPrepMinutes(e.target.value)}
                            placeholder="0"
                            className="w-16 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                          />
                          <span className="text-xs text-slate-500">min</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number" min="0" max="59" value={prepSeconds}
                            onChange={(e) => setPrepSeconds(e.target.value)}
                            placeholder="0"
                            className="w-16 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                          />
                          <span className="text-xs text-slate-500">sec</span>
                        </div>
                      </div>
                    </div>
                    {/* Recording */}
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">Recording</label>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number" min="0" value={recordingMinutes}
                            onChange={(e) => setRecordingMinutes(e.target.value)}
                            placeholder="0"
                            className="w-16 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                          />
                          <span className="text-xs text-slate-500">min</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number" min="0" max="59" value={recordingSeconds}
                            onChange={(e) => setRecordingSeconds(e.target.value)}
                            placeholder="0"
                            className="w-16 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                          />
                          <span className="text-xs text-slate-500">sec</span>
                        </div>
                      </div>
                    </div>
                    {/* Total Duration */}
                    {(() => {
                      const pMin = prepMinutes ? parseInt(prepMinutes) : 0;
                      const pSec = prepSeconds ? parseInt(prepSeconds) : 0;
                      const rMin = recordingMinutes ? parseInt(recordingMinutes) : 0;
                      const rSec = recordingSeconds ? parseInt(recordingSeconds) : 0;
                      const total = pMin * 60 + pSec + rMin * 60 + rSec;
                      return (
                        <div className="flex items-center gap-1.5 border-t border-slate-200 pt-2 text-xs text-slate-500">
                          <Clock size={11} />
                          <span>Total Duration: {formatSeconds(total)}</span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (
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
                        type="number" min="0" value={timeLimitMinutes}
                        onChange={(e) => setTimeLimitMinutes(e.target.value)}
                        placeholder="0"
                        className="w-16 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                      />
                      <span className="text-xs text-slate-500">min</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" min="0" max="59" value={timeLimitSeconds}
                        onChange={(e) => setTimeLimitSeconds(e.target.value)}
                        placeholder="0"
                        className="w-16 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
                      />
                      <span className="text-xs text-slate-500">sec</span>
                    </div>
                  </div>
                )}
              </div>
            )}

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

// ── Published Item Card (read-only snapshot display) ─────────
function PublishedItemCard({
  item,
  index,
}: {
  item: PublishedAssignmentItem;
  index: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
            {index + 1}
          </span>
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            {item.type_name}
          </span>
          {item.response_type === 'audio' && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Mic size={11} /> Audio
            </span>
          )}
        </div>
      </div>

      <p className="whitespace-pre-wrap text-sm text-slate-700">
        {item.content}
      </p>

      {item.description && (
        <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">
          {item.description}
        </p>
      )}

      {item.tags && item.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.tags.map((t, i) => (
            <span
              key={i}
              className="flex items-center gap-0.5 rounded-md bg-slate-50 px-1.5 py-0.5 text-xs text-slate-400"
            >
              <Tag size={9} />
              {t}
            </span>
          ))}
        </div>
      )}

      {(item.timed || item.available_from || item.due_date) && (
        <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
          {item.timed && item.time_limit && (
            <span className="flex items-center gap-1">
              <Clock size={11} /> {item.time_limit}
            </span>
          )}
          {item.available_from && (
            <span className="flex items-center gap-1">
              <Calendar size={11} /> From{' '}
              {new Date(item.available_from).toLocaleDateString()}
            </span>
          )}
          {item.due_date && (
            <span className="flex items-center gap-1">
              <Calendar size={11} /> Due{' '}
              {formatDate(item.due_date)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
