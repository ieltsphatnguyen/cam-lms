import { supabase } from '@/lib/supabase';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import type {
  AssignmentTemplate,
  AssignmentTemplateWithDetails,
  AssignmentDraft,
  AssignmentDraftWithDetails,
  AssignmentItem,
  DuplicateTemplateResult,
  Question,
  QuestionWithDetails,
  RandomQuestionRule,
  RandomRuleInput,
  ResolveResult,
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

// ── Random Question Rules ──────────────────────────────────

export async function fetchTemplateRandomRules(
  templateId: number,
): Promise<RandomQuestionRule[]> {
  const { data, error } = await supabase
    .from('assignment_template_random_rules')
    .select('*')
    .eq('template_id', templateId)
    .order('rule_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RandomQuestionRule[];
}

export async function setTemplateRandomRules(
  templateId: number,
  rules: RandomRuleInput[],
): Promise<void> {
  const { error: dError } = await supabase
    .from('assignment_template_random_rules')
    .delete()
    .eq('template_id', templateId);
  if (dError) throw dError;

  if (rules.length > 0) {
    const rows = rules.map((r, idx) => ({
      template_id: templateId,
      rule_order: idx,
      question_type_id: r.question_type_id,
      response_type: r.response_type,
      category: r.category || null,
      tags: r.tags && r.tags.length > 0 ? r.tags : null,
    }));
    const { error: iError } = await supabase
      .from('assignment_template_random_rules')
      .insert(rows);
    if (iError) throw iError;
  }
}

// ── Assignment Drafts ──────────────────────────────────────

export interface DraftFilters {
  ownerId?: string | 'mine' | 'everyone';
  status?: 'draft' | 'published' | 'all';
  search?: string;
  classId?: number;
}

export async function fetchDrafts(
  currentUserId: string,
  filters: DraftFilters = {},
): Promise<AssignmentDraftWithDetails[]> {
  let query = supabase.from('assignment_drafts').select(
    '*, profiles!assignment_drafts_owner_id_fkey(display_name), classes(name), assignment_templates(name)',
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

  if (filters.status === 'draft' || filters.status === 'published') {
    query = query.eq('status', filters.status);
  }

  if (filters.classId) {
    query = query.eq('class_id', filters.classId);
  }

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }

  query = query.order('updated_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  const draftIds = (data ?? []).map((d) => d.id);
  let counts: Record<number, number> = {};
  if (draftIds.length > 0) {
    const { data: countData } = await supabase
      .from('assignment_draft_questions')
      .select('draft_id')
      .in('draft_id', draftIds);
    counts = (countData ?? []).reduce<Record<number, number>>((acc, row) => {
      acc[row.draft_id as number] = (acc[row.draft_id as number] ?? 0) + 1;
      return acc;
    }, {});
  }

  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { display_name: string } | null;
    const cls = row.classes as unknown as { name: string } | null;
    const tmpl = row.assignment_templates as unknown as { name: string } | null;
    return {
      ...row,
      owner_display_name: profile?.display_name ?? 'Unknown',
      question_count: counts[row.id as number] ?? 0,
      class_name: cls?.name ?? null,
      template_name: tmpl?.name ?? null,
    } as AssignmentDraftWithDetails;
  });
}

export async function fetchDraft(
  id: number,
): Promise<AssignmentDraft | null> {
  const { data, error } = await supabase
    .from('assignment_drafts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as AssignmentDraft | null;
}

export async function fetchDraftWithDetails(
  id: number,
): Promise<AssignmentDraftWithDetails | null> {
  const { data, error } = await supabase
    .from('assignment_drafts')
    .select(
      '*, profiles!assignment_drafts_owner_id_fkey(display_name), classes(name), assignment_templates(name)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: countData } = await supabase
    .from('assignment_draft_questions')
    .select('draft_id')
    .eq('draft_id', id);

  const count = (countData ?? []).length;

  const profile = data.profiles as unknown as { display_name: string } | null;
  const cls = data.classes as unknown as { name: string } | null;
  const tmpl = data.assignment_templates as unknown as { name: string } | null;

  return {
    ...data,
    owner_display_name: profile?.display_name ?? 'Unknown',
    question_count: count,
    class_name: cls?.name ?? null,
    template_name: tmpl?.name ?? null,
  } as AssignmentDraftWithDetails;
}

export async function fetchDraftQuestions(
  draftId: number,
): Promise<QuestionWithDetails[]> {
  const { data: junctions, error: jError } = await supabase
    .from('assignment_draft_questions')
    .select('question_id, selection_order')
    .eq('draft_id', draftId);

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

export async function resolveTemplateToDraft(
  templateId: number,
  classId: number | null,
  draftName: string,
  draftDescription: string | null,
): Promise<ResolveResult> {
  const { data, error } = await supabase.rpc('resolve_template_to_draft', {
    p_template_id: templateId,
    p_class_id: classId,
    p_draft_name: draftName,
    p_draft_description: draftDescription,
  });
  if (error) throw error;
  return data as ResolveResult;
}

// ── Create an empty draft (no template) ─────────────────────
export async function createEmptyDraft(
  classId: number,
  draftName: string,
  draftDescription: string | null,
): Promise<number> {
  const { data, error } = await supabase
    .from('assignment_drafts')
    .insert({
      name: draftName,
      description: draftDescription,
      class_id: classId,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as number;
}

// ── Add a question to a draft ───────────────────────────────
export async function addQuestionToDraft(
  draftId: number,
  questionId: number,
): Promise<void> {
  // Get the next selection_order
  const { data: existing } = await supabase
    .from('assignment_draft_questions')
    .select('selection_order')
    .eq('draft_id', draftId)
    .order('selection_order', { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.selection_order as number ?? -1) + 1;

  const { error } = await supabase
    .from('assignment_draft_questions')
    .insert({
      draft_id: draftId,
      question_id: questionId,
      selection_order: nextOrder,
    });
  if (error) throw error;
}

// ── Remove a question from a draft ──────────────────────────
export async function removeQuestionFromDraft(
  draftId: number,
  questionId: number,
): Promise<void> {
  const { error } = await supabase
    .from('assignment_draft_questions')
    .delete()
    .eq('draft_id', draftId)
    .eq('question_id', questionId);
  if (error) throw error;
}

// ── Resolve a random rule via RPC ───────────────────────────
export async function resolveRandomRule(
  questionTypeId: number,
  responseType: string,
  category: string | null,
  tags: string[] | null,
  usedQuestionIds: number[],
  classId: number | null,
): Promise<number | null> {
  const { data, error } = await supabase.rpc('resolve_random_rule', {
    p_question_type_id: questionTypeId,
    p_response_type: responseType,
    p_category: category,
    p_tags: tags,
    p_used_question_ids: usedQuestionIds,
    p_class_id: classId,
  });
  if (error) throw error;
  return data as number | null;
}

// ── Clear all questions from a draft ────────────────────────
export async function clearDraftQuestions(draftId: number): Promise<void> {
  const { error } = await supabase
    .from('assignment_draft_questions')
    .delete()
    .eq('draft_id', draftId);
  if (error) throw error;
}

// ── Replace all draft questions with a template's resolved questions ──
// Resolves a template into a draft, removing any existing questions first.
// Returns the updated draft items.
export async function replaceDraftFromTemplate(
  draftId: number,
  templateId: number,
  classId: number | null,
): Promise<AssignmentItem[]> {
  // 1. Clear existing questions
  await clearDraftQuestions(draftId);

  // 2. Fetch fixed template questions
  const templateQuestions = await fetchTemplateQuestions(templateId);

  // 3. Insert fixed questions into the draft
  if (templateQuestions.length > 0) {
    const rows = templateQuestions.map((q, idx) => ({
      draft_id: draftId,
      question_id: q.id,
      selection_order: idx,
    }));
    const { error: qError } = await supabase
      .from('assignment_draft_questions')
      .insert(rows);
    if (qError) throw qError;
  }

  // 4. Resolve random rules
  const rules = await fetchTemplateRandomRules(templateId);
  let usedIds = templateQuestions.map((q) => q.id);
  let nextOrder = templateQuestions.length;

  for (const rule of rules) {
    const resolvedId = await resolveRandomRule(
      rule.question_type_id,
      rule.response_type,
      rule.category,
      rule.tags,
      usedIds,
      classId,
    );
    if (resolvedId !== null) {
      const { error: rError } = await supabase
        .from('assignment_draft_questions')
        .insert({
          draft_id: draftId,
          question_id: resolvedId,
          selection_order: nextOrder,
        });
      if (rError) throw rError;
      usedIds = [...usedIds, resolvedId];
      nextOrder++;
    }
  }

  // 5. Return the updated items
  return fetchDraftItems(draftId);
}

// ── Update assignment item metadata ─────────────────────────
export interface AssignmentItemUpdate {
  available_from: string | null;
  due_date: string | null;
  due_after_days: number | null;
  timed: boolean;
  time_limit_seconds: number | null;
}

export async function updateAssignmentItem(
  draftId: number,
  questionId: number,
  update: AssignmentItemUpdate,
): Promise<void> {
  const timeLimitInterval = update.time_limit_seconds
    ? `${update.time_limit_seconds} seconds`
    : null;

  const { error } = await supabase
    .from('assignment_draft_questions')
    .update({
      available_from: update.available_from,
      due_date: update.due_date,
      due_after_days: update.due_after_days,
      timed: update.timed,
      time_limit: timeLimitInterval,
    })
    .eq('draft_id', draftId)
    .eq('question_id', questionId);
  if (error) throw error;
}

// ── Parse PostgreSQL interval string to seconds ────────────
export function parseIntervalToSeconds(intervalStr: string | null): number | null {
  if (!intervalStr) return null;
  const hmsMatch = intervalStr.match(/^(\d{2}):(\d{2}):(\d{2})/);
  if (hmsMatch) {
    const hours = parseInt(hmsMatch[1], 10);
    const minutes = parseInt(hmsMatch[2], 10);
    const seconds = parseInt(hmsMatch[3], 10);
    return hours * 3600 + minutes * 60 + seconds;
  }
  const parts = intervalStr.match(/(\d+)\s*(hour|minute|second)s?/g);
  if (parts) {
    let total = 0;
    for (const part of parts) {
      const m = part.match(/(\d+)\s*(hour|minute|second)s?/);
      if (m) {
        const val = parseInt(m[1], 10);
        if (m[2] === 'hour') total += val * 3600;
        else if (m[2] === 'minute') total += val * 60;
        else if (m[2] === 'second') total += val;
      }
    }
    return total > 0 ? total : null;
  }
  return null;
}

// ── Fetch draft items with metadata and question details ───
export async function fetchDraftItems(
  draftId: number,
): Promise<AssignmentItem[]> {
  const { data: junctions, error: jError } = await supabase
    .from('assignment_draft_questions')
    .select('*')
    .eq('draft_id', draftId)
    .order('selection_order', { ascending: true });

  if (jError) throw jError;
  if (!junctions || junctions.length === 0) return [];

  const questionIds = junctions.map((j) => j.question_id as number);

  const { data: questions, error: qError } = await supabase
    .from('questions')
    .select('*, questiontypes!inner(name)')
    .in('id', questionIds);

  if (qError) throw qError;

  const questionMap = new Map<number, typeof questions[number]>();
  (questions ?? []).forEach((q) => {
    questionMap.set(q.id as number, q);
  });

  return (junctions ?? []).map((j) => {
    const q = questionMap.get(j.question_id as number);
    const qt = q?.questiontypes as unknown as { name: string };
    return {
      ...j,
      kind: 'question' as const,
      type_id: (q?.type_id as number) ?? undefined,
      type_name: qt?.name ?? 'Unknown',
      content: (q?.content as string) ?? '',
    } as AssignmentItem;
  });
}

// ── Save a draft as a preset (template) ────────────────────
export async function saveDraftAsPreset(
  draftId: number,
  presetName: string,
  presetDescription: string | null,
): Promise<number> {
  // Fetch the draft's questions
  const items = await fetchDraftItems(draftId);
  const questionIds = items.map((item) => item.question_id);

  // Create the template
  const { data: template, error: tError } = await supabase
    .from('assignment_templates')
    .insert({
      name: presetName,
      description: presetDescription,
      status: 'active',
    })
    .select('id')
    .single();
  if (tError) throw tError;

  // Add questions to the template
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

  return template.id as number;
}

export async function deleteDraft(id: number): Promise<void> {
  const { error } = await supabase
    .from('assignment_drafts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Duplicate a draft ──────────────────────────────────────
export async function duplicateDraft(
  source: AssignmentDraftWithDetails,
  newName?: string,
): Promise<number> {
  // Create the new draft
  const { data: newDraft, error: dError } = await supabase
    .from('assignment_drafts')
    .insert({
      name: newName ?? `${source.name} (Copy)`,
      description: source.description,
      template_id: source.template_id,
      class_id: source.class_id,
      status: 'draft',
    })
    .select('id')
    .single();
  if (dError) throw dError;

  const newDraftId = newDraft.id as number;

  // Copy all draft questions with their metadata
  const items = await fetchDraftItems(source.id);
  if (items.length > 0) {
    const rows = items.map((item) => ({
      draft_id: newDraftId,
      question_id: item.question_id,
      selection_order: item.selection_order,
      available_from: item.available_from,
      due_date: item.due_date,
      due_after_days: item.due_after_days,
      timed: item.timed,
      time_limit: item.time_limit,
    }));
    const { error: qError } = await supabase
      .from('assignment_draft_questions')
      .insert(rows);
    if (qError) throw qError;
  }

  return newDraftId;
}

export async function fetchClassesForFilter(): Promise<
  { id: number; name: string }[]
> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name')
    .is('archived_at', null)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as number,
    name: row.name as string,
  }));
}
