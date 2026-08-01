import { useState, useEffect, useCallback, FormEvent } from 'react';
import {
  Search,
  Eye,
  Check,
  X,
  Plus,
  AlertCircle,
  Loader2,
  FileText,
  Mic,
  Tag,
  GripVertical,
  Layers,
  Shuffle,
  Filter,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import QuestionPreview from '@/components/questions/QuestionPreview';
import DuplicateTemplateDialog from '@/components/templates/DuplicateTemplateDialog';
import {
  fetchQuestions,
  fetchQuestionTypes,
  fetchAllTags,
  fetchCategoriesForType,
  CATEGORY_OPTIONS,
  DEFAULT_RESPONSE_TYPE,
  type QuestionFilters,
} from '@/lib/questions';
import {
  applyCanonicalOrder,
  canonicalTypeRank,
  DuplicateTemplateError,
  fetchTemplateRandomRules,
  setTemplateRandomRules,
} from '@/lib/templates';
import type {
  Question,
  QuestionType,
  QuestionWithDetails,
  ResponseType,
  RandomQuestionRule,
  RandomRuleInput,
} from '@/types/database';

export interface TemplateFormData {
  name: string;
  description: string;
  questionIds: number[];
  randomRules: RandomRuleInput[];
}

type TemplateItem =
  | { kind: 'question'; data: QuestionWithDetails & { selection_order: number } }
  | { kind: 'rule'; data: RandomQuestionRule };

interface Props {
  templateId?: number;
  initialName?: string;
  initialDescription?: string;
  initialQuestionIds?: number[];
  currentUserId: string;
  onSubmit: (data: TemplateFormData) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

export default function TemplateForm({
  templateId,
  initialName = '',
  initialDescription = '',
  initialQuestionIds = [],
  currentUserId,
  onSubmit,
  onCancel,
  submitting,
}: Props) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [availableQuestions, setAvailableQuestions] = useState<
    QuestionWithDetails[]
  >([]);
  const [selectedQuestions, setSelectedQuestions] = useState<
    (QuestionWithDetails & { selection_order: number })[]
  >([]);
  const [randomRules, setRandomRules] = useState<RandomQuestionRule[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Question browser filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<number | ''>('');
  const [responseTypeFilter, setResponseTypeFilter] = useState<
    ResponseType | ''
  >('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [ownerFilter, setOwnerFilter] = useState<string>('everyone');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [showFilters, setShowFilters] = useState(false);

  // Filter options
  const [allTags, setAllTags] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  // Preview modal
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [previewTypeName, setPreviewTypeName] = useState('');

  // Random rule modal
  const [showRuleModal, setShowRuleModal] = useState(false);

  // Duplicate dialog
  const [duplicateInfo, setDuplicateInfo] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const selectedIds = new Set(selectedQuestions.map((q) => q.id));

  useEffect(() => {
    fetchQuestionTypes().then(setQuestionTypes).catch(() => {});
  }, []);

  useEffect(() => {
    fetchAllTags().then(setAllTags).catch(() => {});
  }, [availableQuestions]);

  useEffect(() => {
    if (typeFilter) {
      fetchCategoriesForType(typeFilter).then(setAvailableCategories).catch(() => {});
    } else {
      setAvailableCategories([]);
    }
  }, [typeFilter, availableQuestions]);

  const loadAvailable = useCallback(async () => {
    setLoadingAvailable(true);
    try {
      const filters: QuestionFilters = {
        ownerId: ownerFilter as QuestionFilters['ownerId'],
        status: statusFilter,
        search: search || undefined,
        typeId: typeFilter || undefined,
        responseType: responseTypeFilter || undefined,
        category: categoryFilter || undefined,
        tags: tagFilter ? [tagFilter] : undefined,
      };
      const data = await fetchQuestions(currentUserId, filters);
      setAvailableQuestions(data);
    } catch {
      setAvailableQuestions([]);
    } finally {
      setLoadingAvailable(false);
    }
  }, [currentUserId, search, typeFilter, responseTypeFilter, categoryFilter, tagFilter, ownerFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => loadAvailable(), 300);
    return () => clearTimeout(timer);
  }, [loadAvailable]);

  // Load initial selected questions and random rules
  useEffect(() => {
    (async () => {
      if (initialQuestionIds.length > 0) {
        try {
          const all = await fetchQuestions(currentUserId, {
            ownerId: 'everyone',
            status: 'all',
          });
          const selected = all
            .filter((q) => initialQuestionIds.includes(q.id))
            .map((q) => ({
              ...q,
              selection_order: initialQuestionIds.indexOf(q.id),
            }));
          setSelectedQuestions(applyCanonicalOrder(selected));
        } catch {
          // ignore
        }
      }
      if (templateId) {
        try {
          const rules = await fetchTemplateRandomRules(templateId);
          setRandomRules(rules);
        } catch {
          // ignore
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAddQuestion(q: QuestionWithDetails) {
    if (selectedIds.has(q.id)) return;
    const newQ = {
      ...q,
      selection_order: selectedQuestions.length + randomRules.length,
    };
    setSelectedQuestions((prev) => applyCanonicalOrder([...prev, newQ]));
  }

  function handleRemoveQuestion(id: number) {
    setSelectedQuestions((prev) => {
      const filtered = prev.filter((q) => q.id !== id);
      return filtered.map((q, idx) => ({ ...q, selection_order: idx }));
    });
  }

  function handleAddRule(rule: RandomRuleRuleData) {
    const newRule: RandomQuestionRule = {
      id: Date.now(),
      template_id: templateId ?? 0,
      rule_order: selectedQuestions.length + randomRules.length,
      question_type_id: rule.question_type_id,
      response_type: rule.response_type,
      category: rule.category,
      tags: rule.tags,
      created_at: new Date().toISOString(),
    };
    setRandomRules((prev) => [...prev, newRule]);
  }

  function handleRemoveRule(id: number) {
    setRandomRules((prev) => prev.filter((r) => r.id !== id));
  }

  function handlePreview(q: Question) {
    setPreviewQuestion(q);
    setPreviewTypeName(
      questionTypes.find((qt) => qt.id === q.type_id)?.name ?? 'Unknown',
    );
  }

  function getTypeName(typeId: number): string {
    return questionTypes.find((qt) => qt.id === typeId)?.name ?? 'Unknown';
  }

  // Build combined display list (questions + rules) sorted by canonical order
  const combinedItems: TemplateItem[] = [
    ...selectedQuestions.map((q) => ({
      kind: 'question' as const,
      data: q,
    })),
    ...randomRules.map((r) => ({ kind: 'rule' as const, data: r })),
  ];

  // Sort: questions by canonical type rank, rules interleaved by their type rank
  combinedItems.sort((a, b) => {
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Preset name is required.');
      return;
    }
    if (selectedQuestions.length === 0 && randomRules.length === 0) {
      setError('Add at least one question or random rule.');
      return;
    }
    setError(null);
    const questionIds = selectedQuestions.map((q) => q.id);
    const rules: RandomRuleInput[] = randomRules.map((r) => ({
      question_type_id: r.question_type_id,
      response_type: r.response_type,
      category: r.category,
      tags: r.tags,
    }));
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || '',
        questionIds,
        randomRules: rules,
      });
    } catch (err) {
      if (err instanceof DuplicateTemplateError) {
        setDuplicateInfo(err.duplicate);
      } else {
        setError('Failed to save preset. Please try again.');
      }
    }
  }

  const hasActiveFilters =
    categoryFilter ||
    typeFilter ||
    responseTypeFilter ||
    tagFilter ||
    ownerFilter !== 'everyone' ||
    statusFilter !== 'active';

  function clearFilters() {
    setOwnerFilter('everyone');
    setCategoryFilter('');
    setTypeFilter('');
    setResponseTypeFilter('');
    setStatusFilter('active');
    setTagFilter('');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Template info */}
      <Input
        label="Preset Name"
        placeholder="e.g. IELTS Speaking Practice Set"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Description{' '}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="What is this preset for?"
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {/* Selected questions + random rules (canonical order) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Layers size={15} />
            Preset Contents ({selectedQuestions.length + randomRules.length})
          </label>
          <span className="text-xs text-slate-400">
            Auto-ordered by type
          </span>
        </div>

        {combinedItems.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center">
            <p className="text-sm text-slate-400">
              No questions or rules yet. Browse and add questions below, or
              insert a Random Question Rule.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {combinedItems.map((item, idx) => {
              if (item.kind === 'question') {
                const q = item.data;
                return (
                  <div
                    key={`q-${q.id}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical size={14} className="text-slate-300" />
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold text-blue-700">
                        {idx + 1}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 whitespace-pre-wrap text-sm font-medium text-slate-800">
                        {q.content}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {q.type_name}
                        </span>
                        {q.response_type === 'audio' ? (
                          <span className="flex items-center gap-0.5 text-xs text-slate-400">
                            <Mic size={10} /> Audio
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-xs text-slate-400">
                            <FileText size={10} /> Text
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handlePreview(q)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(q.id)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        title="Remove"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              } else {
                const r = item.data;
                const typeName = getTypeName(r.question_type_id);
                return (
                  <div
                    key={`r-${r.id}`}
                    className="flex items-center gap-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <Shuffle size={14} className="text-amber-500" />
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-xs font-semibold text-amber-700">
                        {idx + 1}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-amber-800">
                        Random {typeName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {r.response_type === 'audio' ? (
                          <span className="flex items-center gap-0.5 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            <Mic size={10} /> Audio
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            <FileText size={10} /> Text
                          </span>
                        )}
                        {r.category && (
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {r.category}
                          </span>
                        )}
                        {r.tags && r.tags.length > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-600">
                            <Tag size={10} />
                            {r.tags.join(', ')}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-amber-600">
                        Dynamic placeholder — question selected at draft creation
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(r.id)}
                      className="rounded-lg p-1.5 text-amber-400 transition hover:bg-red-50 hover:text-red-600"
                      title="Remove rule"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>

      {/* Question browser */}
      <div className="rounded-xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-medium text-slate-700">
            Browse Question Bank
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<Shuffle size={14} />}
            onClick={() => setShowRuleModal(true)}
          >
            Add Random Rule
          </Button>
        </div>

        {/* Browser filters */}
        <div className="space-y-3 border-b border-slate-100 px-4 py-3">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <Button
              type="button"
              variant={showFilters ? 'primary' : 'secondary'}
              icon={<Filter size={16} />}
              onClick={() => setShowFilters((v) => !v)}
            >
              Filters
            </Button>
          </div>

          {showFilters && (
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value ? parseInt(e.target.value) : '');
                  setCategoryFilter('');
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="">All types</option>
                {questionTypes.map((qt) => (
                  <option key={qt.id} value={qt.id}>
                    {qt.name}
                  </option>
                ))}
              </select>
              <select
                value={responseTypeFilter}
                onChange={(e) =>
                  setResponseTypeFilter(e.target.value as ResponseType | '')
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="">All responses</option>
                <option value="text">Text</option>
                <option value="audio">Audio</option>
              </select>
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="everyone">All owners</option>
                <option value="mine">Mine</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                disabled={!typeFilter}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">
                  {typeFilter ? 'All categories' : 'Select type first'}
                </option>
                {typeFilter && CATEGORY_OPTIONS[typeFilter] && (
                  <>
                    {CATEGORY_OPTIONS[typeFilter].map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    {availableCategories
                      .filter(
                        (c) =>
                          !CATEGORY_OPTIONS[typeFilter].includes(c),
                      )
                      .map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                  </>
                )}
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
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="">All tags</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as 'active' | 'archived' | 'all',
                  )
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </div>
          )}

          {showFilters && hasActiveFilters && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-700"
              >
                <X size={13} />
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Question list */}
        <div className="max-h-80 overflow-y-auto px-4 py-3">
          {loadingAvailable ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="md" />
            </div>
          ) : availableQuestions.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              No questions found.
            </div>
          ) : (
            <div className="space-y-2">
              {availableQuestions.map((q) => {
                const isSelected = selectedIds.has(q.id);
                return (
                  <div
                    key={q.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                      isSelected
                        ? 'border-blue-200 bg-blue-50/50'
                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 whitespace-pre-wrap text-sm text-slate-700">
                        {q.content}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {q.type_name}
                        </span>
                        {q.tags && q.tags.length > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-slate-400">
                            <Tag size={10} />
                            {q.tags.length}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handlePreview(q)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                      {!isSelected ? (
                        <button
                          type="button"
                          onClick={() => handleAddQuestion(q)}
                          className="rounded-lg p-1.5 text-blue-500 transition hover:bg-blue-50 hover:text-blue-700"
                          title="Add to preset"
                        >
                          <Plus size={14} />
                        </button>
                      ) : (
                        <span className="rounded-lg p-1.5 text-blue-500">
                          <Check size={14} />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          Save Preset
        </Button>
      </div>

      {/* Question preview modal */}
      <Modal
        isOpen={previewQuestion !== null}
        onClose={() => setPreviewQuestion(null)}
        title="Question Preview"
        size="lg"
      >
        {previewQuestion && (
          <QuestionPreview
            question={previewQuestion}
            typeName={previewTypeName}
          />
        )}
      </Modal>

      {/* Random rule modal */}
      <RandomRuleModal
        isOpen={showRuleModal}
        onClose={() => setShowRuleModal(false)}
        onAdd={handleAddRule}
        questionTypes={questionTypes}
      />

      {/* Duplicate template dialog */}
      <DuplicateTemplateDialog
        isOpen={duplicateInfo !== null}
        duplicate={duplicateInfo}
        onClose={() => setDuplicateInfo(null)}
        onReturnToEditing={() => setDuplicateInfo(null)}
      />
    </form>
  );
}

// ── Random Rule Modal ───────────────────────────────────────

interface RandomRuleRuleData {
  question_type_id: number;
  response_type: ResponseType;
  category: string | null;
  tags: string[] | null;
}

function RandomRuleModal({
  isOpen,
  onClose,
  onAdd,
  questionTypes,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (rule: RandomRuleRuleData) => void;
  questionTypes: QuestionType[];
}) {
  const [typeId, setTypeId] = useState<number | ''>('');
  const [responseType, setResponseType] = useState<ResponseType>('text');
  const [category, setCategory] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTypeId('');
      setResponseType('text');
      setCategory('');
      setTagsInput('');
      setError(null);
    }
  }, [isOpen]);

  const availableCategories = typeId
    ? CATEGORY_OPTIONS[typeId] ?? []
    : [];

  function handleAddRuleClick() {
    if (!typeId) {
      setError('Question type is required.');
      return;
    }
    if (!responseType) {
      setError('Response type is required.');
      return;
    }
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onAdd({
      question_type_id: typeId,
      response_type: responseType,
      category: category || null,
      tags: tags.length > 0 ? tags : null,
    });
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Random Question Rule"
      size="md"
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Question Type <span className="text-red-500">*</span>
          </label>
          <select
            value={typeId}
            onChange={(e) => {
              const v = e.target.value ? parseInt(e.target.value) : '';
              setTypeId(v);
              setCategory('');
              if (v) {
                setResponseType(DEFAULT_RESPONSE_TYPE[v] ?? 'text');
              }
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">Select a type...</option>
            {questionTypes.map((qt) => (
              <option key={qt.id} value={qt.id}>
                {qt.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Response Type <span className="text-red-500">*</span>
          </label>
          <select
            value={responseType}
            onChange={(e) => setResponseType(e.target.value as ResponseType)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="text">Text</option>
            <option value="audio">Audio</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Category{' '}
            <span className="font-normal text-slate-400">
              (optional — blank means no filter)
            </span>
          </label>
          {availableCategories.length > 0 ? (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="">Any category</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Any category (leave blank for no filter)"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            />
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Tags{' '}
            <span className="font-normal text-slate-400">
              (optional — comma-separated, blank means no filter)
            </span>
          </label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="e.g. ielts, practice"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
          <p className="text-xs text-amber-700">
            This rule stores only the criteria above — no question content.
            A matching question will be randomly selected when you create an
            Assignment Draft from this preset.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" icon={<Shuffle size={16} />} onClick={handleAddRuleClick}>
            Add Rule
          </Button>
        </div>
      </div>
    </Modal>
  );
}
