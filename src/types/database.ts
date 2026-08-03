export type Role = 'admin' | 'teacher' | 'student';

export interface Profile {
  id: string;
  role: Role;
  teacher_id: number | null;
  student_id: number | null;
  created_at: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Teacher {
  id: number;
  name: string;
}

export interface Student {
  id: number;
  name: string;
}

export interface Class {
  id: number;
  name: string;
  class_code: string | null;
}

export interface ClassStudent {
  id: number;
  student_id: number | null;
  class_id: number | null;
}

export interface TeacherClass {
  id: number;
  teacher_id: number;
  class_id: number;
}

// Enriched types used in UI queries
export interface ClassWithStudentCount extends Class {
  student_count: number;
}

export interface ClassWithTeacher extends Class {
  teacher_name?: string;
}

export interface EnrolledClass extends Class {
  enrolled_at?: string;
}

// ── Question Bank ──────────────────────────────────────────

export type ResponseType = 'text' | 'audio';
export type QuestionStatus = 'active' | 'archived';

export interface QuestionType {
  id: number;
  name: string;
}

export interface Question {
  id: number;
  content: string;
  description: string | null;
  ielts_band: string | null;
  category: string | null;
  category_secondary: string | null;
  tags: string[] | null;
  response_type: ResponseType;
  image_url: string | null;
  owner_id: string | null;
  type_id: number;
  category_id: number | null;
  created_by: number | null;
  status: QuestionStatus;
  archived_at: string | null;
  custom_type_name: string | null;
  custom_instructions: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionWithDetails extends Question {
  type_name: string;
  owner_display_name: string;
}

export interface SimilarQuestion {
  id: number;
  content: string;
  type_name: string;
  category: string | null;
  response_type: ResponseType;
  owner_display_name: string;
  sim: number;
}

// ── Assignment Templates ───────────────────────────────────

export type TemplateStatus = 'active' | 'archived';

export interface AssignmentTemplate {
  id: number;
  name: string;
  description: string | null;
  owner_id: string;
  status: TemplateStatus;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentTemplateWithDetails extends AssignmentTemplate {
  owner_display_name: string;
  question_count: number;
}

export interface TemplateQuestion {
  id: number;
  template_id: number;
  question_id: number;
  selection_order: number;
}

export interface DuplicateTemplateResult {
  id: number;
  name: string;
}

// ── Random Question Rules ──────────────────────────────────

export interface RandomQuestionRule {
  id: number;
  template_id: number;
  rule_order: number;
  question_type_id: number;
  response_type: ResponseType;
  category: string | null;
  tags: string[] | null;
  created_at: string;
}

export interface RandomRuleInput {
  question_type_id: number;
  response_type: ResponseType;
  category: string | null;
  tags: string[] | null;
}

// ── Assignment Drafts ──────────────────────────────────────

export type DraftStatus = 'draft' | 'published';

export interface AssignmentDraft {
  id: number;
  name: string;
  description: string | null;
  template_id: number | null;
  class_id: number | null;
  owner_id: string;
  status: DraftStatus;
  created_at: string;
  updated_at: string;
}

export interface AssignmentDraftWithDetails extends AssignmentDraft {
  owner_display_name: string;
  question_count: number;
  class_name: string | null;
  template_name: string | null;
}

export interface AssignmentDraftQuestion {
  id: number;
  draft_id: number;
  question_id: number;
  selection_order: number;
  created_at: string;
  available_from: string | null;
  due_date: string | null;
  due_after_days: number | null;
  timed: boolean;
  time_limit: string | null;
}

export interface ResolveResult {
  draft_id: number;
  unresolved_rules: number;
}

// ── Assignment Items (draft questions with scheduling metadata) ──

export interface AssignmentItem {
  id: number;
  draft_id: number;
  question_id: number;
  selection_order: number;
  available_from: string | null;
  due_date: string | null;
  due_after_days: number | null;
  timed: boolean;
  time_limit: string | null;
  prep_time_seconds: number | null;
  recording_time_seconds: number | null;
  // Joined fields
  type_id?: number;
  type_name?: string;
  content?: string;
  kind: 'question' | 'rule';
  // For random rules (not yet persisted as draft questions):
  rule_type_id?: number;
  rule_response_type?: ResponseType;
  rule_category?: string | null;
  rule_tags?: string[] | null;
}

// ── Published Assignments ───────────────────────────────────

export interface PublishedAssignment {
  id: number;
  draft_id: number;
  class_id: number;
  name: string;
  description: string | null;
  owner_id: string;
  published_at: string;
}

export interface PublishedAssignmentWithDetails extends PublishedAssignment {
  class_name: string;
  item_count: number;
  owner_display_name: string;
  assignment_status?: AssignmentStatus;
}

export interface PublishedAssignmentItem {
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
  tags: string[] | null;
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

// ── Student Attempts ───────────────────────────────────────

export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted';

export interface StudentAttempt {
  id: number;
  published_assignment_item_id: number;
  student_profile_id: string;
  status: AttemptStatus;
  started_at: string;
  submitted_at: string | null;
  time_limit_seconds: number | null;
  response_type: ResponseType;
  written_response: string | null;
  audio_path: string | null;
  word_count: number | null;
  created_at: string;
  feedback: string | null;
  transcript: string | null;
  feedback_published?: boolean;
}

export interface StartAttemptResult {
  attempt_id: number;
  started_at: string;
  time_limit_seconds: number | null;
  response_type: ResponseType;
  status: string;
  already_submitted: boolean;
  submitted_at: string | null;
  item: PublishedAssignmentItem;
}

export type ItemStatus = 'locked' | 'available' | 'completed' | 'overdue';

export interface StudentAssignmentItem extends PublishedAssignmentItem {
  attempt_status: AttemptStatus | null;
  attempt_submitted_at: string | null;
  item_status: ItemStatus;
}

// ── Annotation Engine Types ────────────────────────────────

export interface RubricCriterion {
  id: number;
  name: string;
  display_order: number;
}

export type HighlightColor = 'purple' | 'yellow' | 'green' | 'cyan';

export interface AnnotationComment {
  id: number;
  type: 'text' | 'audio';
  content: string | null;
  audio_path: string | null;
  created_at: string;
}

export interface Annotation {
  id: number;
  attempt_id: number;
  criterion_id: number | null;
  criterion_name: string | null;
  start_offset: number;
  end_offset: number;
  selected_text: string;
  highlight_color: HighlightColor;
  has_text_comment: boolean;
  has_audio_comment: boolean;
  format_bold: boolean;
  format_italic: boolean;
  format_underline: boolean;
  format_strikethrough: boolean;
  text_color: string | null;
  created_at: string;
  updated_at: string;
  comments: AnnotationComment[];
}

export interface TextFormat {
  id: number;
  attempt_id: number;
  start_offset: number;
  end_offset: number;
  format_bold: boolean;
  format_italic: boolean;
  format_underline: boolean;
  format_strikethrough: boolean;
}

export type AssignmentStatus = 'not_started' | 'in_progress' | 'waiting_for_grading' | 'graded';

export interface AssignmentStatusResult {
  item_id: number;
  attempt_status: string | null;
  is_submitted: boolean;
  is_graded: boolean;
}
