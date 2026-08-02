import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Star,
  FileText,
  Layers,
  X,
  Tag,
  Shuffle,
  Image as ImageIcon,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  fetchTemplates,
  fetchTemplateQuestions,
  fetchTemplateRandomRules,
  fetchFavoriteTemplateIds,
  toggleTemplateFavorite,
} from '@/lib/templates';
import { fetchQuestionTypes, fetchTagsForType } from '@/lib/questions';
import type {
  AssignmentTemplateWithDetails,
  QuestionWithDetails,
  QuestionType,
  RandomQuestionRule,
} from '@/types/database';

interface PresetBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  selectedPresetId: number | null;
  onSelectPreset: (preset: AssignmentTemplateWithDetails) => void;
}

export default function PresetBrowserModal({
  isOpen,
  onClose,
  currentUserId,
  selectedPresetId,
  onSelectPreset,
}: PresetBrowserModalProps) {
  const [presets, setPresets] = useState<AssignmentTemplateWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<'everyone' | 'mine'>('everyone');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState('');
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [typeFilter, setTypeFilter] = useState<number | ''>('');

  // Preview state
  const [previewPreset, setPreviewPreset] = useState<AssignmentTemplateWithDetails | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<QuestionWithDetails[]>([]);
  const [previewRules, setPreviewRules] = useState<RandomQuestionRule[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Template type/tag maps
  const [templateTypeMap, setTemplateTypeMap] = useState<Record<number, Set<number>>>({});
  const [templateTagMap, setTemplateTagMap] = useState<Record<number, Set<string>>>({});

  const loadPresets = useCallback(async () => {
    setLoading(true);
    try {
      const [data, favs] = await Promise.all([
        fetchTemplates(currentUserId, {
          ownerId: ownerFilter,
          status: 'active',
          search: search || undefined,
        }),
        fetchFavoriteTemplateIds(currentUserId),
      ]);
      setPresets(data);
      setFavorites(favs);

      const typeMap: Record<number, Set<number>> = {};
      const tagMap: Record<number, Set<string>> = {};
      await Promise.all(
        data.map(async (t) => {
          const qs = await fetchTemplateQuestions(t.id);
          typeMap[t.id] = new Set(qs.map((q) => q.type_id as number));
          tagMap[t.id] = new Set(qs.flatMap((q) => (q.tags as string[] | null) ?? []));
        }),
      );
      setTemplateTypeMap(typeMap);
      setTemplateTagMap(tagMap);
    } catch {
      setPresets([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, ownerFilter, search]);

  useEffect(() => {
    if (isOpen) loadPresets();
  }, [loadPresets, isOpen]);

  // Question types are static — load once on mount.
  useEffect(() => {
    fetchQuestionTypes().then(setQuestionTypes).catch(() => {});
  }, []);

  // Tags cascade from the selected Question Type only.
  useEffect(() => {
    fetchTagsForType(typeFilter || undefined)
      .then(setAllTags)
      .catch(() => setAllTags([]));
  }, [typeFilter]);

  // Reset the tag filter if the selected tag is no longer available
  // after the question type changes.
  useEffect(() => {
    if (tagFilter && !allTags.includes(tagFilter)) {
      setTagFilter('');
    }
  }, [allTags, tagFilter]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => loadPresets(), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filteredPresets = useMemo(() => {
    return presets.filter((p) => {
      if (showFavoritesOnly && !favorites.has(p.id)) return false;
      if (typeFilter && !templateTypeMap[p.id]?.has(typeFilter)) return false;
      if (tagFilter && !templateTagMap[p.id]?.has(tagFilter)) return false;
      return true;
    });
  }, [presets, showFavoritesOnly, favorites, typeFilter, tagFilter, templateTypeMap, templateTagMap]);

  async function handlePreview(preset: AssignmentTemplateWithDetails) {
    setPreviewPreset(preset);
    setLoadingPreview(true);
    try {
      const [qs, rules] = await Promise.all([
        fetchTemplateQuestions(preset.id),
        fetchTemplateRandomRules(preset.id),
      ]);
      setPreviewQuestions(qs);
      setPreviewRules(rules);
    } catch {
      setPreviewQuestions([]);
      setPreviewRules([]);
    } finally {
      setLoadingPreview(false);
    }
  }

  // Auto-preview first preset when list loads
  useEffect(() => {
    if (isOpen && filteredPresets.length > 0 && !previewPreset) {
      handlePreview(filteredPresets[0]);
    }
    if (isOpen && filteredPresets.length === 0) {
      setPreviewPreset(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, filteredPresets.length]);

  async function handleToggleFavorite(presetId: number) {
    try {
      const isNowFav = await toggleTemplateFavorite(presetId, currentUserId);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (isNowFav) next.add(presetId);
        else next.delete(presetId);
        return next;
      });
    } catch {
      // silent
    }
  }

  function handleUsePreset() {
    if (previewPreset) {
      onSelectPreset(previewPreset);
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-[5vh] p-[5vw]"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-[90vw] overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Left: Filters ── */}
        <div className="flex w-56 shrink-0 flex-col border-r border-slate-100 bg-slate-50">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Filters
            </h3>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {/* Search */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-800 outline-none focus:border-blue-400"
                />
              </div>
            </div>

            {/* Owner */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Owner</label>
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value as 'everyone' | 'mine')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="everyone">Everyone</option>
                <option value="mine">Mine</option>
              </select>
            </div>

            {/* Favorites */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Favorites</label>
              <button
                onClick={() => setShowFavoritesOnly((v) => !v)}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  showFavoritesOnly
                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Star size={14} fill={showFavoritesOnly ? 'currentColor' : 'none'} />
                {showFavoritesOnly ? 'Favorites only' : 'Show favorites'}
              </button>
            </div>

            {/* Question Type */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Question Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value ? parseInt(e.target.value) : '')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="">All types</option>
                {questionTypes.map((qt) => (
                  <option key={qt.id} value={qt.id}>{qt.name}</option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Tags</label>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
              >
                <option value="">All tags</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Middle: Preset List ── */}
        <div className="flex w-80 shrink-0 flex-col border-r border-slate-100">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Presets {filteredPresets.length > 0 && `(${filteredPresets.length})`}
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="md" />
              </div>
            ) : filteredPresets.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
                <FileText size={28} className="text-slate-300" />
                <p className="mt-2 text-xs font-medium text-slate-500">No presets found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPresets.map((p) => {
                  const isSelected = selectedPresetId === p.id;
                  const isPreviewing = previewPreset?.id === p.id;
                  const isFav = favorites.has(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => handlePreview(p)}
                      className={`cursor-pointer rounded-xl border p-3 transition ${
                        isPreviewing
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(p.id);
                          }}
                          className="mt-0.5 shrink-0 text-slate-300 transition hover:text-amber-500"
                          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star size={15} fill={isFav ? '#f59e0b' : 'none'} color={isFav ? '#f59e0b' : 'currentColor'} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-medium ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                            {p.name}
                            {isSelected && <span className="ml-1 text-xs text-blue-500">(selected)</span>}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                            <span className="flex items-center gap-0.5">
                              <Layers size={10} />
                              {p.question_count} Q
                            </span>
                            <span className="truncate">{p.owner_display_name}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Preview ── */}
        <div className="flex flex-1 flex-col">
          {previewPreset ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-800">{previewPreset.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {previewPreset.question_count} questions · by {previewPreset.owner_display_name}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {previewPreset.description && (
                  <p className="mb-4 whitespace-pre-wrap text-sm text-slate-600">{previewPreset.description}</p>
                )}
                {loadingPreview ? (
                  <div className="flex items-center justify-center py-12">
                    <LoadingSpinner size="md" />
                  </div>
                ) : previewQuestions.length === 0 && previewRules.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No questions in this preset</p>
                ) : (
                  <div className="space-y-4">
                    {/* Random Rules */}
                    {previewRules.length > 0 && (
                      <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <Shuffle size={14} className="text-purple-600" />
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                            Random Rules
                          </h4>
                        </div>
                        <div className="space-y-2">
                          {previewRules.map((rule, idx) => (
                            <div key={rule.id} className="rounded-lg bg-white p-3 text-xs text-slate-600">
                              <span className="font-medium text-slate-700">Rule {idx + 1}:</span>{' '}
                              {questionTypes.find((qt) => qt.id === rule.question_type_id)?.name ?? 'Unknown'}
                              {rule.category && ` · ${rule.category}`}
                              {rule.tags && rule.tags.length > 0 && (
                                <span className="ml-2 flex flex-wrap gap-1">
                                  {rule.tags.map((t, i) => (
                                    <span key={i} className="flex items-center gap-0.5 rounded bg-purple-100 px-1.5 py-0.5 text-purple-600">
                                      <Tag size={9} />{t}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Questions */}
                    {previewQuestions.map((q, idx) => (
                      <div key={q.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                            {idx + 1}
                          </span>
                          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            {q.type_name ?? 'Unknown'}
                          </span>
                          {q.image_url && (
                            <span className="flex items-center gap-0.5 text-xs text-slate-400">
                              <ImageIcon size={11} /> image
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-slate-700">{q.content}</p>
                        {q.image_url && (
                          <img
                            src={q.image_url}
                            alt="Question image"
                            className="mt-3 max-h-48 rounded-lg border border-slate-200 object-contain"
                          />
                        )}
                        {q.tags && q.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {q.tags.map((t, i) => (
                              <span key={i} className="flex items-center gap-0.5 rounded-md bg-white px-1.5 py-0.5 text-xs text-slate-400">
                                <Tag size={9} />{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <FileText size={40} className="text-slate-200" />
              <p className="mt-3 text-sm text-slate-400">Select a preset to preview</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleUsePreset} disabled={!previewPreset}>
              Use Preset
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Compact summary for the assignment editor ──

interface PresetSummaryProps {
  preset: AssignmentTemplateWithDetails | null;
  onBrowse: () => void;
  onClear: () => void;
}

export function PresetSummary({ preset, onBrowse, onClear }: PresetSummaryProps) {
  if (!preset) {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Assignment Preset <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <p className="mb-2 text-xs text-slate-400">No preset selected</p>
        <Button size="sm" variant="secondary" onClick={onBrowse}>
          Browse Presets...
        </Button>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        Assignment Preset
      </label>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-medium text-slate-800">{preset.name}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {preset.question_count} question{preset.question_count !== 1 ? 's' : ''}
          {preset.description && ` · ${preset.description.slice(0, 60)}${preset.description.length > 60 ? '...' : ''}`}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">by {preset.owner_display_name}</p>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onBrowse}>
          Change Preset
        </Button>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-slate-500 transition hover:text-slate-700"
        >
          <X size={12} />
          Clear
        </button>
      </div>
    </div>
  );
}
