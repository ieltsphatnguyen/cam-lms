import { supabase } from '@/lib/supabase';
import type {
  StartAttemptResult,
  StudentAttempt,
  AttemptStatus,
  StudentAssignmentItem,
  ItemStatus,
  PublishedAssignmentItem,
} from '@/types/database';
import { fetchPublishedItems } from '@/lib/templates';

// ── Start an attempt ────────────────────────────────────────
// This is the ONLY way question content becomes available.
// The backend creates the attempt, then returns the content.
export async function startAttempt(
  publishedItemId: number,
): Promise<StartAttemptResult> {
  const { data, error } = await supabase.rpc('start_attempt', {
    p_published_item_id: publishedItemId,
  });
  if (error) throw error;
  return data as StartAttemptResult;
}

// ── Submit an attempt ────────────────────────────────────────
export async function submitAttempt(
  attemptId: number,
  payload: {
    written_response?: string | null;
    audio_path?: string | null;
    word_count?: number | null;
    status?: AttemptStatus;
  },
): Promise<number> {
  const { data, error } = await supabase.rpc('submit_attempt', {
    p_attempt_id: attemptId,
    p_written_response: payload.written_response ?? null,
    p_audio_path: payload.audio_path ?? null,
    p_word_count: payload.word_count ?? null,
    p_status: payload.status ?? 'submitted',
  });
  if (error) throw error;
  return data as number;
}

// ── Fetch a single attempt ───────────────────────────────────
export async function fetchAttempt(
  attemptId: number,
): Promise<StudentAttempt | null> {
  const { data, error } = await supabase
    .from('student_attempts')
    .select('*')
    .eq('id', attemptId)
    .maybeSingle();
  if (error) throw error;
  return data as StudentAttempt | null;
}

// ── Fetch all attempts for the current student ────────────────
export async function fetchMyAttempts(): Promise<StudentAttempt[]> {
  const { data, error } = await supabase
    .from('student_attempts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as StudentAttempt[];
}

// ── Fetch attempts for specific published items ──────────────
export async function fetchAttemptsForItems(
  itemIds: number[],
): Promise<StudentAttempt[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await supabase
    .from('student_attempts')
    .select('*')
    .in('published_assignment_item_id', itemIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as StudentAttempt[];
}

// ── Compute item status ──────────────────────────────────────
export function computeItemStatus(
  item: PublishedAssignmentItem,
  attempt: StudentAttempt | undefined,
  now: Date = new Date(),
): ItemStatus {
  // If there's a submitted/auto_submitted attempt with revision_requested,
  // the item is unlocked for a new revision attempt.
  if (
    attempt &&
    (attempt.status === 'submitted' || attempt.status === 'auto_submitted') &&
    attempt.revision_requested === true
  ) {
    return 'revision_requested';
  }

  // If there's a submitted/auto_submitted attempt, it's completed
  if (
    attempt &&
    (attempt.status === 'submitted' || attempt.status === 'auto_submitted')
  ) {
    return 'completed';
  }

  // If there's an in-progress attempt, it's available
  if (attempt && attempt.status === 'in_progress') {
    return 'available';
  }

  // No attempt — check availability
  if (item.available_from) {
    const availableDate = new Date(item.available_from);
    if (availableDate > now) return 'locked';
  }

  // Check overdue
  if (item.due_date) {
    const dueDate = new Date(item.due_date);
    if (dueDate < now) return 'overdue';
  }

  return 'available';
}

// ── Fetch published items with attempt status for a student ──
export async function fetchStudentAssignmentItems(
  publishedAssignmentId: number,
): Promise<StudentAssignmentItem[]> {
  const items = await fetchPublishedItems(publishedAssignmentId);
  if (items.length === 0) return [];

  const itemIds = items.map((i) => i.id);
  const attempts = await fetchAttemptsForItems(itemIds);

  const attemptMap = new Map<number, StudentAttempt>();
  for (const a of attempts) {
    // Keep the most recent attempt per item
    if (
      !attemptMap.has(a.published_assignment_item_id) ||
      a.created_at > attemptMap.get(a.published_assignment_item_id)!.created_at
    ) {
      attemptMap.set(a.published_assignment_item_id, a);
    }
  }

  const now = new Date();
  return items.map((item) => {
    const attempt = attemptMap.get(item.id);
    return {
      ...item,
      attempt_status: attempt?.status ?? null,
      attempt_submitted_at: attempt?.submitted_at ?? null,
      item_status: computeItemStatus(item, attempt, now),
      revision_requested: attempt?.revision_requested ?? false,
      revision_notes: attempt?.revision_notes ?? null,
    } as StudentAssignmentItem;
  });
}

// ── Count words in a text response ───────────────────────────
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ── Fetch the most recent attempt for a specific item ────────
export async function fetchAttemptForItem(
  publishedItemId: number,
): Promise<StudentAttempt | null> {
  const { data, error } = await supabase
    .from('student_attempts')
    .select('id,published_assignment_item_id,student_profile_id,status,started_at,submitted_at,time_limit_seconds,response_type,written_response,audio_path,word_count,created_at,feedback_published,revision_requested,revision_notes')
    .eq('published_assignment_item_id', publishedItemId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as StudentAttempt | null;
}
