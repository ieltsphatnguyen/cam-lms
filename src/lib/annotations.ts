import { supabase } from '@/lib/supabase';
import type {
  RubricCriterion,
  Annotation,
  AnnotationComment,
  HighlightColor,
  TextFormat,
  CriterionScore,
  PublishedScoreSnapshot,
  AssignmentStatus,
  AssignmentStatusResult,
} from '@/types/database';

// ── Rubric Criteria ────────────────────────────────────────

export async function fetchRubricCriteria(
  questionTypeId: number,
): Promise<RubricCriterion[]> {
  const { data, error } = await supabase.rpc('get_rubric_criteria', {
    p_question_type_id: questionTypeId,
  });
  if (error) throw error;
  return (data ?? []) as RubricCriterion[];
}

// ── Annotations ─────────────────────────────────────────────

export async function fetchAnnotations(
  attemptId: number,
): Promise<Annotation[]> {
  const { data, error } = await supabase.rpc('get_attempt_annotations', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as Annotation[];
}

export async function fetchPublishedAnnotations(
  attemptId: number,
): Promise<Annotation[]> {
  const { data, error } = await supabase.rpc('get_published_annotations', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as Annotation[];
}

export async function createAnnotation(params: {
  attempt_id: number;
  criterion_id: number | null;
  criterion_name: string | null;
  start_offset: number;
  end_offset: number;
  selected_text: string;
  highlight_color: HighlightColor;
  format_bold?: boolean;
  format_italic?: boolean;
  format_underline?: boolean;
  format_strikethrough?: boolean;
  text_color?: string | null;
}): Promise<number> {
  const { data, error } = await supabase.rpc('save_annotation', {
    p_mode: 'create',
    p_attempt_id: params.attempt_id,
    p_criterion_id: params.criterion_id,
    p_criterion_name: params.criterion_name,
    p_start_offset: params.start_offset,
    p_end_offset: params.end_offset,
    p_selected_text: params.selected_text,
    p_highlight_color: params.highlight_color,
    p_format_bold: params.format_bold ?? false,
    p_format_italic: params.format_italic ?? false,
    p_format_underline: params.format_underline ?? false,
    p_format_strikethrough: params.format_strikethrough ?? false,
    p_text_color: params.text_color ?? null,
  });
  if (error) throw error;
  return data as number;
}

export async function updateAnnotation(
  annotationId: number,
  params: {
    criterion_id: number;
    criterion_name: string;
    start_offset: number;
    end_offset: number;
    selected_text: string;
    highlight_color: HighlightColor;
  },
): Promise<number> {
  const { data, error } = await supabase.rpc('save_annotation', {
    p_mode: 'update',
    p_annotation_id: annotationId,
    p_criterion_id: params.criterion_id,
    p_criterion_name: params.criterion_name,
    p_start_offset: params.start_offset,
    p_end_offset: params.end_offset,
    p_selected_text: params.selected_text,
    p_highlight_color: params.highlight_color,
  });
  if (error) throw error;
  return data as number;
}

export async function deleteAnnotation(annotationId: number): Promise<void> {
  const { error } = await supabase.rpc('delete_annotation', {
    p_annotation_id: annotationId,
  });
  if (error) throw error;
}

export async function moveAnnotation(
  annotationId: number,
  criterionId: number | null,
  highlightColor: HighlightColor,
): Promise<void> {
  const { error } = await supabase.rpc('move_annotation', {
    p_annotation_id: annotationId,
    p_criterion_id: criterionId,
    p_highlight_color: highlightColor,
  });
  if (error) throw error;
}

// ── Text Formats (independent visual formatting layer) ─────

export async function fetchTextFormats(attemptId: number): Promise<TextFormat[]> {
  const { data, error } = await supabase.rpc('get_text_formats', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as TextFormat[];
}

export async function fetchPublishedTextFormats(attemptId: number): Promise<TextFormat[]> {
  const { data, error } = await supabase.rpc('get_published_text_formats', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as TextFormat[];
}

export async function saveTextFormat(params: {
  attempt_id: number;
  start_offset: number;
  end_offset: number;
  format_bold: boolean;
  format_italic: boolean;
  format_underline: boolean;
  format_strikethrough: boolean;
}): Promise<number> {
  const { data, error } = await supabase.rpc('save_text_format', {
    p_id: null,
    p_attempt_id: params.attempt_id,
    p_start_offset: params.start_offset,
    p_end_offset: params.end_offset,
    p_format_bold: params.format_bold,
    p_format_italic: params.format_italic,
    p_format_underline: params.format_underline,
    p_format_strikethrough: params.format_strikethrough,
  });
  if (error) throw error;
  return data as number;
}

export async function updateTextFormat(
  formatId: number,
  format: {
    format_bold: boolean;
    format_italic: boolean;
    format_underline: boolean;
    format_strikethrough: boolean;
  },
): Promise<void> {
  const { error } = await supabase.rpc('save_text_format', {
    p_id: formatId,
    p_attempt_id: null,
    p_start_offset: null,
    p_end_offset: null,
    p_format_bold: format.format_bold,
    p_format_italic: format.format_italic,
    p_format_underline: format.format_underline,
    p_format_strikethrough: format.format_strikethrough,
  });
  if (error) throw error;
}

export async function deleteTextFormat(formatId: number): Promise<void> {
  const { error } = await supabase.rpc('delete_text_format', {
    p_id: formatId,
  });
  if (error) throw error;
}

// ── Annotation Comments ─────────────────────────────────────

export async function saveTextComment(
  annotationId: number,
  content: string,
  commentId?: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('save_annotation_comment', {
    p_annotation_id: annotationId,
    p_type: 'text',
    p_content: content,
    p_comment_id: commentId ?? null,
  });
  if (error) throw error;
  return data as number;
}

export async function saveAudioComment(
  annotationId: number,
  audioPath: string,
  commentId?: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('save_annotation_comment', {
    p_annotation_id: annotationId,
    p_type: 'audio',
    p_audio_path: audioPath,
    p_comment_id: commentId ?? null,
  });
  if (error) throw error;
  return data as number;
}

export async function deleteComment(commentId: number): Promise<void> {
  const { error } = await supabase.rpc('delete_annotation_comment', {
    p_comment_id: commentId,
  });
  if (error) throw error;
}

// ── Audio Upload ────────────────────────────────────────────

export async function uploadAudioComment(
  annotationId: number,
  blob: Blob,
): Promise<string> {
  const fileName = `annotation-${annotationId}-${Date.now()}.webm`;
  const path = `${fileName}`;
  const { error } = await supabase.storage
    .from('annotation-audio')
    .upload(path, blob, { contentType: 'audio/webm' });
  if (error) throw error;
  return path;
}

export async function getAudioCommentUrl(
  audioPath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('annotation-audio')
    .createSignedUrl(audioPath, 3600);
  if (error) {
    console.error('[annotations] createSignedUrl error:', error.message, 'path:', audioPath);
    return null;
  }
  return data?.signedUrl ?? null;
}

// ── Feedback & Transcript ───────────────────────────────────

export async function saveFeedback(
  attemptId: number,
  feedback: string,
): Promise<void> {
  const { error } = await supabase.rpc('save_feedback', {
    p_attempt_id: attemptId,
    p_feedback: feedback,
  });
  if (error) throw error;
}

export async function saveTranscript(
  attemptId: number,
  transcript: string,
): Promise<void> {
  const { error } = await supabase.rpc('save_transcript', {
    p_attempt_id: attemptId,
    p_transcript: transcript,
  });
  if (error) throw error;
}

export async function publishFeedback(attemptId: number): Promise<void> {
  const { error } = await supabase.rpc('publish_feedback', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
}

export async function unpublishFeedback(attemptId: number): Promise<void> {
  const { error } = await supabase.rpc('unpublish_feedback', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
}

// ── Student Feedback Retrieval ──────────────────────────────

export interface StudentFeedback {
  feedback: string | null;
  transcript: string | null;
  feedback_published: boolean;
}

export async function fetchStudentFeedback(
  attemptId: number,
): Promise<StudentFeedback | null> {
  const { data, error } = await supabase.rpc('get_student_feedback', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row as StudentFeedback;
}

// ── Criterion Scores (teacher) ──────────────────────────────

export async function fetchCriterionScores(
  attemptId: number,
): Promise<CriterionScore[]> {
  const { data, error } = await supabase.rpc('get_criterion_scores', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as CriterionScore[];
}

export async function saveCriterionScore(
  attemptId: number,
  criterionId: number,
  score: number | null,
): Promise<void> {
  const { error } = await supabase.rpc('save_criterion_score', {
    p_attempt_id: attemptId,
    p_criterion_id: criterionId,
    p_score: score,
  });
  if (error) throw error;
}

export async function fetchPublishedScores(
  attemptId: number,
): Promise<PublishedScoreSnapshot[]> {
  const { data, error } = await supabase.rpc('get_published_scores', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as PublishedScoreSnapshot[];
}

export async function requestRevision(
  attemptId: number,
  notes?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('request_revision', {
    p_attempt_id: attemptId,
    p_notes: notes ?? null,
  });
  if (error) throw error;
}

// ── Overall Band Calculation ────────────────────────────────
// Project rounding: .00→.0, .25→.0, .50→.5, .75→.5
// (truncate, not IELTS round-up)

export function computeOverallBand(scores: (number | null)[]): number | null {
  const valid = scores.filter((s): s is number => s !== null && !isNaN(s));
  if (valid.length < 4) return null;
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  const floor = Math.floor(avg);
  const remainder = avg - floor;
  if (remainder < 0.25) return floor;
  if (remainder < 0.75) return floor + 0.5;
  return floor + 1.0;
}

// ── Assignment Status ───────────────────────────────────────

export async function fetchAssignmentStatus(
  publishedAssignmentId: number,
  studentProfileId: string,
): Promise<AssignmentStatusResult[]> {
  const { data, error } = await supabase.rpc('get_assignment_status', {
    p_published_assignment_id: publishedAssignmentId,
    p_student_profile_id: studentProfileId,
  });
  if (error) throw error;
  return (data ?? []) as AssignmentStatusResult[];
}

export function computeAssignmentStatus(
  items: AssignmentStatusResult[],
): AssignmentStatus {
  if (items.length === 0) return 'not_started';

  const allGraded = items.every((i) => i.is_graded);
  if (allGraded) return 'graded';

  const allSubmitted = items.every((i) => i.is_submitted);
  if (allSubmitted) return 'waiting_for_grading';

  const anyRunning = items.some(
    (i) => i.attempt_status === 'in_progress',
  );
  const anySubmitted = items.some((i) => i.is_submitted);

  if (anyRunning || anySubmitted) return 'in_progress';

  return 'not_started';
}

export const ASSIGNMENT_STATUS_CONFIG: Record<
  AssignmentStatus,
  { label: string; dotClass: string; badgeClass: string; icon: string }
> = {
  not_started: {
    label: 'Not Started',
    dotClass: 'bg-slate-400',
    badgeClass: 'bg-slate-100 text-slate-600',
    icon: '○',
  },
  in_progress: {
    label: 'In Progress',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700',
    icon: '◐',
  },
  waiting_for_grading: {
    label: 'Waiting for Grading',
    dotClass: 'bg-blue-500',
    badgeClass: 'bg-blue-50 text-blue-700',
    icon: '⏳',
  },
  graded: {
    label: 'Graded',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    icon: '✓',
  },
};
