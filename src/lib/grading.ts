import { supabase } from '@/lib/supabase';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import { canonicalTypeRank } from '@/lib/templates';
import type {
  PublishedAssignmentItem,
  StudentAttempt,
  ResponseType,
} from '@/types/database';

// ── Types ──────────────────────────────────────────────────

export interface GradingClassInfo {
  id: number;
  name: string;
  class_code: string | null;
}

export interface GradingAssignmentInfo {
  id: number;
  name: string;
  class_id: number;
  owner_id: string;
  published_at: string;
}

export interface GradingItemInfo {
  id: number;
  published_assignment_id: number;
  question_id: number;
  content: string;
  type_id: number;
  type_name: string;
  response_type: ResponseType;
  image_url: string | null;
  custom_type_name: string | null;
  custom_instructions: string | null;
  category: string | null;
  category_secondary: string | null;
  ielts_band: string | null;
  description: string | null;
  selection_order: number;
  available_from: string | null;
  due_date: string | null;
  due_after_days: number | null;
  timed: boolean;
  time_limit: string | null;
  prep_time_seconds: number | null;
  recording_time_seconds: number | null;
}

export interface GradingAttemptInfo extends StudentAttempt {
  student_name: string;
  student_email: string;
}

export type GradingStatus = 'not_started' | 'running' | 'submitted' | 'graded';

export interface ItemProgress {
  item: GradingItemInfo;
  totalStudents: number;
  submittedCount: number;
  gradedCount: number;
  lateCount: number;
}

export interface AssignmentProgress {
  assignment: GradingAssignmentInfo;
  items: ItemProgress[];
  totalSubmissions: number;
  totalGraded: number;
}

export interface ClassProgress {
  classInfo: GradingClassInfo;
  assignments: AssignmentProgress[];
  totalSubmissions: number;
  totalGraded: number;
}

export type ProgressColor = 'green' | 'yellow' | 'red' | 'grey';

// ── Fetch the full grading hierarchy ────────────────────────

export async function fetchGradingHierarchy(): Promise<ClassProgress[]> {
  const { profile } = await supabase.auth.getUser().then(({ data }) => ({
    profile: data.user,
  }));

  // 1. Fetch classes the teacher has access to (via published_assignments RLS)
  const { data: publishedData, error: pubError } = await supabase
    .from('published_assignments')
    .select('id, name, class_id, owner_id, published_at, classes(id, name, class_code)')
    .order('published_at', { ascending: false });

  if (pubError) throw pubError;
  if (!publishedData || publishedData.length === 0) return [];

  // Group by class
  const classMap = new Map<number, GradingClassInfo>();
  const assignmentMap = new Map<number, GradingAssignmentInfo[]>();

  for (const row of publishedData) {
    const cls = row.classes as unknown as { id: number; name: string; class_code: string | null } | null;
    if (!cls) continue;

    if (!classMap.has(cls.id)) {
      classMap.set(cls.id, {
        id: cls.id,
        name: cls.name,
        class_code: cls.class_code,
      });
    }

    const assignmentList = assignmentMap.get(cls.id) ?? [];
    assignmentList.push({
      id: row.id as number,
      name: row.name as string,
      class_id: row.class_id as number,
      owner_id: row.owner_id as string,
      published_at: row.published_at as string,
    });
    assignmentMap.set(cls.id, assignmentList);
  }

  // 2. Fetch all published items for these assignments
  const assignmentIds = (publishedData ?? []).map((r) => r.id as number);
  const { data: itemsData, error: itemsError } = await supabase
    .from('published_assignment_items')
    .select('*')
    .in('published_assignment_id', assignmentIds)
    .order('selection_order', { ascending: true });

  if (itemsError) throw itemsError;

  // Group items by assignment
  const itemsByAssignment = new Map<number, GradingItemInfo[]>();
  for (const item of itemsData ?? []) {
    const list = itemsByAssignment.get(item.published_assignment_id as number) ?? [];
    list.push(item as unknown as GradingItemInfo);
    itemsByAssignment.set(item.published_assignment_id as number, list);
  }

  // 3. Fetch all attempts for these items
  const itemIds = (itemsData ?? []).map((i) => i.id as number);
  const { data: attemptsData, error: attemptsError } = await supabase
    .from('student_attempts')
    .select('*')
    .in('published_assignment_item_id', itemIds);

  if (attemptsError) throw attemptsError;

  // 4. Fetch grading records to determine which attempts are graded
  const attemptIds = (attemptsData ?? []).map((a) => a.id as number);
  let gradedAttemptIds = new Set<number>();
  if (attemptIds.length > 0) {
    const { data: gradingData, error: gradingError } = await supabase
      .from('grading')
      .select('submission_id, grading_status')
      .in('submission_id', attemptIds);
    if (gradingError) throw gradingError;
    for (const g of gradingData ?? []) {
      if ((g.grading_status as string) === 'completed' || (g.grading_status as string) === 'graded') {
        gradedAttemptIds.add(g.submission_id as number);
      }
    }
  }

  // 5. Fetch enrolled student counts per class
  const classIds = Array.from(classMap.keys());
  const studentCountMap = new Map<number, number>();
  for (const classId of classIds) {
    const { count, error: countError } = await supabase
      .from('classstudents')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId);
    if (countError) throw countError;
    studentCountMap.set(classId, count ?? 0);
  }

  // 6. Build the hierarchy
  const result: ClassProgress[] = [];

  for (const [classId, classInfo] of classMap) {
    const assignments = assignmentMap.get(classId) ?? [];
    const assignmentProgressList: AssignmentProgress[] = [];

    for (const assignment of assignments) {
      const items = itemsByAssignment.get(assignment.id) ?? [];
      // Sort items by canonical type order
      items.sort((a, b) => {
        const rankDiff = canonicalTypeRank(a.type_id) - canonicalTypeRank(b.type_id);
        if (rankDiff !== 0) return rankDiff;
        return a.selection_order - b.selection_order;
      });

      const itemProgressList: ItemProgress[] = items.map((item) => {
        const itemAttempts = (attemptsData ?? []).filter(
          (a) => a.published_assignment_item_id === item.id,
        );
        const submittedAttempts = itemAttempts.filter(
          (a) => a.status === 'submitted' || a.status === 'auto_submitted',
        );
        const gradedCount = submittedAttempts.filter((a) =>
          gradedAttemptIds.has(a.id as number),
        ).length;
        const lateCount = submittedAttempts.filter((a) => {
          if (!item.due_date || !a.submitted_at) return false;
          return new Date(a.submitted_at as string) > new Date(item.due_date);
        }).length;

        return {
          item,
          totalStudents: studentCountMap.get(classId) ?? 0,
          submittedCount: submittedAttempts.length,
          gradedCount,
          lateCount,
        };
      });

      const totalSubmissions = itemProgressList.reduce((s, i) => s + i.submittedCount, 0);
      const totalGraded = itemProgressList.reduce((s, i) => s + i.gradedCount, 0);

      assignmentProgressList.push({
        assignment,
        items: itemProgressList,
        totalSubmissions,
        totalGraded,
      });
    }

    const classTotalSubmissions = assignmentProgressList.reduce((s, a) => s + a.totalSubmissions, 0);
    const classTotalGraded = assignmentProgressList.reduce((s, a) => s + a.totalGraded, 0);

    result.push({
      classInfo,
      assignments: assignmentProgressList,
      totalSubmissions: classTotalSubmissions,
      totalGraded: classTotalGraded,
    });
  }

  return result;
}

// ── Fetch student list for a specific item ──────────────────

export async function fetchItemStudents(
  itemId: number,
  classId: number,
): Promise<GradingAttemptInfo[]> {
  // 1. Fetch enrolled students for the class
  const { data: enrollments, error: eError } = await supabase
    .from('classstudents')
    .select('student_id, students(name)')
    .eq('class_id', classId);

  if (eError) throw eError;

  // 2. Fetch attempts for this item first, so we can resolve profile IDs
  const { data: attempts, error: aError } = await supabase
    .from('student_attempts')
    .select('*')
    .eq('published_assignment_item_id', itemId);

  if (aError) throw aError;

  const attemptMap = new Map<string, StudentAttempt>();
  for (const a of attempts ?? []) {
    const existing = attemptMap.get(a.student_profile_id as string);
    if (!existing || (a.created_at as string) > (existing.created_at as string)) {
      attemptMap.set(a.student_profile_id as string, a as StudentAttempt);
    }
  }

  // 3. Resolve profile UUIDs → student IDs + names via SECURITY DEFINER function.
  // profiles RLS blocks teachers from reading other users' profiles, so we use
  // get_profile_to_student_mapping() which safely returns only student_id and name.
  const profileIds = Array.from(attemptMap.keys());
  let profileToStudent = new Map<string, { studentId: number; name: string }>();
  if (profileIds.length > 0) {
    const { data: mappingData, error: mError } = await supabase
      .rpc('get_profile_to_student_mapping', { p_profile_ids: profileIds });
    if (mError) throw mError;
    for (const row of (mappingData ?? []) as unknown as Array<{ profile_id: string; student_id: number; student_name: string }>) {
      profileToStudent.set(row.profile_id, {
        studentId: row.student_id,
        name: row.student_name || 'Unknown',
      });
    }
  }

  // Build student name map from enrollments (fallback for students without attempts)
  const studentNameMap = new Map<number, string>();
  for (const e of enrollments ?? []) {
    const s = e.students as unknown as { name: string } | null;
    if (s && e.student_id) {
      studentNameMap.set(e.student_id as number, s.name);
    }
  }

  // 4. Fetch grading records
  const attemptIds = Array.from(attemptMap.values()).map((a) => a.id);
  let gradedIds = new Set<number>();
  if (attemptIds.length > 0) {
    const { data: gradingData } = await supabase
      .from('grading')
      .select('submission_id, grading_status')
      .in('submission_id', attemptIds);
    for (const g of gradingData ?? []) {
      if ((g.grading_status as string) === 'completed' || (g.grading_status as string) === 'graded') {
        gradedIds.add(g.submission_id as number);
      }
    }
  }

  // 5. Build reverse map: student_id → profile_id
  const studentToProfile = new Map<number, string>();
  for (const [profileId, info] of profileToStudent) {
    studentToProfile.set(info.studentId, profileId);
  }

  // 6. Build the student list
  const result: GradingAttemptInfo[] = [];

  for (const enrollment of enrollments ?? []) {
    const sid = enrollment.student_id as number;
    if (!sid) continue;

    const studentName = studentNameMap.get(sid) ?? 'Unknown';
    const profileId = studentToProfile.get(sid);

    if (!profileId) {
      // Student enrolled but no profile/attempt — show as "Not Started"
      result.push({
        id: 0,
        published_assignment_item_id: itemId,
        student_profile_id: '',
        status: 'in_progress',
        started_at: '',
        submitted_at: null,
        time_limit_seconds: null,
        response_type: 'text' as ResponseType,
        written_response: null,
        audio_path: null,
        word_count: null,
        created_at: '',
        student_name: studentName,
        student_email: '',
      } as GradingAttemptInfo);
      continue;
    }

    const attempt = attemptMap.get(profileId);
    if (!attempt) {
      result.push({
        id: 0,
        published_assignment_item_id: itemId,
        student_profile_id: profileId,
        status: 'in_progress',
        started_at: '',
        submitted_at: null,
        time_limit_seconds: null,
        response_type: 'text' as ResponseType,
        written_response: null,
        audio_path: null,
        word_count: null,
        created_at: '',
        student_name: studentName,
        student_email: '',
      } as GradingAttemptInfo);
      continue;
    }

    const isGraded = gradedIds.has(attempt.id);
    let status: GradingStatus;
    if (isGraded) {
      status = 'graded';
    } else if (attempt.status === 'submitted' || attempt.status === 'auto_submitted') {
      status = 'submitted';
    } else if (attempt.status === 'in_progress') {
      status = 'running';
    } else {
      status = 'not_started';
    }

    result.push({
      ...attempt,
      status: attempt.status,
      student_name: studentName,
      student_email: '',
      ...(status === 'graded' ? { graded: true } : {}),
    } as GradingAttemptInfo);
  }

  return result;
}

// ── Fetch a single attempt for submission viewing ───────────

export async function fetchAttemptForGrading(
  attemptId: number,
): Promise<GradingAttemptInfo | null> {
  const { data: attempt, error } = await supabase
    .from('student_attempts')
    .select('*')
    .eq('id', attemptId)
    .maybeSingle();

  if (error) throw error;
  if (!attempt) return null;

  // Fetch student name via SECURITY DEFINER function.
  // profiles RLS blocks teachers from reading other users' profiles,
  // so we use get_student_name_by_profile() which safely resolves the name.
  const { data: studentName, error: nameError } = await supabase
    .rpc('get_student_name_by_profile', {
      p_profile_id: attempt.student_profile_id as string,
    })
    .maybeSingle();

  if (nameError) throw nameError;

  return {
    ...(attempt as StudentAttempt),
    student_name: (studentName as string) || 'Unknown',
    student_email: '',
  } as GradingAttemptInfo;
}

// ── Fetch the published item for a given attempt ────────────

export async function fetchItemForAttempt(
  attemptId: number,
): Promise<GradingItemInfo | null> {
  const { data: attempt, error: aError } = await supabase
    .from('student_attempts')
    .select('published_assignment_item_id')
    .eq('id', attemptId)
    .maybeSingle();

  if (aError) throw aError;
  if (!attempt) return null;

  const { data: item, error: iError } = await supabase
    .from('published_assignment_items')
    .select('*')
    .eq('id', attempt.published_assignment_item_id as number)
    .maybeSingle();

  if (iError) throw iError;
  return (item as unknown as GradingItemInfo) ?? null;
}

// ── Get audio URL from storage path ────────────────────────

export async function getAudioUrl(audioPath: string): Promise<string | null> {
  const { data } = supabase.storage
    .from('question-images')
    .getPublicUrl(audioPath);
  return data.publicUrl;
}

// ── Compute progress color ──────────────────────────────────

export function computeProgressColor(
  submittedCount: number,
  gradedCount: number,
): ProgressColor {
  if (submittedCount === 0) return 'grey';
  if (gradedCount === 0) return 'red';
  if (gradedCount >= submittedCount) return 'green';
  return 'yellow';
}

// ── Get the IELTS task number label ─────────────────────────

export function getItemTaskLabel(item: GradingItemInfo): string {
  switch (item.type_id) {
    case QUESTION_TYPE_IDS.WRITING_TASK_1:
      return 'Writing Task 1';
    case QUESTION_TYPE_IDS.WRITING_TASK_2:
      return 'Writing Task 2';
    case QUESTION_TYPE_IDS.SPEAKING_PART_1:
      return 'Speaking Part 1';
    case QUESTION_TYPE_IDS.SPEAKING_PART_2:
      return 'Speaking Part 2';
    case QUESTION_TYPE_IDS.SPEAKING_PART_3:
      return 'Speaking Part 3';
    case QUESTION_TYPE_IDS.EXTRA_HOMEWORK:
      return 'Extra Homework';
    case QUESTION_TYPE_IDS.CUSTOM:
      return item.custom_type_name || 'Custom';
    default:
      return item.type_name || 'Unknown';
  }
}
