import { supabase } from '@/lib/supabase';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import type {
  AssignmentTemplate,
  AssignmentTemplateWithDetails,
  DuplicateTemplateResult,
  Question,
  QuestionWithDetails,
  TemplateStatus,
} from '@/types/database';

// ── Canonical question type order ──────────────────────────
export const CANONICAL_TYPE_ORDER: number[] = [
  QUESTION_TYPE_IDS.SPEAKING_PART_1,
  QUESTION_TYPE_IDS.SPEAKING_PART_2,
  QUESTION_TYPE_IDS.SPEAKING_PART_3,
  QUESTION_TYPE_IDS.WRITING_TASK_1,
  QUESTION_TYPE_IDS.WRITING_TASK_2,
  QUESTION_TYPE_IDS.EXTRA_HOMEWORK,
  QUESTION_TYPE_IDS.CUSTOM,
];

export function canonicalTypeRank(typeId: number): number {
  const idx = CANONICAL_TYPE_ORDER.indexOf(typeId);
  return idx === -1 ? 999 : idx;
}

// ── Apply canonical ordering to a list of questions ──────
// Groups by type in canonical order; within each type, preserves
// the order in which the teacher selected them (selection_order).
export function applyCanonicalOrder<T extends { type_id: number; selection_order: number }>(
  questions: T[],
): T[] {
  return [...questions].sort((a, b) => {
    const rankDiff = canonicalTypeRank(a.type_id) - canonicalTypeRank(b.type_id);
    if (rankDiff !== 0) return rankDiff;
    return a.selection_order - b.selection_order;
  });
}

// ── Fetch templates with filters ────────────────────────────
export interface TemplateFilters {
  ownerId?: string | 'mine' | 'everyone';
  status?: TemplateStatus | 'all';
  createdBy?: string;
  search?: string;
}

export async function fetchTemplates(
  currentUserId: string,
  filters: TemplateFilters = {},
): Promise<AssignmentTemplateWithDetails[]> {
  let query = supabase.from('assignment_templates').select(
    '*, profiles!assignment_templates_owner_id_fkey(display_name)',
  );

  if (filters.ownerId === 'mine') {
    query = query.eq('owner_id', currentUserId);
  } else if (filters.ownerId === 'everyone') {
    // no filter
  } else if (filters.ownerId) {
    query = query.eq('owner_id', filters.ownerId);
  } else {
    query = query.eq('owner_id', currentUserId);
  }

  if (filters.status === 'active' || filters.status === 'archived') {
    query = query.eq('status', filters.status);
  }

  if (filters.createdBy) {
    query = query.eq('owner_id', filters.createdBy);
  }

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }

  query = query.order('updated_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  // Fetch question counts for all templates in one query
  const templateIds = (data ?? []).map((t) => t.id);
  let counts: Record<number, number> = {};
  if (templateIds.length > 0) {
    const { data: countData } = await supabase
      .from('assignment_template_questions')
      .select('template_id')
      .in('template_id', templateIds);
    counts = (countData ?? []).reduce<Record<number, number>>((acc, row) => {
      acc[row.template_id as number] = (acc[row.template_id as number] ?? 0) + 1;
      return acc;
    }, {});
  }

  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { display_name: string } | null;
    return {
      ...row,
      owner_display_name: profile?.display_name ?? 'Unknown',
      question_count: counts[row.id as number] ?? 0,
    } as AssignmentTemplateWithDetails;
  });
}

// ── Fetch a single template ────────────────────────────────
export async function fetchTemplate(
  id: number,
): Promise<AssignmentTemplate | null> {
  const { data, error } = await supabase
    .from('assignment_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as AssignmentTemplate | null;
}

// ── Fetch questions for a template (in canonical order) ────
export async function fetchTemplateQuestions(
  templateId: number,
): Promise<QuestionWithDetails[]> {
  const { data: junctions, error: jError } = await supabase
    .from('assignment_template_questions')
    .select('question_id, selection_order')
    .eq('template_id', templateId);

  if (jError) throw jError;
  if (!junctions || junctions.length === 0) return [];

  const questionIds = junctions.map((j) => j.question_id as number);
  const orderMap = new Map<number, number>();
  junctions.forEach((j) => {
    orderMap.set(j.question_id as number, j.selection_order as number);
  });

  const { data: questions, error: qError } = await supabase
    .from('questions')
    .select('*, questiontypes!inner(name)')
    .in('id', questionIds);

  if (qError) throw qError;

  const result = (questions ?? []).map((row) => {
    const qt = row.questiontypes as unknown as { name: string };
    return {
      ...row,
      type_name: qt?.name ?? 'Unknown',
      selection_order: orderMap.get(row.id as number) ?? 0,
      owner_display_name: '',
    } as QuestionWithDetails & { selection_order: number };
  });

  return applyCanonicalOrder(result);
}

// ── Create template ────────────────────────────────────────
export interface TemplateInput {
  name: string;
  description: string | null;
}

export async function createTemplate(
  input: TemplateInput,
  questionIds: number[],
): Promise<AssignmentTemplate> {
  // Check for duplicates before saving
  const sortedIds = [...questionIds].sort((a, b) => a - b);
  const dup = await checkDuplicateTemplate(sortedIds);
  if (dup) {
    throw new DuplicateTemplateError(dup);
  }

  const { data: template, error: tError } = await supabase
    .from('assignment_templates')
    .insert({
      name: input.name,
      description: input.description,
      status: 'active',
    })
    .select('*')
    .single();
  if (tError) throw tError;

  if (questionIds.length > 0) {
    const rows = questionIds.map((qid, idx) => ({
      template_id: template.id,
      question_id: qid,
      selection_order: idx,
    }));
    const { error: qError } = await supabase
      .from('assignment_template_questions')
      .insert(rows);
    if (qError) throw qError;
  }

  return template as AssignmentTemplate;
}

// ── Update template metadata ───────────────────────────────
export async function updateTemplate(
  id: number,
  input: Partial<TemplateInput>,
): Promise<AssignmentTemplate> {
  const { data, error } = await supabase
    .from('assignment_templates')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssignmentTemplate;
}

// ── Update template questions (full replace) ───────────────
export async function updateTemplateQuestions(
  templateId: number,
  questionIds: number[],
): Promise<void> {
  // Check for duplicates (excluding current template)
  const sortedIds = [...questionIds].sort((a, b) => a - b);
  const dup = await checkDuplicateTemplate(sortedIds, templateId);
  if (dup) {
    throw new DuplicateTemplateError(dup);
  }

  // Delete existing junction rows
  const { error: dError } = await supabase
    .from('assignment_template_questions')
    .delete()
    .eq('template_id', templateId);
  if (dError) throw dError;

  // Insert new junction rows
  if (questionIds.length > 0) {
    const rows = questionIds.map((qid, idx) => ({
      template_id: templateId,
      question_id: qid,
      selection_order: idx,
    }));
    const { error: iError } = await supabase
      .from('assignment_template_questions')
      .insert(rows);
    if (iError) throw iError;
  }
}

// ── Archive template ────────────────────────────────────────
export async function archiveTemplate(id: number): Promise<void> {
  const { error } = await supabase
    .from('assignment_templates')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ── Restore template ────────────────────────────────────────
export async function restoreTemplate(id: number): Promise<void> {
  const { error } = await supabase
    .from('assignment_templates')
    .update({ status: 'active', archived_at: null })
    .eq('id', id);
  if (error) throw error;
}

// ── Duplicate template ───────────────────────────────────────
export async function duplicateTemplate(
  source: AssignmentTemplate,
  questionIds: number[],
  newName?: string,
): Promise<AssignmentTemplate> {
  return createTemplate(
    {
      name: newName ?? `${source.name} (Copy)`,
      description: source.description,
    },
    questionIds,
  );
}

// ── Duplicate detection ─────────────────────────────────────
export class DuplicateTemplateError extends Error {
  duplicate: DuplicateTemplateResult;
  constructor(duplicate: DuplicateTemplateResult) {
    super('This template is identical to an existing template.');
    this.duplicate = duplicate;
  }
}

export async function checkDuplicateTemplate(
  sortedQuestionIds: number[],
  excludeTemplateId?: number,
): Promise<DuplicateTemplateResult | null> {
  if (sortedQuestionIds.length === 0) return null;
  const { data, error } = await supabase.rpc('check_duplicate_template', {
    p_question_ids: sortedQuestionIds,
  });
  if (error) throw error;
  const result = (data ?? []) as DuplicateTemplateResult[];
  if (result.length === 0) return null;
  if (excludeTemplateId && result[0].id === excludeTemplateId) return null;
  return result[0];
}

// ── Fetch all teachers for owner filter ─────────────────────
export async function fetchTeachersForFilter(): Promise<
  { id: string; display_name: string }[]
> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('role', 'teacher');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    display_name: (row.display_name as string) || 'Unknown',
  }));
}
