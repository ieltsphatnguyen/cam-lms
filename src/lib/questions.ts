import { supabase } from '@/lib/supabase';
import type {
  Question,
  QuestionType,
  QuestionWithDetails,
  ResponseType,
  SimilarQuestion,
} from '@/types/database';

// ── Built-in Question Type IDs ─────────────────────────────
export const QUESTION_TYPE_IDS = {
  WRITING_TASK_1: 1,
  WRITING_TASK_2: 2,
  SPEAKING_PART_1: 3,
  SPEAKING_PART_2: 4,
  SPEAKING_PART_3: 5,
  EXTRA_HOMEWORK: 6,
  CUSTOM: 7,
} as const;

// ── Default response types per built-in question type ───────
export const DEFAULT_RESPONSE_TYPE: Record<number, ResponseType> = {
  [QUESTION_TYPE_IDS.WRITING_TASK_1]: 'text',
  [QUESTION_TYPE_IDS.WRITING_TASK_2]: 'text',
  [QUESTION_TYPE_IDS.SPEAKING_PART_1]: 'audio',
  [QUESTION_TYPE_IDS.SPEAKING_PART_2]: 'audio',
  [QUESTION_TYPE_IDS.SPEAKING_PART_3]: 'audio',
  [QUESTION_TYPE_IDS.EXTRA_HOMEWORK]: 'text',
  [QUESTION_TYPE_IDS.CUSTOM]: 'text',
};

// ── Types that support image upload ─────────────────────────
export const IMAGE_CAPABLE_TYPES = new Set<number>([
  QUESTION_TYPE_IDS.WRITING_TASK_1,
  QUESTION_TYPE_IDS.SPEAKING_PART_2,
  QUESTION_TYPE_IDS.CUSTOM,
]);

// ── IELTS Speaking Part 2 cue card metadata ─────────────────
export const SPEAKING_PART_2_META = {
  preparationTime: 60,
  speakingTime: 120,
};

// ── Per-type category dropdown options ──────────────────────
export const CATEGORY_OPTIONS: Record<number, string[]> = {
  [QUESTION_TYPE_IDS.WRITING_TASK_1]: [
    'Dynamic Charts',
    'Static Charts',
    'Mixed Charts',
    'Maps',
    'Processes',
    'Diagrams',
    'Others',
  ],
  [QUESTION_TYPE_IDS.WRITING_TASK_2]: [
    'Opinion (To what extent do you agree or disagree?)',
    'Discuss Both Views',
    'Advantages & Disadvantages',
    'Problems & Solutions',
    'Two-Part Questions',
    'Others',
  ],
  [QUESTION_TYPE_IDS.SPEAKING_PART_2]: [
    'Person',
    'Place',
    'Object / Thing',
    'Event',
    'Experience',
    'Activity',
    'Skill',
    'Memory',
    'Future Plan',
    'Others',
  ],
  [QUESTION_TYPE_IDS.SPEAKING_PART_3]: [
    'Education',
    'Technology',
    'Environment',
    'Health',
    'Work',
    'Transport',
    'Food',
    'Shopping',
    'Family',
    'Children',
    'Media',
    'Advertising',
    'Crime',
    'Tourism',
    'Culture',
    'History',
    'Housing',
    'Sports',
    'Animals',
    'Science',
    'Others',
  ],
};

// Types that use a dropdown with "Others" → custom text
export const DROPDOWN_CATEGORY_TYPES = new Set<number>([
  QUESTION_TYPE_IDS.WRITING_TASK_1,
  QUESTION_TYPE_IDS.WRITING_TASK_2,
  QUESTION_TYPE_IDS.SPEAKING_PART_2,
  QUESTION_TYPE_IDS.SPEAKING_PART_3,
]);

// Types that use a single free-text category field
export const FREE_TEXT_CATEGORY_TYPES = new Set<number>([
  QUESTION_TYPE_IDS.EXTRA_HOMEWORK,
  QUESTION_TYPE_IDS.CUSTOM,
]);

// Speaking Part 1 uses two free-text topic fields
export const TWO_FIELD_CATEGORY_TYPES = new Set<number>([
  QUESTION_TYPE_IDS.SPEAKING_PART_1,
]);

// ── Fetch all question types ────────────────────────────────
export async function fetchQuestionTypes(): Promise<QuestionType[]> {
  const { data, error } = await supabase
    .from('questiontypes')
    .select('id, name')
    .order('id');
  if (error) throw error;
  return data ?? [];
}

// ── Fetch questions with filters ────────────────────────────
export interface QuestionFilters {
  ownerId?: string | 'mine' | 'everyone';
  category?: string;
  typeId?: number;
  responseType?: ResponseType;
  status?: 'active' | 'archived' | 'all';
  tags?: string[];
  search?: string;
}

export async function fetchQuestions(
  currentUserId: string,
  filters: QuestionFilters = {},
): Promise<QuestionWithDetails[]> {
  let query = supabase.from('questions').select('*, questiontypes!inner(name)');

  if (filters.ownerId === 'mine') {
    query = query.eq('owner_id', currentUserId);
  } else if (filters.ownerId === 'everyone') {
    // no filter
  } else if (filters.ownerId) {
    query = query.eq('owner_id', filters.ownerId);
  } else {
    query = query.eq('owner_id', currentUserId);
  }

  if (filters.status === 'active') {
    query = query.eq('status', 'active');
  } else if (filters.status === 'archived') {
    query = query.eq('status', 'archived');
  }

  if (filters.category) {
    query = query.eq('category', filters.category);
  }

  if (filters.typeId) {
    query = query.eq('type_id', filters.typeId);
  }

  if (filters.responseType) {
    query = query.eq('response_type', filters.responseType);
  }

  if (filters.tags && filters.tags.length > 0) {
    query = query.overlaps('tags', filters.tags);
  }

  if (filters.search) {
    query = query.or(
      `content.ilike.%${filters.search}%,tags.cs.{${filters.search}}`,
    );
  }

  query = query.order('updated_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const qt = row.questiontypes as unknown as { name: string };
    return {
      ...row,
      type_name: qt?.name ?? 'Unknown',
      owner_display_name: '',
    } as QuestionWithDetails;
  });
}

// ── Fetch a single question ────────────────────────────────
export async function fetchQuestion(
  id: number,
): Promise<QuestionWithDetails | null> {
  const { data, error } = await supabase
    .from('questions')
    .select('*, questiontypes!inner(name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const qt = data.questiontypes as unknown as { name: string };
  return {
    ...data,
    type_name: qt?.name ?? 'Unknown',
    owner_display_name: '',
  } as QuestionWithDetails;
}

// ── Create question ────────────────────────────────────────
export interface QuestionInput {
  content: string;
  type_id: number;
  description: string | null;
  ielts_band: string | null;
  category: string | null;
  category_secondary: string | null;
  tags: string[];
  response_type: ResponseType;
  image_url: string | null;
  custom_type_name: string | null;
  custom_instructions: string | null;
}

export async function createQuestion(input: QuestionInput): Promise<Question> {
  const { data, error } = await supabase
    .from('questions')
    .insert({ ...input, status: 'active' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ── Update question ─────────────────────────────────────────
export async function updateQuestion(
  id: number,
  input: Partial<QuestionInput>,
): Promise<Question> {
  const { data, error } = await supabase
    .from('questions')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ── Archive question ────────────────────────────────────────
export async function archiveQuestion(id: number): Promise<void> {
  const { error } = await supabase
    .from('questions')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ── Restore question ────────────────────────────────────────
export async function restoreQuestion(id: number): Promise<void> {
  const { error } = await supabase
    .from('questions')
    .update({ status: 'active', archived_at: null })
    .eq('id', id);
  if (error) throw error;
}

// ── Delete question ─────────────────────────────────────────
export async function deleteQuestion(id: number): Promise<void> {
  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) throw error;
}

// ── Duplicate question ───────────────────────────────────────
export async function duplicateQuestion(
  source: Question,
  _currentUserId: string,
): Promise<Question> {
  const input: QuestionInput = {
    content: source.content,
    type_id: source.type_id,
    description: source.description,
    ielts_band: source.ielts_band,
    category: source.category,
    category_secondary: source.category_secondary,
    tags: source.tags ?? [],
    response_type: source.response_type,
    image_url: source.image_url,
    custom_type_name: source.custom_type_name,
    custom_instructions: source.custom_instructions,
  };
  return createQuestion(input);
}

// ── Fetch existing categories for a given type ──────────────
export async function fetchCategoriesForType(
  typeId: number,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('category')
    .eq('type_id', typeId)
    .not('category', 'is', null)
    .neq('category', '');
  if (error) throw error;
  const categories = (data ?? [])
    .map((row) => row.category as string)
    .filter(Boolean);
  return [...new Set(categories)].sort();
}

// ── Fetch existing tags ─────────────────────────────────────
export async function fetchAllTags(): Promise<string[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('tags')
    .not('tags', 'is', null);
  if (error) throw error;
  const tags = (data ?? []).flatMap((row) => row.tags ?? []);
  return [...new Set(tags)].sort();
}

// ── Fetch tags for a specific question type ──────────────────
// When typeId is provided, returns only tags from questions of that type.
// When typeId is null/undefined, returns all tags (equivalent to fetchAllTags).
export async function fetchTagsForType(
  typeId: number | null | undefined,
): Promise<string[]> {
  let query = supabase
    .from('questions')
    .select('tags')
    .not('tags', 'is', null);

  if (typeId) {
    query = query.eq('type_id', typeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const tags = (data ?? []).flatMap((row) => row.tags ?? []);
  return [...new Set(tags)].sort();
}

// ── Similar question search ─────────────────────────────────
export async function searchSimilarQuestions(
  prompt: string,
  excludeId?: number,
): Promise<SimilarQuestion[]> {
  if (prompt.trim().length < 10) return [];
  const { data, error } = await supabase.rpc('search_similar_questions', {
    p_prompt: prompt,
    p_threshold: 0.3,
    p_exclude_id: excludeId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as SimilarQuestion[];
}

// ── Upload image to question-images bucket ──────────────────
export async function uploadQuestionImage(
  file: File,
  userId: string,
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('question-images')
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: urlData } = supabase.storage
    .from('question-images')
    .getPublicUrl(path);
  return urlData.publicUrl;
}

// ── Remove image from storage ───────────────────────────────
export async function removeQuestionImage(imageUrl: string): Promise<void> {
  try {
    const url = new URL(imageUrl);
    const pathMatch = url.pathname.match(/question-images\/(.+)$/);
    if (pathMatch) {
      await supabase.storage.from('question-images').remove([pathMatch[1]]);
    }
  } catch {
    // URL parsing failed — not a storage URL we can delete
  }
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

