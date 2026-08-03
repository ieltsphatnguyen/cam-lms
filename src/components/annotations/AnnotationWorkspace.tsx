import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Mic,
  Play,
  StickyNote,
  Save,
  Loader2,
  Send,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  AlertTriangle,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import AnnotatableText, { type SelectionRange, criterionColor } from './AnnotatableText';
import FloatingToolbar, { type FormatToggle } from './FloatingToolbar';
import ExaminerNotesPanel from './ExaminerNotesPanel';
import CommentModal, { type CommentModalAnnotation } from './CommentModal';
import RichTextEditor from './RichTextEditor';
import {
  fetchRubricCriteria,
  fetchAnnotations,
  fetchTextFormats,
  createAnnotation,
  deleteAnnotation,
  moveAnnotation,
  saveTextComment,
  saveAudioComment,
  deleteComment,
  saveFeedback,
  saveTranscript,
  publishFeedback,
  saveTextFormat,
  updateTextFormat,
  deleteTextFormat,
} from '@/lib/annotations';
import { getAudioUrl } from '@/lib/grading';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import { reportRpcError } from '@/lib/rpc-errors';
import type {
  Annotation,
  RubricCriterion,
  TextFormat,
} from '@/types/database';
import type { GradingItemInfo, GradingAttemptInfo } from '@/lib/grading';

interface AnnotationWorkspaceProps {
  attempt: GradingAttemptInfo;
  item: GradingItemInfo;
  studentName: string;
  onPrevStudent?: () => void;
  onNextStudent?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export default function AnnotationWorkspace({
  attempt,
  item,
  studentName,
  onPrevStudent,
  onNextStudent,
  hasPrev,
  hasNext,
}: AnnotationWorkspaceProps) {
  const isAudio = item.response_type === 'audio';
  const isTask1 = item.type_id === QUESTION_TYPE_IDS.WRITING_TASK_1;
  const isTask2 = item.type_id === QUESTION_TYPE_IDS.WRITING_TASK_2;
  const isIELTSWriting = isTask1 || isTask2;

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [textFormats, setTextFormats] = useState<TextFormat[]>([]);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [commentModalAnnotation, setCommentModalAnnotation] = useState<CommentModalAnnotation | null>(null);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentModalMode, setCommentModalMode] = useState<'text' | 'audio'>('text');
  const [commentModalRect, setCommentModalRect] = useState<DOMRect | null>(null);

  const [feedback, setFeedback] = useState(attempt.feedback ?? '');
  const [transcript, setTranscript] = useState(attempt.transcript ?? '');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(
    (attempt as GradingAttemptInfo & { feedback_published?: boolean }).feedback_published ?? false,
  );
  const [publishToast, setPublishToast] = useState(false);

  // D1 two-phase speaking workflow
  const [transcriptPhase, setTranscriptPhase] = useState<'editing' | 'annotating'>('editing');
  const [showEditWarning, setShowEditWarning] = useState(false);
  const [clearingAnnotations, setClearingAnnotations] = useState(false);

  // Dirty state — any grading change marks the attempt dirty.
  // Students only receive updates after Publish Feedback.
  const [dirty, setDirty] = useState(false);

  // Active format state for the FloatingToolbar — reflects the format flags
  // of the annotation(s) overlapping the current selection.
  const [activeFormat, setActiveFormat] = useState<FormatToggle>({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
  });
  // Track which text_format record is active for the current selection
  const [activeFormatId, setActiveFormatId] = useState<number | null>(null);

  // ═══ Data loading ═════════════════════════════════════════════

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [critData, annData, tfData] = await Promise.all([
        fetchRubricCriteria(item.type_id),
        fetchAnnotations(attempt.id),
        fetchTextFormats(attempt.id),
      ]);
      setCriteria(critData);
      setAnnotations(annData);
      setTextFormats(tfData);
      if (isAudio && annData.length > 0) {
        setTranscriptPhase('annotating');
      }
    } catch (err) {
      const msg = reportRpcError('Grading: loadData', err);
      console.error('[Grading] Failed to load data:', msg);
    } finally {
      setLoading(false);
    }
  }, [attempt.id, item.type_id, isAudio]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isAudio && attempt.audio_path) {
      setAudioLoading(true);
      getAudioUrl(attempt.audio_path).then((url) => {
        if (!url) {
          console.error('[Grading] Failed to create signed URL for audio path:', attempt.audio_path);
        }
        setAudioUrl(url);
        setAudioLoading(false);
      });
    }
  }, [isAudio, attempt.audio_path]);

  // ═══ Annotation handlers ═════════════════════════════════════

  const markDirty = useCallback(() => setDirty(true), []);

  // ═══ Format handler — independent visual layer, never creates annotations ═══

  const handleFormat = useCallback(
    async (format: Partial<FormatToggle>) => {
      if (!selection) return;

      // Find text_format(s) that exactly match the current selection
      const exactMatch = textFormats.find(
        (f) => f.start_offset === selection.start && f.end_offset === selection.end,
      );

      const newFormat: FormatToggle = {
        bold: format.bold ?? exactMatch?.format_bold ?? false,
        italic: format.italic ?? exactMatch?.format_italic ?? false,
        underline: format.underline ?? exactMatch?.format_underline ?? false,
        strikethrough: format.strikethrough ?? exactMatch?.format_strikethrough ?? false,
      };

      try {
        if (exactMatch) {
          // Toggle: if all flags are now false, delete the format; otherwise update
          const allOff = !newFormat.bold && !newFormat.italic && !newFormat.underline && !newFormat.strikethrough;
          if (allOff) {
            await deleteTextFormat(exactMatch.id);
            setTextFormats((prev) => prev.filter((f) => f.id !== exactMatch.id));
          } else {
            await updateTextFormat(exactMatch.id, newFormat);
            setTextFormats((prev) =>
              prev.map((f) =>
                f.id === exactMatch.id
                  ? {
                      ...f,
                      format_bold: newFormat.bold,
                      format_italic: newFormat.italic,
                      format_underline: newFormat.underline,
                      format_strikethrough: newFormat.strikethrough,
                    }
                  : f,
              ),
            );
          }
        } else {
          // Create a new text_format for this selection
          const id = await saveTextFormat({
            attempt_id: attempt.id,
            start_offset: selection.start,
            end_offset: selection.end,
            format_bold: newFormat.bold,
            format_italic: newFormat.italic,
            format_underline: newFormat.underline,
            format_strikethrough: newFormat.strikethrough,
          });
          setTextFormats((prev) => [
            ...prev,
            {
              id,
              attempt_id: attempt.id,
              start_offset: selection.start,
              end_offset: selection.end,
              format_bold: newFormat.bold,
              format_italic: newFormat.italic,
              format_underline: newFormat.underline,
              format_strikethrough: newFormat.strikethrough,
            },
          ]);
        }
        setActiveFormat(newFormat);
        markDirty();
      } catch (err) {
        const msg = reportRpcError('save_text_format', err);
        alert(`Failed to update formatting:\n${msg}`);
      }
    },
    [selection, textFormats, attempt.id, markDirty],
  );

  // Update activeFormat when selection changes — reflect the format state of the selected text
  useEffect(() => {
    if (!selection) {
      setActiveFormat({ bold: false, italic: false, underline: false, strikethrough: false });
      setActiveFormatId(null);
      return;
    }
    // Check for an exact match first
    const exact = textFormats.find(
      (f) => f.start_offset === selection.start && f.end_offset === selection.end,
    );
    if (exact) {
      setActiveFormat({
        bold: exact.format_bold,
        italic: exact.format_italic,
        underline: exact.format_underline,
        strikethrough: exact.format_strikethrough,
      });
      setActiveFormatId(exact.id);
      return;
    }
    // Check for overlapping formats
    const overlapping = textFormats.filter(
      (f) => f.start_offset < selection.end && f.end_offset > selection.start,
    );
    if (overlapping.length > 0) {
      const f = overlapping[0];
      setActiveFormat({
        bold: f.format_bold,
        italic: f.format_italic,
        underline: f.format_underline,
        strikethrough: f.format_strikethrough,
      });
      setActiveFormatId(f.id);
    } else {
      setActiveFormat({ bold: false, italic: false, underline: false, strikethrough: false });
      setActiveFormatId(null);
    }
  }, [selection, textFormats]);

  const handleCreateAnnotation = useCallback(
    async (criterionId: number) => {
      if (!selection) return;
      const criterion = criteria.find((c) => c.id === criterionId);
      if (!criterion) return;
      const color = criterionColor(criterionId, criteria);
      try {
        const id = await createAnnotation({
          attempt_id: attempt.id,
          criterion_id: criterionId,
          criterion_name: criterion.name,
          start_offset: selection.start,
          end_offset: selection.end,
          selected_text: selection.text,
          highlight_color: color,
        });
        setAnnotations((prev) => [
          ...prev,
          {
            id,
            attempt_id: attempt.id,
            criterion_id: criterionId,
            criterion_name: criterion.name,
            start_offset: selection.start,
            end_offset: selection.end,
            selected_text: selection.text,
            highlight_color: color,
            has_text_comment: false,
            has_audio_comment: false,
            format_bold: false,
            format_italic: false,
            format_underline: false,
            format_strikethrough: false,
            text_color: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            comments: [],
          },
        ]);
        setSelection(null);
        window.getSelection()?.removeAllRanges();
        markDirty();
      } catch (err) {
        const msg = reportRpcError('save_annotation', err);
        alert(`Failed to create annotation:\n${msg}`);
      }
    },
    [selection, criteria, attempt.id, markDirty],
  );

  const handleDeleteAnnotation = useCallback(async (annotationId: number) => {
    try {
      await deleteAnnotation(annotationId);
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
      markDirty();
    } catch (err) {
      const msg = reportRpcError('delete_annotation', err);
      alert(`Failed to delete annotation:\n${msg}`);
    }
  }, [markDirty]);

  const handleMoveAnnotation = useCallback(
    async (annotationId: number, targetCriterionId: number | null) => {
      const target = criteria.find((c) => c.id === targetCriterionId);
      const newColor = target ? criterionColor(targetCriterionId!, criteria) : 'purple';
      const newName = target?.name ?? null;
      try {
        await moveAnnotation(annotationId, targetCriterionId, newColor);
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === annotationId
              ? { ...a, criterion_id: targetCriterionId, criterion_name: newName, highlight_color: newColor }
              : a,
          ),
        );
        markDirty();
      } catch (err) {
        const msg = reportRpcError('move_annotation', err);
        alert(`Failed to move annotation:\n${msg}`);
      }
    },
    [criteria, markDirty],
  );

  const handleAnnotationClick = useCallback((annotationId: number) => {
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann) return;
    setFlashId(annotationId);

    setCommentModalAnnotation({
      id: ann.id,
      selected_text: ann.selected_text,
      criterion_name: ann.criterion_name,
      comments: ann.comments,
    });
    setCommentModalMode('text');
    setCommentModalRect(null);
    setCommentModalOpen(true);
  }, [annotations]);

  // ═══ Comment handlers — create annotation with NULL criterion ═══

  const createAnnotationWithoutCriterion = useCallback(async (): Promise<number | null> => {
    if (!selection) return null;
    try {
      const id = await createAnnotation({
        attempt_id: attempt.id,
        criterion_id: null,
        criterion_name: null,
        start_offset: selection.start,
        end_offset: selection.end,
        selected_text: selection.text,
        highlight_color: 'purple',
      });
      setAnnotations((prev) => [
        ...prev,
        {
          id,
          attempt_id: attempt.id,
          criterion_id: null,
          criterion_name: null,
          start_offset: selection.start,
          end_offset: selection.end,
          selected_text: selection.text,
          highlight_color: 'purple',
          has_text_comment: false,
          has_audio_comment: false,
          format_bold: false,
          format_italic: false,
          format_underline: false,
          format_strikethrough: false,
          text_color: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          comments: [],
        },
      ]);
      markDirty();
      return id;
    } catch (err) {
      const msg = reportRpcError('save_annotation (for comment)', err);
      alert(`Failed to create annotation:\n${msg}`);
      return null;
    }
  }, [selection, attempt.id, markDirty]);

  const handleAddTextComment = useCallback(async () => {
    const id = await createAnnotationWithoutCriterion();
    if (id !== null) {
      const sel = window.getSelection();
      let rect: DOMRect | null = null;
      if (sel && !sel.isCollapsed) {
        rect = sel.getRangeAt(0).getBoundingClientRect();
      }
      setCommentModalAnnotation({
        id,
        selected_text: selection?.text ?? '',
        criterion_name: null,
        comments: [],
      });
      setCommentModalMode('text');
      setCommentModalRect(rect);
      setCommentModalOpen(true);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  }, [createAnnotationWithoutCriterion, selection]);

  const handleAddAudioComment = useCallback(async () => {
    const id = await createAnnotationWithoutCriterion();
    if (id !== null) {
      const sel = window.getSelection();
      let rect: DOMRect | null = null;
      if (sel && !sel.isCollapsed) {
        rect = sel.getRangeAt(0).getBoundingClientRect();
      }
      setCommentModalAnnotation({
        id,
        selected_text: selection?.text ?? '',
        criterion_name: null,
        comments: [],
      });
      setCommentModalMode('audio');
      setCommentModalRect(rect);
      setCommentModalOpen(true);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  }, [createAnnotationWithoutCriterion, selection]);

  const handleSaveTextComment = useCallback(
    async (annotationId: number, content: string, commentId?: number) => {
      try {
        const newCommentId = await saveTextComment(annotationId, content, commentId);
        setAnnotations((prev) =>
          prev.map((a) => {
            if (a.id !== annotationId) return a;
            if (commentId) {
              return {
                ...a,
                has_text_comment: true,
                comments: a.comments.map((c) => (c.id === commentId ? { ...c, content } : c)),
              };
            }
            return {
              ...a,
              has_text_comment: true,
              comments: [
                ...a.comments,
                {
                  id: newCommentId,
                  type: 'text' as const,
                  content,
                  audio_path: null,
                  created_at: new Date().toISOString(),
                },
              ],
            };
          }),
        );
        setCommentModalAnnotation((prev) => {
          if (!prev || prev.id !== annotationId) return prev;
          return {
            ...prev,
            comments: commentId
              ? prev.comments.map((c) => (c.id === commentId ? { ...c, content } : c))
              : [
                  ...prev.comments,
                  {
                    id: newCommentId,
                    type: 'text' as const,
                    content,
                    audio_path: null,
                    created_at: new Date().toISOString(),
                  },
                ],
          };
        });
        markDirty();
      } catch (err) {
        const msg = reportRpcError('save_annotation_comment', err);
        alert(`Failed to save comment:\n${msg}`);
      }
    },
    [markDirty],
  );

  const handleSaveAudioComment = useCallback(
    async (annotationId: number, audioPath: string) => {
      try {
        const newCommentId = await saveAudioComment(annotationId, audioPath);
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === annotationId
              ? {
                  ...a,
                  has_audio_comment: true,
                  comments: [
                    ...a.comments,
                    {
                      id: newCommentId,
                      type: 'audio' as const,
                      content: null,
                      audio_path: audioPath,
                      created_at: new Date().toISOString(),
                    },
                  ],
                }
              : a,
          ),
        );
        setCommentModalAnnotation((prev) => {
          if (!prev || prev.id !== annotationId) return prev;
          return {
            ...prev,
            comments: [
              ...prev.comments,
              {
                id: newCommentId,
                type: 'audio' as const,
                content: null,
                audio_path: audioPath,
                created_at: new Date().toISOString(),
              },
            ],
          };
        });
        markDirty();
      } catch (err) {
        const msg = reportRpcError('save_annotation_comment (audio)', err);
        alert(`Failed to save audio comment:\n${msg}`);
      }
    },
    [markDirty],
  );

  const handleDeleteComment = useCallback(
    async (commentId: number) => {
      try {
        await deleteComment(commentId);
        const updatedAnnotations = annotations.map((a) => {
          const comment = a.comments.find((c) => c.id === commentId);
          if (!comment) return a;
          const newComments = a.comments.filter((c) => c.id !== commentId);
          return {
            ...a,
            comments: newComments,
            has_text_comment: newComments.some((c) => c.type === 'text'),
            has_audio_comment: newComments.some((c) => c.type === 'audio'),
          };
        });

        // Auto-delete annotations that have no comments, no audio, and no criterion
        const toDelete = updatedAnnotations.filter(
          (a) =>
            a.comments.length === 0 &&
            !a.has_audio_comment &&
            !a.has_text_comment &&
            a.criterion_id === null,
        );

        // Delete empty annotations from server
        if (toDelete.length > 0) {
          await Promise.all(toDelete.map((a) => deleteAnnotation(a.id)));
        }

        const survivingIds = new Set(toDelete.map((a) => a.id));
        setAnnotations((prev) => prev.filter((a) => !survivingIds.has(a.id)));
        setCommentModalAnnotation((prev) =>
          prev ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) } : prev,
        );
        markDirty();
      } catch (err) {
        const msg = reportRpcError('delete_annotation_comment', err);
        alert(`Failed to delete comment:\n${msg}`);
      }
    },
    [annotations, markDirty],
  );

  // ═══ D1: Start Annotation / Edit Transcript ════════════════

  const handleStartAnnotation = useCallback(async () => {
    if (!transcript.trim()) return;
    try {
      await saveTranscript(attempt.id, transcript);
      setTranscriptPhase('annotating');
      markDirty();
    } catch (err) {
      const msg = reportRpcError('Start Annotation: save transcript', err);
      alert(`Failed to save transcript:\n${msg}`);
    }
  }, [attempt.id, transcript, markDirty]);

  const handleEditTranscript = useCallback(() => {
    if (annotations.length === 0) {
      setTranscriptPhase('editing');
      return;
    }
    setShowEditWarning(true);
  }, [annotations.length]);

  const handleConfirmEditTranscript = useCallback(async () => {
    setShowEditWarning(false);
    setClearingAnnotations(true);
    try {
      await Promise.all(annotations.map((a) => deleteAnnotation(a.id)));
      setAnnotations([]);
      setTranscriptPhase('editing');
      markDirty();
    } catch (err) {
      const msg = reportRpcError('Clear annotations for transcript edit', err);
      alert(`Failed to clear annotations:\n${msg}`);
    } finally {
      setClearingAnnotations(false);
    }
  }, [annotations, markDirty]);

  // ═══ Save Progress / Publish ═════════════════════════════════════

  const handleSaveProgress = useCallback(async () => {
    try {
      await saveFeedback(attempt.id, feedback);
      if (isAudio && transcript) {
        await saveTranscript(attempt.id, transcript);
      }
      setDirty(false);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 1500);
    } catch (err) {
      const msg = reportRpcError('Save Progress', err);
      alert(`Failed to save progress:\n${msg}`);
    }
  }, [attempt.id, feedback, transcript, isAudio]);

  const handlePublishFeedback = useCallback(async () => {
    if (published && !dirty) return;
    setPublishing(true);
    try {
      await saveFeedback(attempt.id, feedback);
      if (isAudio && transcript) {
        await saveTranscript(attempt.id, transcript);
      }
      await publishFeedback(attempt.id);
      setPublished(true);
      setDirty(false);
      setPublishToast(true);
      setTimeout(() => setPublishToast(false), 1000);
    } catch (err) {
      const msg = reportRpcError('Publish Feedback', err);
      alert(`Failed to publish feedback:\n${msg}`);
    } finally {
      setPublishing(false);
    }
  }, [attempt.id, feedback, transcript, isAudio, published, dirty]);

  // ═══ Render ══════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ═══ LEFT COLUMN (~35%) — Question + Audio ═══ */}
      <div className="flex w-[35%] flex-col overflow-hidden border-r border-slate-200 bg-white">
        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Published Question
          </h3>
          {isIELTSWriting ? (
            <div className="space-y-3">
              <h4 className="text-base font-bold text-slate-800">Task {isTask1 ? '1' : '2'}</h4>
              <p className="text-sm text-slate-600">
                You should spend about {isTask1 ? '20' : '40'} minutes on this task.
              </p>
              {isTask2 && <p className="text-sm text-slate-600">Write about the following topic:</p>}
              <p className="whitespace-pre-wrap text-sm font-medium text-slate-800">{item.content}</p>
              {item.image_url && (
                <img src={item.image_url} alt="Task illustration" className="w-full rounded-lg border border-slate-200" />
              )}
              {isTask1 && (
                <p className="text-sm text-slate-600">Summarize the main features and make comparisons where relevant.</p>
              )}
              {isTask2 && (
                <p className="text-sm text-slate-600">
                  Give reasons for your answer and include any relevant examples from your own knowledge or experience.
                </p>
              )}
              <p className="text-sm font-medium text-slate-700">Write at least {isTask1 ? '150' : '250'} words.</p>
            </div>
          ) : (
            <>
              {item.custom_instructions && (
                <div className="mb-4">
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Instructions</h4>
                  <p className="text-sm text-slate-600">{item.custom_instructions}</p>
                </div>
              )}
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {item.type_id === QUESTION_TYPE_IDS.SPEAKING_PART_2 ? 'Cue Card' : 'Prompt'}
                </h4>
                <p className="whitespace-pre-wrap text-sm font-slate-800">{item.content}</p>
              </div>
              {item.image_url && (
                <img src={item.image_url} alt="Task illustration" className="mt-4 w-full rounded-lg border border-slate-200" />
              )}
              {item.type_id === QUESTION_TYPE_IDS.SPEAKING_PART_2 && item.category_secondary && (
                <div className="mt-4">
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Part 3 Questions</h4>
                  <ul className="space-y-1.5 text-sm text-slate-600">
                    {item.category_secondary.split('\n').filter(Boolean).map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {isAudio && (
          <div className="sticky bottom-0 border-t border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Play size={14} className="text-slate-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Student Recording</span>
            </div>
            {audioUrl ? (
              <audio controls className="w-full">
                <source src={audioUrl} type="audio/webm" />
              </audio>
            ) : audioLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 size={14} className="animate-spin" />
                Loading recording…
              </div>
            ) : (
              <p className="text-xs text-slate-400">Audio unavailable.</p>
            )}
          </div>
        )}
      </div>

      {/* ═══ RIGHT COLUMN (~65%) — Student Text + Notes + Feedback ═══ */}
      <div className="flex w-[65%] flex-col overflow-y-auto bg-slate-50">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {isAudio ? 'Transcript' : 'Student Writing'}
          </span>
          {!isAudio && attempt.word_count !== null && (
            <span className="text-xs font-medium text-slate-500">{attempt.word_count} words</span>
          )}
        </div>

        <div className="p-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            {isAudio ? (
              transcriptPhase === 'editing' ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>Before starting annotation, please review and correct the transcript carefully. Once annotation begins, the transcript will be locked.</span>
                  </div>
                  <textarea
                    value={transcript}
                    onChange={(e) => {
                      setTranscript(e.target.value);
                      markDirty();
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = e.clipboardData.getData('text/plain');
                      document.execCommand('insertText', false, text);
                    }}
                    placeholder="Type or paste the transcript here…"
                    className="w-full resize-y rounded-lg border border-slate-200 p-3 text-sm leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-blue-100"
                    style={{ minHeight: '200px' }}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      icon={<Lock size={14} />}
                      onClick={handleStartAnnotation}
                      disabled={!transcript.trim()}
                    >
                      Start Annotation
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                      <Lock size={12} className="text-slate-400" />
                      Transcript locked for annotation
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Unlock size={14} />}
                      onClick={handleEditTranscript}
                      disabled={clearingAnnotations}
                    >
                      {clearingAnnotations ? 'Clearing…' : 'Edit Transcript'}
                    </Button>
                  </div>
                  <AnnotatableText
                    text={transcript}
                    annotations={annotations}
                    textFormats={textFormats}
                    criteria={criteria}
                    onSelection={setSelection}
                    onAnnotationClick={handleAnnotationClick}
                    flashAnnotationId={flashId}
                  />
                </div>
              )
            ) : (
              <>
                {attempt.written_response ? (
                  <AnnotatableText
                    text={attempt.written_response}
                    annotations={annotations}
                    textFormats={textFormats}
                    criteria={criteria}
                    onSelection={setSelection}
                    onAnnotationClick={handleAnnotationClick}
                    flashAnnotationId={flashId}
                  />
                ) : (
                  <p className="text-sm italic text-slate-400">No written response submitted.</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Teacher Notes */}
        <div className="border-t border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <StickyNote size={14} className="text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teacher Notes</span>
          </div>
          <ExaminerNotesPanel
            annotations={annotations}
            criteria={criteria}
            onDeleteAnnotation={handleDeleteAnnotation}
            onMoveAnnotation={handleMoveAnnotation}
            onAnnotationClick={handleAnnotationClick}
          />
        </div>

        {/* Feedback */}
        <div className="border-t border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Feedback</span>
            <div className="flex items-center gap-2">
              {savedToast && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <Loader2 size={10} className="animate-spin" /> Saved
                </span>
              )}
              {published && !dirty && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 size={12} /> Published
                </span>
              )}
              {dirty && (
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle size={12} /> Unsaved changes
                </span>
              )}
            </div>
          </div>
          <RichTextEditor
            value={feedback}
            onChange={(v) => {
              setFeedback(v);
              markDirty();
            }}
            placeholder="Write teacher feedback…"
            minHeight="100px"
          />
        </div>

        {/* Merged bottom toolbar: Prev Student | Save + Publish | Next Student */}
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            icon={<ChevronLeft size={16} />}
            onClick={onPrevStudent}
            disabled={!hasPrev}
          >
            Previous
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<Save size={14} />}
              onClick={handleSaveProgress}
              disabled={!dirty}
            >
              {isAudio ? 'Save Progress' : 'Save Draft'}
            </Button>
            <Button
              size="sm"
              icon={publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              onClick={handlePublishFeedback}
              disabled={publishing || (published && !dirty)}
            >
              {publishing ? 'Publishing…' : 'Publish Feedback'}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onNextStudent}
            disabled={!hasNext}
          >
            Next
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      {/* Floating Toolbar */}
      <FloatingToolbar
        selection={selection}
        criteria={criteria}
        onCreateAnnotation={handleCreateAnnotation}
        onAddTextComment={handleAddTextComment}
        onAddAudioComment={handleAddAudioComment}
        onFormat={handleFormat}
        activeFormat={activeFormat}
      />

      {/* Unified Floating Comment Modal — single comment editor for both new and existing annotations */}
      <CommentModal
        open={commentModalOpen}
        annotation={commentModalAnnotation}
        initialMode={commentModalMode}
        selectionRect={commentModalRect}
        onClose={() => setCommentModalOpen(false)}
        onSaveTextComment={handleSaveTextComment}
        onSaveAudioComment={handleSaveAudioComment}
        onDeleteComment={handleDeleteComment}
      />

      {/* Edit Transcript Warning Modal */}
      {showEditWarning && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
          <div className="mx-4 max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <h3 className="text-base font-semibold text-slate-800">Edit Transcript?</h3>
            </div>
            <p className="mb-5 text-sm text-slate-600">
              Editing the transcript will remove all {annotations.length} existing annotation{annotations.length !== 1 ? 's' : ''} because annotation positions depend on the transcript content. You will need to re-annotate after editing.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowEditWarning(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                icon={clearingAnnotations ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}
                onClick={handleConfirmEditTranscript}
                disabled={clearingAnnotations}
              >
                {clearingAnnotations ? 'Clearing…' : 'Yes, Clear Annotations'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Toast */}
      {publishToast && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-white shadow-2xl">
            <CheckCircle2 size={18} />
            <span className="text-sm font-semibold">Feedback Published</span>
          </div>
        </div>
      )}
    </div>
  );
}
