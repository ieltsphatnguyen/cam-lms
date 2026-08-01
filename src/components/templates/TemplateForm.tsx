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
  QUESTION_TYPE_IDS,
  canonicalTypeRank,
} from '@/lib/questions';
import {
  applyCanonicalOrder,
  DuplicateTemplateError,
} from '@/lib/templates';
import type {
  Question,
  QuestionType,
  QuestionWithDetails,
  ResponseType,
} from '@/types/database';

export interface TemplateFormData {
  name: string;
  description: string;
  questionIds: number[];
}

interface SelectedQuestion extends QuestionWithDetails {
  selection_order: number;
}

interface Props {
  initialName?: string;
  initialDescription?: string;
  initialQuestionIds?: number[];
  currentUserId: string;
  onSubmit: (data: TemplateFormData) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

export default function TemplateForm({
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
    SelectedQuestion[]
  >([]);
  const [loadingAvailable, setLoadingAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Question browser filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<number | ''>('');
  const [responseTypeFilter, setResponseTypeFilter] = useState<
    ResponseType | ''
  >('');

  // Preview modal
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [previewTypeName, setPreviewTypeName] = useState('');

  // Duplicate dialog
  const [duplicateInfo, setDuplicateInfo] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const selectedIds = new Set(selectedQuestions.map((q) => q.id));

  useEffect(() => {
    fetchQuestionTypes().then(setQuestionTypes).catch(() => {});
  }, []);

  const loadAvailable = useCallback(async () => {
    setLoadingAvailable(true);
    try {
      const data = await fetchQuestions(currentUserId, {
        ownerId: 'everyone',
        status: 'active',
        search: search || undefined,
        typeId: typeFilter || undefined,
        responseType: responseTypeFilter || undefined,
      });
      setAvailableQuestions(data);
    } catch {
      setAvailableQuestions([]);
    } finally {
      setLoadingAvailable(false);
    }
  }, [currentUserId, search, typeFilter, responseTypeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => loadAvailable(), 300);
    return () => clearTimeout(timer);
  }, [loadAvailable]);

  // Load initial selected questions
  useEffect(() => {
    if (initialQuestionIds.length > 0) {
      (async () => {
        try {
          const all = await fetchQuestions(currentUserId, {
            ownerId: 'everyone',
            status: 'all',
          });
          const selected = all
            .filter((q) => initialQuestionIds.includes(q.id))
            .map((q, idx) => ({
              ...q,
              selection_order: initialQuestionIds.indexOf(q.id) !== -1
                ? initialQuestionIds.indexOf(q.id)
                : idx,
            }));
          setSelectedQuestions(applyCanonicalOrder(selected));
        } catch {
          // ignore
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAddQuestion(q: QuestionWithDetails) {
    if (selectedIds.has(q.id)) return;
    const newQ: SelectedQuestion = {
      ...q,
      selection_order: selectedQuestions.length,
    };
    setSelectedQuestions((prev) => applyCanonicalOrder([...prev, newQ]));
  }

  function handleRemoveQuestion(id: number) {
    setSelectedQuestions((prev) => {
      const filtered = prev.filter((q) => q.id !== id);
      return filtered.map((q, idx) => ({ ...q, selection_order: idx }));
    });
  }

  function handlePreview(q: Question) {
    setPreviewQuestion(q);
    setPreviewTypeName(
      questionTypes.find((qt) => qt.id === q.type_id)?.name ?? 'Unknown',
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    if (selectedQuestions.length === 0) {
      setError('Select at least one question.');
      return;
    }
    setError(null);
    const questionIds = selectedQuestions.map((q) => q.id);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || '',
        questionIds,
      });
    } catch (err) {
      if (err instanceof DuplicateTemplateError) {
        setDuplicateInfo(err.duplicate);
      } else {
        setError('Failed to save template. Please try again.');
      }
    }
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
        label="Template Name"
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
          rows={2}
          placeholder="What is this template for?"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {/* Selected questions (canonical order) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Layers size={15} />
            Selected Questions ({selectedQuestions.length})
          </label>
          <span className="text-xs text-slate-400">
            Auto-ordered by type
          </span>
        </div>

        {selectedQuestions.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center">
            <p className="text-sm text-slate-400">
              No questions selected yet. Browse and add questions below.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedQuestions.map((q, idx) => (
              <div
                key={q.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <GripVertical size={14} className="text-slate-300" />
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold text-blue-700">
                    {idx + 1}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium text-slate-800">
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
            ))}
          </div>
        )}
      </div>

      {/* Question browser */}
      <div className="rounded-xl border border-slate-200">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-medium text-slate-700">
            Browse Question Bank
          </p>
        </div>

        {/* Browser filters */}
        <div className="space-y-3 border-b border-slate-100 px-4 py-3">
          <div className="relative">
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
          <div className="flex gap-3">
            <select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value ? parseInt(e.target.value) : '')
              }
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
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
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
            >
              <option value="">All responses</option>
              <option value="text">Text</option>
              <option value="audio">Audio</option>
            </select>
          </div>
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
                      <p className="line-clamp-2 text-sm text-slate-700">
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
                          title="Add to template"
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
          Save Template
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
