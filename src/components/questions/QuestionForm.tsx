import {
  useState,
  useRef,
  useEffect,
  useCallback,
  FormEvent,
} from 'react';
import {
  Upload,
  Loader2,
  AlertCircle,
  Search,
  X,
  Plus,
  Camera,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SmartTooltip from '@/components/ui/SmartTooltip';
import SimilarQuestionsDialog from '@/components/questions/SimilarQuestionsDialog';
import {
  QUESTION_TYPE_IDS,
  DEFAULT_RESPONSE_TYPE,
  IMAGE_CAPABLE_TYPES,
  CATEGORY_OPTIONS,
  DROPDOWN_CATEGORY_TYPES,
  FREE_TEXT_CATEGORY_TYPES,
  TWO_FIELD_CATEGORY_TYPES,
  searchSimilarQuestions,
  uploadQuestionImage,
  removeQuestionImage,
} from '@/lib/questions';
import type {
  Question,
  QuestionType,
  ResponseType,
  SimilarQuestion,
} from '@/types/database';

export interface QuestionFormData {
  content: string;
  type_id: number;
  description: string;
  ielts_band: string;
  category: string;
  category_secondary: string;
  tags: string[];
  response_type: ResponseType;
  image_url: string | null;
  custom_type_name: string;
  custom_instructions: string;
}

interface Props {
  questionTypes: QuestionType[];
  initialData?: Question | null;
  currentUserId: string;
  onSubmit: (data: QuestionFormData) => Promise<void>;
  onCancel: () => void;
  onDuplicate: (q: Question) => void;
  submitting: boolean;
}

function toFormState(q: Question | null | undefined): QuestionFormData {
  if (!q) {
    return {
      content: '',
      type_id: QUESTION_TYPE_IDS.WRITING_TASK_1,
      description: '',
      ielts_band: '',
      category: '',
      category_secondary: '',
      tags: [],
      response_type: DEFAULT_RESPONSE_TYPE[QUESTION_TYPE_IDS.WRITING_TASK_1],
      image_url: null,
      custom_type_name: '',
      custom_instructions: '',
    };
  }
  return {
    content: q.content,
    type_id: q.type_id,
    description: q.description ?? '',
    ielts_band: q.ielts_band ?? '',
    category: q.category ?? '',
    category_secondary: q.category_secondary ?? '',
    tags: q.tags ?? [],
    response_type: q.response_type,
    image_url: q.image_url,
    custom_type_name: q.custom_type_name ?? '',
    custom_instructions: q.custom_instructions ?? '',
  };
}

const PROMPT_TOOLTIP_CONTENT = (
  <>
    <p className="font-medium text-slate-700">What to type here</p>
    <p className="mt-1">
      Type only the <strong>question part</strong> — not the full IELTS
      instructions that repeat across every question of this type.
    </p>
    <p className="mt-1.5">
      For example, instead of pasting the entire Writing Task 2 block (timing
      instructions, "write about the following topic", word count), just type
      the topic itself:
    </p>
    <p className="mt-1.5 rounded-lg bg-slate-50 p-2 italic">
      "Some countries achieve international success by building specialized
      facilities to train top athletes instead of providing sports facilities
      that everyone can use. Is it a positive or negative development?"
    </p>
  </>
);

export default function QuestionForm({
  questionTypes,
  initialData,
  currentUserId,
  onSubmit,
  onCancel,
  onDuplicate,
  submitting,
}: Props) {
  const [form, setForm] = useState<QuestionFormData>(() => toFormState(initialData));
  const [tagInput, setTagInput] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Similar question detection state
  const [similarQuestions, setSimilarQuestions] = useState<SimilarQuestion[]>([]);
  const [showSimilarBanner, setShowSimilarBanner] = useState(false);
  const [showSimilarDialog, setShowSimilarDialog] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPromptRef = useRef<string>('');

  // Similar question detection — debounced on prompt change
  const checkSimilar = useCallback(
    (prompt: string) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(async () => {
        if (
          prompt.trim().length < 10 ||
          prompt.trim() === lastPromptRef.current.trim()
        ) {
          return;
        }
        lastPromptRef.current = prompt;
        setSimilarLoading(true);
        try {
          const results = await searchSimilarQuestions(prompt, initialData?.id);
          setSimilarQuestions(results);
          setShowSimilarBanner(results.length > 0);
        } catch {
          // Silently fail — similarity is non-blocking
        } finally {
          setSimilarLoading(false);
        }
      }, 800);
    },
    [initialData?.id],
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  function handleTypeChange(typeId: number) {
    const newResponseType =
      typeId === QUESTION_TYPE_IDS.EXTRA_HOMEWORK ||
      typeId === QUESTION_TYPE_IDS.CUSTOM
        ? form.response_type
        : DEFAULT_RESPONSE_TYPE[typeId];

    setForm((prev) => ({
      ...prev,
      type_id: typeId,
      response_type: newResponseType,
      category: '',
      category_secondary: '',
    }));
  }

  function handleAddTag() {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput('');
  }

  function handleRemoveTag(tag: string) {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2 MB.');
      return;
    }
    setUploadingImage(true);
    setError(null);
    try {
      if (form.image_url) {
        await removeQuestionImage(form.image_url);
      }
      const url = await uploadQuestionImage(file, currentUserId);
      setForm((prev) => ({ ...prev, image_url: url }));
    } catch {
      setError('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleRemoveImage() {
    if (form.image_url) {
      await removeQuestionImage(form.image_url);
    }
    setForm((prev) => ({ ...prev, image_url: null }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.content.trim()) {
      setError('Prompt is required.');
      return;
    }
    setError(null);
    await onSubmit({
      ...form,
      description: form.description.trim() || '',
      ielts_band: form.ielts_band.trim() || '',
      category: form.category.trim() || '',
      category_secondary: form.category_secondary.trim() || '',
      custom_type_name: form.custom_type_name.trim() || '',
      custom_instructions: form.custom_instructions.trim() || '',
    });
  }

  const isCustom = form.type_id === QUESTION_TYPE_IDS.CUSTOM;
  const isExtraHomework = form.type_id === QUESTION_TYPE_IDS.EXTRA_HOMEWORK;
  const canChooseResponseType = isCustom || isExtraHomework;
  const canHaveImage = IMAGE_CAPABLE_TYPES.has(form.type_id);

  // Category UI logic
  const isDropdownCategory = DROPDOWN_CATEGORY_TYPES.has(form.type_id);
  const isFreeTextCategory = FREE_TEXT_CATEGORY_TYPES.has(form.type_id);
  const isTwoFieldCategory = TWO_FIELD_CATEGORY_TYPES.has(form.type_id);
  const dropdownOptions = CATEGORY_OPTIONS[form.type_id] ?? [];
  const isOthersSelected = isDropdownCategory && form.category === 'Others';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Similar question notification banner */}
      {showSimilarBanner && similarQuestions.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <Search size={16} className="shrink-0 text-blue-600" />
          <p className="flex-1 text-sm text-blue-700">
            We found {similarQuestions.length} similar question
            {similarQuestions.length !== 1 ? 's' : ''}.
          </p>
          <button
            type="button"
            onClick={() => setShowSimilarDialog(true)}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
          >
            View Similar Questions
          </button>
          <button
            type="button"
            onClick={() => setShowSimilarBanner(false)}
            className="shrink-0 text-blue-400 transition hover:text-blue-600"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* 1. Question Type */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Question Type
        </label>
        <div className="flex flex-wrap gap-2">
          {questionTypes.map((qt) => {
            const isActive = form.type_id === qt.id;
            return (
              <button
                key={qt.id}
                type="button"
                onClick={() => handleTypeChange(qt.id)}
                className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {qt.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Response Type */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Response Type
        </label>
        <div className="flex gap-2">
          {(['text', 'audio'] as ResponseType[]).map((rt) => {
            const isActive = form.response_type === rt;
            const isDisabled = !canChooseResponseType;
            return (
              <button
                key={rt}
                type="button"
                disabled={isDisabled}
                onClick={() => setForm({ ...form, response_type: rt })}
                className={`rounded-xl border px-4 py-2 text-sm font-medium capitalize transition ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                } ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                {rt}
              </button>
            );
          })}
        </div>
        {!canChooseResponseType && (
          <p className="mt-1 text-xs text-slate-400">
            Response type is preset for this question type.
          </p>
        )}
      </div>

      {/* Custom type fields */}
      {isCustom && (
        <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <Input
            label="Custom Question Type Name"
            placeholder="e.g. Debate Discussion"
            value={form.custom_type_name}
            onChange={(e) =>
              setForm({ ...form, custom_type_name: e.target.value })
            }
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Instructions
            </label>
            <textarea
              value={form.custom_instructions}
              onChange={(e) =>
                setForm({ ...form, custom_instructions: e.target.value })
              }
              rows={3}
              placeholder="Instructions students will see..."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        </div>
      )}

      {/* 3. Prompt with smart tooltip */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5">
          <label className="text-sm font-medium text-slate-700">Prompt</label>
          <SmartTooltip content={PROMPT_TOOLTIP_CONTENT} />
        </div>
        <textarea
          ref={promptTextareaRef}
          value={form.content}
          onChange={(e) => {
            setForm({ ...form, content: e.target.value });
            checkSimilar(e.target.value);
          }}
          rows={5}
          placeholder="Write the question prompt students will see..."
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          required
        />
        {similarLoading && (
          <p className="mt-1 text-xs text-slate-400">
            Checking for similar questions...
          </p>
        )}
      </div>

      {/* 4. Description */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Description{' '}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          placeholder="Additional context or instructions..."
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {/* 5. Image (Writing Task 1 / Speaking Part 2 / Custom only) */}
      {canHaveImage && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Image{' '}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          {form.image_url ? (
            <div className="flex items-start gap-4">
              <div className="relative">
                <img
                  src={form.image_url}
                  alt="Question"
                  className="h-32 w-32 rounded-xl border border-slate-200 object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition hover:bg-red-700"
                  title="Remove image"
                >
                  <X size={12} />
                </button>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<Upload size={13} />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                Replace
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              className="flex h-32 w-full items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-slate-400 hover:text-slate-500 disabled:opacity-50"
            >
              {uploadingImage ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <span className="flex items-center gap-2 text-sm">
                  <Camera size={18} />
                  Upload image
                </span>
              )}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      )}

      {/* 6. Level */}
      <Input
        label="Level (optional)"
        placeholder="e.g. A2, B1, B2, C1, C2"
        value={form.ielts_band}
        onChange={(e) => setForm({ ...form, ielts_band: e.target.value })}
      />

      {/* 7. Category — per-type UI */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Category
        </label>

        {/* Dropdown with Others */}
        {isDropdownCategory && (
          <div className="space-y-3">
            <select
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value, category_secondary: '' })
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="">Select a category...</option>
              {dropdownOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {isOthersSelected && (
              <Input
                placeholder="Specify category"
                value={form.category_secondary}
                onChange={(e) =>
                  setForm({ ...form, category_secondary: e.target.value })
                }
              />
            )}
          </div>
        )}

        {/* Two free-text fields (Speaking Part 1) */}
        {isTwoFieldCategory && (
          <div className="space-y-3">
            <Input
              label="Topic 1"
              placeholder="e.g. Hometown"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <Input
              label="Topic 2"
              placeholder="e.g. Daily Routine"
              value={form.category_secondary}
              onChange={(e) =>
                setForm({ ...form, category_secondary: e.target.value })
              }
            />
          </div>
        )}

        {/* Single free-text (Extra Homework / Custom) */}
        {isFreeTextCategory && (
          <Input
            placeholder="Enter category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
        )}
      </div>

      {/* 8. Tags */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Tags
        </label>
        <div className="flex flex-wrap gap-2">
          {form.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="text-slate-400 transition hover:text-slate-600"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTag();
              }
            }}
            placeholder="Add a tag and press Enter"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<Plus size={14} />}
            onClick={handleAddTag}
          >
            Add
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {initialData ? 'Save changes' : 'Create question'}
        </Button>
      </div>

      {/* Similar Questions Dialog — never clears draft */}
      <SimilarQuestionsDialog
        isOpen={showSimilarDialog}
        onClose={() => setShowSimilarDialog(false)}
        similarQuestions={similarQuestions}
        currentUserId={currentUserId}
        onDuplicate={(q) => {
          onDuplicate(q);
        }}
      />
    </form>
  );
}
