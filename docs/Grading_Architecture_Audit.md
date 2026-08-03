# Grading Architecture Audit

**Date:** 2026-08-02
**Purpose:** Full audit of the current Grading subsystem before continuing development.
**Scope:** This report describes the actual current implementation — not the intended design. Nothing is speculated. If something is broken, it is described as currently implemented.

---

## 1. Overall Architecture

### Complete Grading Workflow

```
Teacher opens submission
    │
    │  TeacherGradingPage → fetchGradingHierarchy()
    │  → fetchItemStudents(itemId, classId)
    │  → fetchAttemptForGrading(attemptId)
    │  → renders <AnnotationWorkspace attempt={...} item={...} />
    │
    ▼
Teacher annotates student text
    │
    │  User selects text in <AnnotatableText>
    │  → <FloatingToolbar> appears
    │  → Teacher picks a rubric criterion from dropdown
    │  → createAnnotation() → RPC: save_annotation(p_mode='create')
    │  → INSERT into annotations table
    │  → Annotation appears as highlighted span in AnnotatableText
    │  → Annotation tag appears in ExaminerNotesPanel under that criterion
    │
    │  Optional: Teacher clicks Comment or Audio Comment icon
    │  → createAnnotation() with first criterion as default
    │  → <CommentModal> opens (text or audio mode)
    │  → For audio: MediaRecorder records → uploadAudioComment() → annotation-audio bucket
    │  → saveTextComment()/saveAudioComment() → RPC: save_annotation_comment
    │  → INSERT into annotation_comments table
    │
    ▼
Teacher saves draft feedback
    │
    │  Teacher types in <RichTextEditor> (feedback field)
    │  → Debounced auto-save (1.5s) → saveFeedback() → RPC: save_feedback
    │  → UPDATE student_attempts.feedback via SECURITY DEFINER
    │
    │  For speaking: Teacher types transcript in <textarea>
    │  → Debounced auto-save → saveTranscript() → RPC: save_transcript
    │  → UPDATE student_attempts.transcript via SECURITY DEFINER
    │
    │  Teacher clicks "Save Draft" button
    │  → Immediate saveFeedback() + saveTranscript()
    │  → feedback_published stays false
    │
    ▼
Teacher publishes feedback
    │
    │  Teacher clicks "Publish Feedback" button
    │  → saveFeedback() + saveTranscript() (ensure latest is saved)
    │  → publishFeedback() → RPC: publish_feedback
    │  → UPDATE student_attempts SET feedback_published = true
    │  → INSERT or UPDATE grading record (grading_status = 'completed')
    │  → UI shows "Published" badge
    │
    ▼
Student views feedback
    │
    │  Student opens assignment → StudentAssignmentDetailPage
    │  → fetchAssignmentStatus() → RPC: get_assignment_status
    │  → Status shows "Graded" when grading_status = 'completed'
    │
    │  Student opens submission → SubmissionReview
    │  → CURRENT STATE: Shows question + submitted response only
    │  → Shows "Waiting for grading..." footer (hardcoded, never changes)
    │  → DOES NOT call get_student_feedback RPC
    │  → DOES NOT display feedback, transcript, or annotations
    │  → DOES NOT play audio comments
    │
    │  NOTE: The get_student_feedback RPC EXISTS in the database but is
    │  NOT called from any frontend component. Student feedback viewing
    │  is NOT implemented in the UI.
```

### Components Involved

| Component | File | Role |
|-----------|------|------|
| TeacherGradingPage | `src/pages/teacher/TeacherGradingPage.tsx` | Entry point; class/assignment/item/student navigation hierarchy |
| AnnotationWorkspace | `src/components/annotations/AnnotationWorkspace.tsx` | Main grading workspace; two-column layout; orchestrates all annotation actions |
| AnnotatableText | `src/components/annotations/AnnotatableText.tsx` | Renders student text with highlight overlays; captures text selections |
| FloatingToolbar | `src/components/annotations/FloatingToolbar.tsx` | Appears on text selection; criterion dropdown, color picker, formatting, comment/audio buttons |
| ExaminerNotesPanel | `src/components/annotations/ExaminerNotesPanel.tsx` | Right panel; lists annotations grouped by rubric criterion; supports drag-to-move and delete |
| CommentModal | `src/components/annotations/CommentModal.tsx` | Modal for entering text or recording audio comments |
| RichTextEditor | `src/components/annotations/RichTextEditor.tsx` | ContentEditable rich text editor for feedback |
| SubmissionReview | `src/pages/student/SubmissionReview.tsx` | Student-facing submission review (currently shows only question + response, no feedback) |

### Library Files

| File | Role |
|------|------|
| `src/lib/annotations.ts` | All annotation/feedback/transcript API calls (RPCs + storage) |
| `src/lib/grading.ts` | Grading hierarchy fetch, attempt fetch, student name resolution, audio URL, progress computation |
| `src/lib/attempts.ts` | Student-side attempt start/submit |
| `src/lib/questions.ts` | Question type IDs constants |

---

## 2. Database Tables

### Actively Used Tables

#### `student_attempts`
- **Purpose:** Stores each student's attempt at a published assignment item, including their written response or audio path, word count, feedback, transcript, and publish state.
- **Primary key:** `id` (bigint, auto-increment)
- **Important columns:** `published_assignment_item_id`, `student_profile_id`, `status`, `written_response`, `audio_path`, `word_count`, `feedback`, `transcript`, `feedback_published`, `submitted_at`
- **Foreign keys:** `published_assignment_item_id` → `published_assignment_items.id`, `student_profile_id` → `profiles.id`
- **Current row count:** 4
- **Actively used:** Yes
- **Legacy:** No
- **Redundant:** No

#### `annotations`
- **Purpose:** Stores text highlights created by teachers on student submissions, linked to rubric criteria.
- **Primary key:** `id` (bigint, auto-increment)
- **Important columns:** `attempt_id`, `criterion_id`, `criterion_name`, `start_offset`, `end_offset`, `selected_text`, `highlight_color`, `has_text_comment`, `has_audio_comment`
- **Foreign keys:** `attempt_id` → `student_attempts.id`, `criterion_id` → `rubric_criteria.id`
- **Current row count:** 0
- **Actively used:** Yes (frontend calls create/fetch/delete; no successful records yet)
- **Legacy:** No
- **Redundant:** No

#### `annotation_comments`
- **Purpose:** Stores text or audio comments attached to annotations.
- **Primary key:** `id` (bigint, auto-increment)
- **Important columns:** `annotation_id`, `type` ('text' | 'audio'), `content`, `audio_path`
- **Foreign keys:** `annotation_id` → `annotations.id`
- **Current row count:** 0
- **Actively used:** Yes (frontend calls save/fetch; no records yet)
- **Legacy:** No
- **Redundant:** No

#### `grading`
- **Purpose:** Records grading status for a submission; created/updated when feedback is published.
- **Primary key:** `id` (bigint, auto-increment)
- **Important columns:** `submission_id`, `teacher_id`, `grading_status`, `grading_timestamp`
- **Foreign keys:** `submission_id` → `student_attempts.id`, `teacher_id` → `teachers.id`
- **Current row count:** 0
- **Actively used:** Yes (written by `publish_feedback` RPC; read by `fetchGradingHierarchy` to compute graded count)
- **Legacy:** No
- **Redundant:** No

#### `rubric_criteria`
- **Purpose:** Stores rubric criteria (e.g., Task Achievement, Coherence) per question type.
- **Primary key:** `id` (bigint, auto-increment)
- **Important columns:** `question_type_id`, `name`, `display_order`
- **Foreign keys:** `question_type_id` → `questiontypes.id`
- **Current row count:** 24
- **Actively used:** Yes (fetched by `get_rubric_criteria` RPC; used in FloatingToolbar and ExaminerNotesPanel)
- **Legacy:** No
- **Redundant:** No (but see `rubriccriteria` legacy table below)

#### `published_assignments`
- **Purpose:** Published assignments visible to students; owned by a teacher.
- **Primary key:** `id` (bigint, auto-increment)
- **Important columns:** `name`, `class_id`, `owner_id`, `draft_id`, `published_at`
- **Foreign keys:** `class_id` → `classes.id`, `owner_id` → `profiles.id`, `draft_id` → `assignment_drafts.id`
- **Current row count:** 4
- **Actively used:** Yes
- **Legacy:** No
- **Redundant:** No (but see `publishedassignments` legacy table below)

#### `published_assignment_items`
- **Purpose:** Individual questions within a published assignment; snapshots of questions at publish time.
- **Primary key:** `id` (bigint, auto-increment)
- **Important columns:** `published_assignment_id`, `question_id`, `content`, `type_id`, `response_type`, `selection_order`, `image_url`, `custom_type_name`, `custom_instructions`, `category`, `category_secondary`, `ielts_band`, `description`, `timed`, `time_limit`, `prep_time_seconds`, `recording_time_seconds`, `available_from`, `due_date`, `due_after_days`
- **Foreign keys:** `published_assignment_id` → `published_assignments.id`
- **Current row count:** 7
- **Actively used:** Yes
- **Legacy:** No
- **Redundant:** No

#### `classes`
- **Purpose:** Teacher-created classes that group students and assignments.
- **Primary key:** `id` (bigint, auto-increment)
- **Current row count:** 2
- **Actively used:** Yes
- **Legacy:** No

#### `classstudents`
- **Purpose:** Enrollment junction between students and classes.
- **Primary key:** `id` (implied)
- **Foreign keys:** `class_id` → `classes.id`, `student_id` → `students.id`
- **Current row count:** 2
- **Actively used:** Yes
- **Legacy:** No

#### `students`
- **Purpose:** Student records (separate from auth profiles).
- **Primary key:** `id` (implied)
- **Current row count:** 2
- **Actively used:** Yes
- **Legacy:** No

#### `profiles`
- **Purpose:** Auth user profiles; links to either `teachers` or `students` tables.
- **Primary key:** `id` (uuid, references `auth.users.id`)
- **Foreign keys:** `student_id` → `students.id`, `teacher_id` → `teachers.id`
- **Current row count:** 6
- **Actively used:** Yes
- **Legacy:** No

#### `questiontypes`
- **Purpose:** Lookup table for IELTS question types (Writing Task 1, Speaking Part 1, etc.).
- **Primary key:** `id` (implied)
- **Current row count:** 7
- **Actively used:** Yes
- **Legacy:** No

#### `questions`
- **Purpose:** Teacher's question bank; source content for assignment items.
- **Primary key:** `id` (implied)
- **Foreign keys:** `type_id` → `questiontypes.id`, `owner_id` → `profiles.id`, `created_by` → `teachers.id`, `category_id` → `questioncategories.id`
- **Current row count:** 9
- **Actively used:** Yes
- **Legacy:** No

### Legacy Tables (Zero Rows, RLS Disabled, Not Referenced by Frontend)

| Table | Row Count | RLS | Columns | Status |
|-------|-----------|-----|---------|--------|
| `rubrics` | 0 | Disabled | `id (bigint), name (text)` | Legacy — superseded by `rubric_criteria` which is keyed on `question_type_id` directly |
| `rubriccriteria` | 0 | Disabled | `id (bigint), rubric_id (bigint), name (text)` | Legacy — old camelCase version; superseded by `rubric_criteria` |
| `publishedassignments` | 0 | Disabled | `id (bigint), class_id (bigint), instance_id (bigint), status (text), published_at (timestamptz), archived_at (timestamptz)` | Legacy — old camelCase version; superseded by `published_assignments` |
| `inlineannotations` | 0 | Disabled | `id (bigint), submission_id (bigint), annotation_type (text), annotation_content (text), annotation_position (integer)` | Legacy — old annotation system; superseded by `annotations` + `annotation_comments` |
| `criterionscores` | 0 | Disabled | `id (bigint), grading_id (bigint), criterion_id (bigint), score (integer)` | Legacy — per-criterion scoring; not currently used (band scores not implemented) |
| `generalfeedback` | 0 | Disabled | `id (bigint), grading_id (bigint), strengths (text), weaknesses (text), overall_comments (text), rich_text_feedback (text), suggestions (text)` | Legacy — structured feedback model; superseded by `student_attempts.feedback` (free text) |
| `studentsubmissions` | 0 | Disabled | `id (bigint), assignment_item_id (bigint), student_id (bigint), content (text), file_path (text), file_type (text), status (text), submitted_at (timestamptz)` | Legacy — old submission model; superseded by `student_attempts` |
| `studentassignmentitems` | 0 | Disabled | `id (bigint), assignment_id (bigint), question_id (bigint), student_id (bigint), snapshot_id (bigint), status (text), start_time (timestamptz), end_time (timestamptz), due_at (timestamptz), available_from (timestamptz), time_limit (interval)` | Legacy — old per-student assignment tracking; superseded by `student_attempts` |
| `assignmentdrafts` | 0 | Disabled | `id (bigint), name (text), original_set_id (bigint)` | Legacy — old draft system; superseded by `assignment_drafts` |
| `assignmentdraftitems` | 0 | Disabled | `id (bigint), instance_id (bigint), question_id (bigint)` | Legacy — old draft items; superseded by `assignment_draft_questions` |
| `assignmenttemplates` | 0 | Disabled | `id (bigint), name (text)` | Legacy — old template system; superseded by `assignment_templates` |
| `assignmenttemplateitems` | 0 | Disabled | `id (bigint), set_id (bigint), question_id (bigint)` | Legacy — old template items; superseded by `assignment_template_questions` |

---

## 3. Relationships

```
published_assignments (1)
  ├──▶ published_assignment_items (N)
  │      │
  │      ├──▶ student_attempts (N)     [one attempt per student per item, enforced by unique index]
  │      │      │
  │      │      ├──▶ annotations (N)
  │      │      │      │
  │      │      │      ├──▶ annotation_comments (N)
  │      │      │      │
  │      │      │      └──▶ rubric_criteria (1)   [via criterion_id FK]
  │      │      │
  │      │      └──▶ grading (0..1)                [via submission_id FK]
  │      │             │
  │      │             └──▶ teachers (1)          [via teacher_id FK]
  │      │
  │      └──▶ questions (1)                       [via question_id, source content]
  │
  ├──▶ classes (1)                                 [via class_id FK]
  │      └──▶ classstudents (N)
  │             └──▶ students (1)
  │
  └──▶ assignment_drafts (1)                       [via draft_id FK]
         └──▶ assignment_draft_questions (N)

rubric_criteria (N)
  └──▶ questiontypes (1)                           [via question_type_id FK]

profiles (1)
  ├──▶ students (0..1)                             [via student_id FK]
  └──▶ teachers (0..1)                             [via teacher_id FK]

student_attempts
  └──▶ profiles (1)                                [via student_profile_id FK, references auth user]
```

### Connection Details

1. **published_assignments → published_assignment_items:** One-to-many. Each published assignment contains N snapshot copies of questions. `published_assignment_items.published_assignment_id` → `published_assignments.id`.

2. **published_assignment_items → student_attempts:** One-to-many. Each student can have one attempt per item (enforced by unique index `uniq_one_attempt_per_item` on `(published_assignment_item_id, student_profile_id)`). `student_attempts.published_assignment_item_id` → `published_assignment_items.id`.

3. **student_attempts → annotations:** One-to-many. Each annotation highlights a text range within the student's submission. `annotations.attempt_id` → `student_attempts.id`.

4. **annotations → annotation_comments:** One-to-many. Each annotation can have multiple text or audio comments. `annotation_comments.annotation_id` → `annotations.id`.

5. **annotations → rubric_criteria:** Many-to-one. Each annotation is tagged with a rubric criterion. `annotations.criterion_id` → `rubric_criteria.id` (nullable — criterion can be null but in practice always set).

6. **rubric_criteria → questiontypes:** Many-to-one. Criteria are defined per question type (e.g., Writing Task 1 has its own set). `rubric_criteria.question_type_id` → `questiontypes.id`.

7. **student_attempts → grading:** One-to-zero-or-one. A grading record is created when feedback is published. `grading.submission_id` → `student_attempts.id`.

8. **grading → teachers:** Many-to-one. `grading.teacher_id` → `teachers.id`.

9. **published_assignments → profiles:** Many-to-one (owner). `published_assignments.owner_id` → `profiles.id`. The owner is the teacher who published the assignment.

10. **student_attempts → profiles:** Many-to-one (student). `student_attempts.student_profile_id` → `profiles.id`. The profile's UUID matches the auth user.

---

## 4. RPC Functions

### Annotation RPCs

#### `save_annotation`
- **Purpose:** Create or update an annotation on a student attempt.
- **Parameters:** `p_mode text`, `p_annotation_id bigint`, `p_attempt_id bigint`, `p_criterion_id bigint`, `p_criterion_name text`, `p_start_offset int`, `p_end_offset int`, `p_selected_text text`, `p_highlight_color text`
- **Return type:** `bigint` (the annotation ID)
- **Tables read:** `student_attempts`, `published_assignment_items`, `published_assignments` (via `can_annotate_attempt`)
- **Tables written:** `annotations` (INSERT or UPDATE)
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Indirectly — calls `can_annotate_attempt()` which uses `auth.uid()`
- **Frontend caller:** `src/lib/annotations.ts` → `createAnnotation()` and `updateAnnotation()`, called from `AnnotationWorkspace.tsx`
- **Note:** Two overloads exist — the original with 8 params (no `p_mode`) and the new one with 9 params (including `p_mode`). The frontend uses the 9-param version.

#### `get_attempt_annotations`
- **Purpose:** Fetch all annotations (with nested comments) for a given attempt.
- **Parameters:** `p_attempt_id bigint`
- **Return type:** `json` (array of annotation objects with nested comments)
- **Tables read:** `annotations`, `annotation_comments`
- **Tables written:** None
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** No (but RLS policies on `annotations` and `annotation_comments` enforce access via `can_annotate_attempt` or `owns_attempt`)
- **Frontend caller:** `src/lib/annotations.ts` → `fetchAnnotations()`, called from `AnnotationWorkspace.tsx`

#### `delete_annotation`
- **Purpose:** Delete an annotation and its associated comments (cascade).
- **Parameters:** `p_annotation_id bigint`
- **Return type:** `void`
- **Tables read:** `annotations` (to find attempt_id)
- **Tables written:** `annotations` (DELETE)
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Indirectly via `can_annotate_attempt()`
- **Frontend caller:** `src/lib/annotations.ts` → `deleteAnnotation()`, called from `AnnotationWorkspace.tsx` → `ExaminerNotesPanel`

#### `move_annotation`
- **Purpose:** Move an annotation to a different rubric criterion and change its highlight color.
- **Parameters:** `p_annotation_id bigint`, `p_criterion_id bigint`, `p_highlight_color text`
- **Return type:** `void`
- **Tables read:** `annotations` (to find attempt_id)
- **Tables written:** `annotations` (UPDATE criterion_id, highlight_color)
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Indirectly via `can_annotate_attempt()`
- **Frontend caller:** `src/lib/annotations.ts` → `moveAnnotation()`, called from `AnnotationWorkspace.tsx` → `ExaminerNotesPanel` (drag-and-drop)

#### `save_annotation_comment`
- **Purpose:** Create or update a text or audio comment on an annotation.
- **Parameters:** `p_comment_id bigint`, `p_annotation_id bigint`, `p_type text`, `p_content text`, `p_audio_path text`
- **Return type:** `bigint` (comment ID)
- **Tables read:** `annotations` (to find attempt_id for auth check)
- **Tables written:** `annotation_comments` (INSERT or UPDATE)
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Indirectly via `can_annotate_attempt()`
- **Frontend caller:** `src/lib/annotations.ts` → `saveTextComment()` and `saveAudioComment()`, called from `AnnotationWorkspace.tsx` → `CommentModal`

#### `delete_annotation_comment`
- **Purpose:** Delete a comment from an annotation.
- **Parameters:** `p_comment_id bigint`
- **Return type:** `void`
- **Tables read:** `annotation_comments` (to find annotation_id → attempt_id)
- **Tables written:** `annotation_comments` (DELETE)
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Indirectly via `can_annotate_attempt()`
- **Frontend caller:** `src/lib/annotations.ts` → `deleteComment()` (currently not called from any component)

### Authorization Helper RPCs

#### `can_annotate_attempt`
- **Purpose:** Check if the current authenticated user is the teacher who owns the published assignment for a given attempt.
- **Parameters:** `p_attempt_id bigint`
- **Return type:** `boolean`
- **Tables read:** `student_attempts`, `published_assignment_items`, `published_assignments`
- **Tables written:** None
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Yes — compares `pa.owner_id = auth.uid()`
- **Frontend caller:** Not called directly from frontend; used by other RPCs and RLS policies

#### `owns_attempt`
- **Purpose:** Check if the current authenticated user is the student who owns the attempt.
- **Parameters:** `p_attempt_id bigint`
- **Return type:** `boolean`
- **Tables read:** `student_attempts`
- **Tables written:** None
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Yes — compares `student_profile_id = auth.uid()`
- **Frontend caller:** Not called directly; used by RLS policies on `annotations` and `annotation_comments`

### Feedback & Transcript RPCs

#### `save_feedback`
- **Purpose:** Save teacher feedback text on a student attempt.
- **Parameters:** `p_attempt_id bigint`, `p_feedback text`
- **Return type:** `void`
- **Tables read:** `student_attempts`, `published_assignment_items`, `published_assignments` (via `can_annotate_attempt`)
- **Tables written:** `student_attempts` (UPDATE feedback)
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Indirectly via `can_annotate_attempt()`
- **Frontend caller:** `src/lib/annotations.ts` → `saveFeedback()`, called from `AnnotationWorkspace.tsx` (auto-save + Save Draft + Publish)

#### `save_transcript`
- **Purpose:** Save a transcript on a student attempt (for speaking submissions).
- **Parameters:** `p_attempt_id bigint`, `p_transcript text`
- **Return type:** `void`
- **Tables read:** `student_attempts`, `published_assignment_items`, `published_assignments` (via `can_annotate_attempt`)
- **Tables written:** `student_attempts` (UPDATE transcript)
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Indirectly via `can_annotate_attempt()`
- **Frontend caller:** `src/lib/annotations.ts` → `saveTranscript()`, called from `AnnotationWorkspace.tsx` (auto-save + Save Draft + Publish)

#### `publish_feedback`
- **Purpose:** Mark feedback as published and create/update grading record.
- **Parameters:** `p_attempt_id bigint`
- **Return type:** `void`
- **Tables read:** `student_attempts`, `published_assignment_items`, `published_assignments` (via `can_annotate_attempt`), `grading`
- **Tables written:** `student_attempts` (UPDATE feedback_published = true), `grading` (INSERT or UPDATE)
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Indirectly via `can_annotate_attempt()`
- **Frontend caller:** `src/lib/annotations.ts` → `publishFeedback()`, called from `AnnotationWorkspace.tsx` → Publish Feedback button

#### `unpublish_feedback`
- **Purpose:** Unmark feedback as published (revert to draft).
- **Parameters:** `p_attempt_id bigint`
- **Return type:** `void`
- **Tables read:** `student_attempts`, `published_assignment_items`, `published_assignments` (via `can_annotate_attempt`)
- **Tables written:** `student_attempts` (UPDATE feedback_published = false)
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Indirectly via `can_annotate_attempt()`
- **Frontend caller:** `src/lib/annotations.ts` → `unpublishFeedback()` (currently not called from any component)

#### `get_student_feedback`
- **Purpose:** Allow a student to read their own feedback and transcript only when published.
- **Parameters:** `p_attempt_id bigint`
- **Return type:** `TABLE(feedback text, transcript text, feedback_published boolean)`
- **Tables read:** `student_attempts`
- **Tables written:** None
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Yes — `student_profile_id = auth.uid()` AND `feedback_published = true`
- **Frontend caller:** NONE — RPC exists in database but is not called from any frontend component

### Rubric RPCs

#### `get_rubric_criteria`
- **Purpose:** Fetch rubric criteria for a given question type.
- **Parameters:** `p_question_type_id bigint`
- **Return type:** `TABLE(id bigint, name text, display_order integer)`
- **Tables read:** `rubric_criteria`
- **Tables written:** None
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** No
- **Frontend caller:** `src/lib/annotations.ts` → `fetchRubricCriteria()`, called from `AnnotationWorkspace.tsx`

### Student Name Resolution RPCs

#### `get_student_name_by_profile`
- **Purpose:** Resolve a student's name from their profile UUID.
- **Parameters:** `p_profile_id uuid`
- **Return type:** `text`
- **Tables read:** `profiles`, `students`
- **Tables written:** None
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** No
- **Frontend caller:** `src/lib/grading.ts` → `fetchAttemptForGrading()`

#### `get_profile_to_student_mapping`
- **Purpose:** Batch-resolve profile UUIDs to student IDs and names.
- **Parameters:** `p_profile_ids uuid[]`
- **Return type:** `TABLE(profile_id uuid, student_id bigint, student_name text)`
- **Tables read:** `profiles`, `students`
- **Tables written:** None
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** No
- **Frontend caller:** `src/lib/grading.ts` → `fetchItemStudents()`

#### `get_profile_display_names`
- **Purpose:** Batch-resolve profile UUIDs to display names.
- **Parameters:** `p_profile_ids uuid[]`
- **Return type:** `TABLE(profile_id uuid, display_name text)`
- **Tables read:** `profiles`, `students`, `teachers`
- **Tables written:** None
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** No
- **Frontend caller:** Not currently called from grading flow

### Assignment Status RPC

#### `get_assignment_status`
- **Purpose:** Check submission and grading status for each item in a published assignment for a given student.
- **Parameters:** `p_published_assignment_id bigint`, `p_student_profile_id uuid`
- **Return type:** `TABLE(item_id bigint, attempt_status text, is_submitted boolean, is_graded boolean)`
- **Tables read:** `student_attempts`, `grading`
- **Tables written:** None
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** No (uses passed-in profile ID)
- **Frontend caller:** `src/lib/annotations.ts` → `fetchAssignmentStatus()`, called from student assignment detail page

### Attempt RPCs (Student-Side)

#### `start_attempt`
- **Purpose:** Start a new attempt for a student on a published item.
- **Parameters:** `p_published_item_id bigint`
- **Return type:** `json`
- **Tables read:** `student_attempts`, `published_assignment_items`, `published_assignments`
- **Tables written:** `student_attempts` (INSERT)
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Yes — sets `student_profile_id = auth.uid()`
- **Frontend caller:** `src/lib/attempts.ts` → `startAttempt()`, called from student workspace

#### `submit_attempt`
- **Purpose:** Submit a student's attempt with written response or audio.
- **Parameters:** `p_attempt_id bigint`, `p_written_response text`, `p_audio_path text`, `p_word_count integer`, `p_status text`
- **Return type:** `bigint`
- **Tables read:** `student_attempts`
- **Tables written:** `student_attempts` (UPDATE)
- **SECURITY DEFINER:** Yes
- **Uses `auth.uid()`:** Yes — verifies `student_profile_id = auth.uid()`
- **Frontend caller:** `src/lib/attempts.ts` → `submitAttempt()`, called from student workspace

---

## 5. Row Level Security

### `annotations`

| Command | Policy Name | Predicate | Roles |
|---------|-------------|-----------|-------|
| SELECT | `select_annotations` | `can_annotate_attempt(attempt_id) OR owns_attempt(attempt_id)` | All authenticated |
| INSERT | `insert_annotations` | CHECK: `can_annotate_attempt(attempt_id)` | All authenticated |
| UPDATE | `update_annotations` | USING: `can_annotate_attempt(attempt_id)`, CHECK: `can_annotate_attempt(attempt_id)` | All authenticated |
| DELETE | `delete_annotations` | USING: `can_annotate_attempt(attempt_id)` | All authenticated |

**Summary:** Teachers who own the assignment can do all CRUD. Students who own the attempt can read only.

### `annotation_comments`

| Command | Policy Name | Predicate | Roles |
|---------|-------------|-----------|-------|
| SELECT | `select_annotation_comments` | `EXISTS(... can_annotate_attempt(a.attempt_id) OR owns_attempt(a.attempt_id))` | All authenticated |
| INSERT | `insert_annotation_comments` | CHECK: `EXISTS(... can_annotate_attempt(a.attempt_id))` | All authenticated |
| UPDATE | `update_annotation_comments` | USING + CHECK: `EXISTS(... can_annotate_attempt(a.attempt_id))` | All authenticated |
| DELETE | `delete_annotation_comments` | USING: `EXISTS(... can_annotate_attempt(a.attempt_id))` | All authenticated |

**Summary:** Teachers who own the assignment can do all CRUD. Students who own the attempt can read only.

### `student_attempts`

| Command | Policy Name | Predicate | Roles |
|---------|-------------|-----------|-------|
| SELECT | `select_own_attempts` | `student_profile_id = auth.uid() OR get_my_role() = 'admin'` | All authenticated |
| SELECT | `select_attempts_for_teachers` | `get_my_role() = 'admin' OR published_assignment_item_id IN (... owner_id = auth.uid() ...)` | All authenticated |
| UPDATE | `update_own_attempts` | USING + CHECK: `student_profile_id = auth.uid() OR get_my_role() = 'admin'` | All authenticated |
| INSERT | (none) | — | — |
| DELETE | (none) | — | — |

**Summary:** Students can read their own attempts. Teachers can read attempts for assignments they own. Only students or admins can UPDATE. No INSERT or DELETE policies — inserts happen via `start_attempt` SECURITY DEFINER RPC, deletes are not supported.

**Critical note:** Teachers cannot directly UPDATE `student_attempts`. The `save_feedback`, `save_transcript`, and `publish_feedback` RPCs bypass RLS via SECURITY DEFINER.

### `grading`

| Command | Policy Name | Predicate | Roles |
|---------|-------------|-----------|-------|
| SELECT | `select_grading_for_teachers` | `get_my_role() = 'admin' OR submission_id IN (... owner_id = auth.uid() ...)` | All authenticated |
| INSERT | `insert_grading_for_teachers` | CHECK: `get_my_role() = 'admin' OR submission_id IN (... owner_id = auth.uid() ...)` | All authenticated |
| UPDATE | `update_grading_for_teachers` | USING + CHECK: `get_my_role() = 'admin' OR submission_id IN (... owner_id = auth.uid() ...)` | All authenticated |
| DELETE | (none) | — | — |

**Summary:** Teachers who own the assignment can read, create, and update grading records. No DELETE policy. The `publish_feedback` RPC also writes to this table via SECURITY DEFINER.

### `published_assignments`

| Command | Policy Name | Predicate | Roles |
|---------|-------------|-----------|-------|
| SELECT | `select_published` | `owner_id = auth.uid() OR get_my_role() = 'admin' OR class_id IN (... enrolled student ...)` | All authenticated |
| INSERT | `insert_published` | CHECK: `owner_id = auth.uid()` | All authenticated |
| UPDATE | `update_published` | USING + CHECK: `owner_id = auth.uid() OR get_my_role() = 'admin'` | All authenticated |
| DELETE | `delete_published` | USING: `owner_id = auth.uid() OR get_my_role() = 'admin'` | All authenticated |

**Summary:** Teachers own their assignments. Students can read assignments for classes they're enrolled in.

### `published_assignment_items`

| Command | Policy Name | Predicate | Roles |
|---------|-------------|-----------|-------|
| SELECT | `select_published_items` | `published_assignment_id IN (... owner_id = auth.uid() OR admin OR enrolled student ...)` | All authenticated |
| INSERT | `insert_published_items` | CHECK: `published_assignment_id IN (... owner_id = auth.uid() OR admin ...)` | All authenticated |
| UPDATE | `update_published_items` | USING + CHECK: same as insert | All authenticated |
| DELETE | `delete_published_items` | USING: same as insert | All authenticated |

**Summary:** Teachers who own the parent assignment have full CRUD. Students enrolled in the class can read.

### `rubric_criteria`

| Command | Policy Name | Predicate | Roles |
|---------|-------------|-----------|-------|
| SELECT | `read_rubric_criteria` | `true` | All authenticated |
| INSERT | (none) | — | — |
| UPDATE | (none) | — | — |
| DELETE | (none) | — | — |

**Summary:** Publicly readable by all authenticated users. No write policies — criteria are managed via migrations only.

### `questions`

| Command | Policy Name | Predicate | Roles |
|---------|-------------|-----------|-------|
| SELECT | (policy exists — not fully captured in this audit) | Owner-scoped + admin | All authenticated |
| INSERT/UPDATE/DELETE | (policies exist) | Owner-scoped + admin | All authenticated |

### `classes`

| Command | Policy Name | Predicate | Roles |
|---------|-------------|-----------|-------|
| SELECT | (policy exists) | Owner (teacher) or admin or enrolled student | All authenticated |
| INSERT | `insert_classes` | CHECK: `get_my_role() IN ('teacher', 'admin') AND can_create_class()` | All authenticated |
| UPDATE/DELETE | (policies exist) | Owner or admin | All authenticated |

### `classstudents`

| Command | Policy Name | Predicate | Roles |
|---------|-------------|-----------|-------|
| SELECT | (policy exists) | Teacher who owns the class or admin or enrolled student | All authenticated |
| INSERT/DELETE | (policies exist) | Teacher who owns the class or admin | All authenticated |

### `students`

| Command | Policy Name | Predicate | Roles |
|---------|-------------|-----------|-------|
| SELECT | (policy exists) | Teacher or admin or self | All authenticated |
| INSERT/UPDATE/DELETE | (policies exist) | Admin only | All authenticated |

---

## 6. Frontend Workflow

### Teacher Actions

#### Open Submission

1. **Component:** `TeacherGradingPage.tsx` → renders class/assignment/item/student navigation
2. **RPCs called:**
   - `fetchGradingHierarchy()` → direct Supabase queries on `published_assignments`, `published_assignment_items`, `student_attempts`, `grading`, `classstudents`
   - `fetchItemStudents(itemId, classId)` → queries `classstudents`, `student_attempts`; calls `get_profile_to_student_mapping` RPC
   - `fetchAttemptForGrading(attemptId)` → queries `student_attempts`; calls `get_student_name_by_profile` RPC
3. **Tables affected:** `published_assignments` (read), `published_assignment_items` (read), `student_attempts` (read), `grading` (read), `classstudents` (read), `profiles` + `students` (read via RPC)
4. **Result:** Renders `<AnnotationWorkspace>` with attempt + item data

#### Create Annotation

1. **Component:** `AnnotationWorkspace.tsx` → `AnnotatableText` captures selection → `FloatingToolbar` appears
2. **RPC called:** `save_annotation(p_mode='create', p_attempt_id, p_criterion_id, p_criterion_name, p_start_offset, p_end_offset, p_selected_text, p_highlight_color)`
3. **Tables affected:** `annotations` (INSERT), `student_attempts`/`published_assignment_items`/`published_assignments` (read via `can_annotate_attempt`)
4. **Result:** New annotation row; UI updates with highlight + tag in ExaminerNotesPanel

#### Delete Annotation

1. **Component:** `AnnotationWorkspace.tsx` → `ExaminerNotesPanel` → delete button on annotation tag
2. **RPC called:** `delete_annotation(p_annotation_id)`
3. **Tables affected:** `annotations` (DELETE), `annotation_comments` (cascade DELETE)
4. **Result:** Annotation removed from UI

#### Move Annotation

1. **Component:** `AnnotationWorkspace.tsx` → `ExaminerNotesPanel` → drag tag to different criterion
2. **RPC called:** `move_annotation(p_annotation_id, p_criterion_id, p_highlight_color)`
3. **Tables affected:** `annotations` (UPDATE criterion_id, highlight_color)
4. **Result:** Annotation tag moves to new criterion group in UI

#### Save Draft

1. **Component:** `AnnotationWorkspace.tsx` → "Save Draft" button (also auto-saves on 1.5s debounce)
2. **RPCs called:**
   - `save_feedback(p_attempt_id, p_feedback)`
   - `save_transcript(p_attempt_id, p_transcript)` (speaking only)
3. **Tables affected:** `student_attempts` (UPDATE feedback, transcript)
4. **Result:** "Saved" toast appears; `feedback_published` stays false

#### Publish Feedback

1. **Component:** `AnnotationWorkspace.tsx` → "Publish Feedback" button
2. **RPCs called (in sequence):**
   - `save_feedback(p_attempt_id, p_feedback)`
   - `save_transcript(p_attempt_id, p_transcript)` (speaking only)
   - `publish_feedback(p_attempt_id)`
3. **Tables affected:** `student_attempts` (UPDATE feedback_published = true), `grading` (INSERT or UPDATE grading_status = 'completed')
4. **Result:** "Published" badge appears; assignment shows as "Graded" in student dashboard

#### Add Text Comment

1. **Component:** `AnnotationWorkspace.tsx` → `FloatingToolbar` → Comment icon → `CommentModal` (text mode)
2. **RPCs called:**
   - `save_annotation(p_mode='create', ...)` (creates annotation first, using first criterion as default)
   - `save_annotation_comment(p_annotation_id, p_type='text', p_content)`
3. **Tables affected:** `annotations` (INSERT), `annotation_comments` (INSERT)
4. **Result:** Comment saved; annotation tag shows text comment indicator

#### Add Audio Comment

1. **Component:** `AnnotationWorkspace.tsx` → `FloatingToolbar` → Audio icon → `CommentModal` (audio mode)
2. **RPCs called:**
   - `save_annotation(p_mode='create', ...)` (creates annotation first)
   - `uploadAudioComment()` → Supabase Storage `annotation-audio` bucket (upload)
   - `save_annotation_comment(p_annotation_id, p_type='audio', p_audio_path)`
3. **Tables affected:** `annotations` (INSERT), `annotation_comments` (INSERT), Storage bucket `annotation-audio`
4. **Result:** Audio comment saved; annotation tag shows audio comment indicator

### Student Actions

#### Open Completed Submission

1. **Component:** `SubmissionReview.tsx`
2. **RPCs/queries called:**
   - `fetchAttemptForItem(item.id)` → queries `student_attempts` directly
   - `supabase.storage.from('question-images').getPublicUrl(audio_path)` (for speaking)
3. **Tables affected:** `student_attempts` (read), `published_assignment_items` (read via join)
4. **Result:** Shows question text + submitted response (essay or audio player)
5. **Note:** Does NOT fetch or display feedback, transcript, or annotations

#### View Feedback

1. **Component:** `SubmissionReview.tsx`
2. **Status:** NOT IMPLEMENTED — the `get_student_feedback` RPC exists in the database but is not called from any frontend component
3. **Current behavior:** Shows a hardcoded "Waiting for grading..." footer regardless of actual grading status

#### View Annotation

1. **Component:** None
2. **Status:** NOT IMPLEMENTED — no student-facing component renders annotations on their submission

#### Play Audio Comment

1. **Component:** None
2. **Status:** NOT IMPLEMENTED — no student-facing component plays audio comments

---

## 7. Canonical Data Sources

| Data | Canonical Location | Competing Sources | Notes |
|------|-------------------|-------------------|-------|
| **Transcript** | `student_attempts.transcript` (text column) | None | Written by `save_transcript` RPC; read by `get_student_feedback` RPC (not yet called from UI) |
| **Feedback** | `student_attempts.feedback` (text column, stores HTML) | `generalfeedback.rich_text_feedback` (legacy, 0 rows) | The legacy `generalfeedback` table has structured fields (strengths, weaknesses, suggestions) but is unused. Current system uses a single free-text HTML field. |
| **Annotations** | `annotations` table | `inlineannotations` table (legacy, 0 rows) | Legacy `inlineannotations` had a different schema (annotation_type, annotation_content, annotation_position). Current system uses start/end offsets + criterion linking. |
| **Grading status** | `grading.grading_status` (text column) | `student_attempts.feedback_published` (boolean) | Two separate fields track related concepts. `grading_status` = 'completed' is set by `publish_feedback` RPC. `feedback_published` = true is also set by the same RPC. Both are set together but stored in different tables. |
| **Rubric** | `rubric_criteria` table (keyed by `question_type_id`) | `rubrics` + `rubriccriteria` (legacy, 0 rows) | Legacy system had a two-level structure (rubric → criteria). Current system has a flat list of criteria per question type. |
| **Band score** | Not yet implemented | `criterionscores` table (legacy, 0 rows) | Legacy table had `grading_id`, `criterion_id`, `score` columns. No current mechanism for storing per-criterion band scores. The `ExaminerNotesPanel` shows a "Band Score" placeholder with "—" but no input mechanism. |

---

## 8. Current Problems

### 8.1 Student Feedback Viewing Not Implemented

The `get_student_feedback` RPC exists and correctly enforces that only the owning student can read published feedback. However, `SubmissionReview.tsx` does not call it. The student-facing submission review shows only the question and the student's own response, with a hardcoded "Waiting for grading..." message that never changes.

### 8.2 Duplicate `save_annotation` RPC Overload

Two overloads of `save_annotation` exist in the database:
- 8-parameter version (original, no `p_mode`)
- 9-parameter version (new, with `p_mode text`)

The frontend uses the 9-parameter version. The 8-parameter version is dead code that could cause confusion if called with wrong parameters.

### 8.3 `unpublish_feedback` RPC Not Called

The `unpublish_feedback` RPC exists in the database and in `src/lib/annotations.ts` but is never called from any UI component. There is no "Unpublish" button.

### 8.4 `deleteComment` Function Not Called

The `deleteComment` function exists in `src/lib/annotations.ts` (calls `delete_annotation_comment` RPC) but is not called from any UI component. Teachers cannot delete individual comments.

### 8.5 Dual Grading Status Tracking

Both `grading.grading_status` and `student_attempts.feedback_published` track whether feedback has been published. They are set together by the `publish_feedback` RPC, but having two sources of truth creates a risk of desynchronization. The `fetchGradingHierarchy` function in `grading.ts` reads `grading.grading_status` to compute graded counts, while the student-side `get_assignment_status` RPC also reads `grading.grading_status`. The `feedback_published` column is only read by `get_student_feedback`.

### 8.6 Legacy Tables with RLS Disabled

12 legacy tables exist with RLS disabled and zero rows:
- `rubrics`, `rubriccriteria`, `publishedassignments`, `inlineannotations`, `criterionscores`, `generalfeedback`, `studentsubmissions`, `studentassignmentitems`, `assignmentdrafts`, `assignmentdraftitems`, `assignmenttemplates`, `assignmenttemplateitems`

These tables are not referenced by any frontend code. They appear to be remnants of earlier schema iterations. Having RLS disabled means they are accessible to any role if someone queries them directly.

### 8.7 `student_attempts` Has No INSERT or DELETE RLS Policies

INSERTs are handled by the `start_attempt` SECURITY DEFINER RPC (bypasses RLS). But the lack of an INSERT policy means no direct insert from the client could ever work — this is intentional but should be documented. The lack of a DELETE policy means attempts cannot be deleted via the client (only via admin or database-level operations).

### 8.8 `grading` Table Has No DELETE Policy

Grading records cannot be deleted via the Supabase client. This means if a teacher publishes feedback (creating a grading record) and then wants to retract it, the grading record persists even if `unpublish_feedback` sets `feedback_published = false`. The grading status remains 'completed'.

### 8.9 Band Score Placeholder in ExaminerNotesPanel

The `ExaminerNotesPanel` renders a "Band Score" label with a "—" placeholder for each criterion. There is no input field, no save mechanism, and no database column to store band scores (the legacy `criterionscores` table is unused). This is a UI element with no backing functionality.

### 8.10 `get_profile_display_names` RPC Not Used in Grading Flow

The `get_profile_display_names` RPC exists but is not called from any grading-related code. It may be used elsewhere in the app, but it represents an additional name-resolution RPC alongside `get_student_name_by_profile` and `get_profile_to_student_mapping`.

### 8.11 Audio Comment Storage Bucket vs Question Image Bucket

Audio comments are stored in the `annotation-audio` storage bucket. Student speaking responses are stored in the `question-images` bucket (despite the name). The `getAudioUrl` function in `grading.ts` reads from `question-images`, while `getAudioCommentUrl` in `annotations.ts` reads from `annotation-audio`. This split is intentional but the `question-images` bucket name is misleading for audio content.

### 8.12 `save_annotation_comment` Parameter Naming Inconsistency

The `save_annotation_comment` RPC accepts `p_comment_id` as the first parameter (for update) or null (for insert). The frontend passes `commentId ?? null`. This follows the same pattern that caused the original `save_annotation` bug (null vs omitted parameter). However, since `save_annotation_comment` explicitly checks `p_comment_id IS NOT NULL`, and Supabase sends null when undefined, this works correctly for inserts — but only because the INSERT branch is the fallback, not the primary branch.

---

## 9. Frontend vs Database Mapping

### Teacher Grading Page — Class/Assignment/Item Explorer

```
TeacherGradingPage.tsx
  ↓
fetchGradingHierarchy()  [src/lib/grading.ts]
  ↓
Direct Supabase queries (no RPC):
  - published_assignments (SELECT)
  - published_assignment_items (SELECT)
  - student_attempts (SELECT)
  - grading (SELECT)
  - classstudents (SELECT count)
  ↓
Stored columns: id, name, class_id, owner_id, published_at, published_assignment_id,
               question_id, content, type_id, response_type, selection_order, status,
               submitted_at, grading_status, submission_id
```

### Teacher Grading Page — Student List

```
TeacherGradingPage.tsx
  ↓
fetchItemStudents(itemId, classId)  [src/lib/grading.ts]
  ↓
Direct Supabase queries:
  - classstudents (SELECT student_id, students.name)
  - student_attempts (SELECT *)
  RPC: get_profile_to_student_mapping(p_profile_ids)
  ↓
Stored columns: student_id, name, student_profile_id, status, submitted_at,
               written_response, audio_path, word_count, feedback, transcript
```

### Teacher Grading Page — Submission Viewer

```
TeacherGradingPage.tsx → SubmissionViewer
  ↓
fetchAttemptForGrading(attemptId)  [src/lib/grading.ts]
  ↓
Direct Supabase query:
  - student_attempts (SELECT *)
  RPC: get_student_name_by_profile(p_profile_id)
  ↓
Stored columns: id, status, written_response, audio_path, word_count,
               feedback, transcript, feedback_published, submitted_at,
               student_profile_id, published_assignment_item_id
  ↓
Renders: <AnnotationWorkspace attempt={...} item={...} />
```

### Annotation Workspace

```
AnnotationWorkspace.tsx
  ↓
On mount:
  RPC: get_rubric_criteria(p_question_type_id) → rubric_criteria (read)
  RPC: get_attempt_annotations(p_attempt_id) → annotations + annotation_comments (read)
  ↓
On text selection + criterion pick:
  RPC: save_annotation(p_mode='create', ...) → annotations (write)
  ↓
On delete annotation:
  RPC: delete_annotation(p_annotation_id) → annotations (delete)
  ↓
On move annotation (drag):
  RPC: move_annotation(p_annotation_id, p_criterion_id, p_highlight_color) → annotations (update)
  ↓
On add text comment:
  RPC: save_annotation(p_mode='create', ...) → annotations (write)
  RPC: save_annotation_comment(p_annotation_id, p_type='text', p_content) → annotation_comments (write)
  ↓
On add audio comment:
  RPC: save_annotation(p_mode='create', ...) → annotations (write)
  Storage: annotation-audio bucket (upload)
  RPC: save_annotation_comment(p_annotation_id, p_type='audio', p_audio_path) → annotation_comments (write)
  ↓
On feedback auto-save / Save Draft:
  RPC: save_feedback(p_attempt_id, p_feedback) → student_attempts.feedback (update)
  RPC: save_transcript(p_attempt_id, p_transcript) → student_attempts.transcript (update)
  ↓
On Publish Feedback:
  RPC: save_feedback(...) → student_attempts.feedback (update)
  RPC: save_transcript(...) → student_attempts.transcript (update)
  RPC: publish_feedback(p_attempt_id) → student_attempts.feedback_published (update) + grading (insert/update)
```

### Student Submission Review

```
SubmissionReview.tsx
  ↓
fetchAttemptForItem(item.id)  [src/lib/attempts.ts]
  ↓
Direct Supabase query:
  - student_attempts (SELECT) WHERE published_assignment_item_id = item.id
  Storage: question-images bucket (getPublicUrl for audio_path)
  ↓
Stored columns: id, status, written_response, audio_path, word_count, submitted_at
  ↓
Renders: Question text + submitted response (essay or audio player)
  Footer: Hardcoded "Waiting for grading..." (never changes)
  ↓
DOES NOT CALL: get_student_feedback RPC
DOES NOT DISPLAY: feedback, transcript, annotations, audio comments
```

### Student Assignment Detail (Status Check)

```
StudentAssignmentDetailPage.tsx
  ↓
fetchAssignmentStatus(publishedAssignmentId, studentProfileId)  [src/lib/annotations.ts]
  ↓
RPC: get_assignment_status(p_published_assignment_id, p_student_profile_id)
  ↓
Reads: student_attempts (status), grading (grading_status)
  ↓
Returns: item_id, attempt_status, is_submitted, is_graded
  ↓
UI shows: "Not Started" / "In Progress" / "Waiting for Grading" / "Graded"
```

---

## 10. Recommendations

*The following are recommendations only. No changes are implemented.*

### Redundant Objects (Candidates for Removal)

1. **`rubrics` table** — 0 rows, RLS disabled, not referenced. Superseded by `rubric_criteria` which is keyed directly on `question_type_id`. Safe to remove.

2. **`rubriccriteria` table** — 0 rows, RLS disabled, not referenced. Old camelCase version of `rubric_criteria`. Safe to remove.

3. **`publishedassignments` table** — 0 rows, RLS disabled, not referenced. Old camelCase version of `published_assignments`. Safe to remove.

4. **`inlineannotations` table** — 0 rows, RLS disabled, not referenced. Old annotation system. Superseded by `annotations` + `annotation_comments`. Safe to remove.

5. **`criterionscores` table** — 0 rows, RLS disabled, not referenced. Per-criterion scoring not implemented. Safe to remove (or repurpose if band scores are added).

6. **`generalfeedback` table** — 0 rows, RLS disabled, not referenced. Structured feedback model abandoned in favor of `student_attempts.feedback`. Safe to remove.

7. **`studentsubmissions` table** — 0 rows, RLS disabled, not referenced. Old submission model. Superseded by `student_attempts`. Safe to remove.

8. **`studentassignmentitems` table** — 0 rows, RLS disabled, not referenced. Old per-student assignment tracking. Superseded by `student_attempts`. Safe to remove.

9. **`assignmentdrafts` table** — 0 rows, RLS disabled, not referenced. Old draft system. Superseded by `assignment_drafts`. Safe to remove.

10. **`assignmentdraftitems` table** — 0 rows, RLS disabled, not referenced. Old draft items. Superseded by `assignment_draft_questions`. Safe to remove.

11. **`assignmenttemplates` table** — 0 rows, RLS disabled, not referenced. Old template system. Superseded by `assignment_templates`. Safe to remove.

12. **`assignmenttemplateitems` table** — 0 rows, RLS disabled, not referenced. Old template items. Superseded by `assignment_template_questions`. Safe to remove.

13. **8-parameter `save_annotation` overload** — The original RPC without `p_mode` is dead code. The frontend exclusively uses the 9-parameter version. Safe to remove.

### Obsolete Objects

14. **`unpublish_feedback` RPC** — Exists in database and frontend lib but never called from UI. Either add an "Unpublish" button or remove.

15. **`deleteComment` function** — Exists in `annotations.ts` but never called from UI. Either add a delete-comment button in the comment display or remove.

16. **`get_profile_display_names` RPC** — Not used in grading flow. May be used elsewhere; if not, candidate for removal.

### Possible Simplifications

17. **Dual grading status** — Consider consolidating `grading.grading_status` and `student_attempts.feedback_published` into a single source of truth. Currently both are set by `publish_feedback` but read by different code paths, creating a desync risk.

18. **Three name-resolution RPCs** — `get_student_name_by_profile`, `get_profile_to_student_mapping`, and `get_profile_display_names` all resolve profile UUIDs to names. Consider consolidating into one flexible RPC.

19. **`question-images` bucket for audio** — Student speaking audio is stored in a bucket named `question-images`. Consider creating a dedicated `student-audio` bucket or renaming for clarity.

20. **Band score placeholder** — The "Band Score —" display in `ExaminerNotesPanel` has no backing functionality. Either implement band score input/storage or remove the placeholder to avoid confusion.

21. **Hardcoded "Waiting for grading..." in SubmissionReview** — This footer should be conditional on actual grading status, or removed entirely once feedback viewing is implemented.

### Missing Functionality (Not Yet Implemented)

22. **Student feedback viewing** — The `get_student_feedback` RPC exists but no UI calls it. `SubmissionReview.tsx` needs to be extended to fetch and display published feedback, transcript, annotations, and audio comments.

23. **Student annotation viewing** — No component renders annotations on the student's submission text. The `AnnotatableText` component is designed for teacher annotation creation; a read-only variant would be needed for students.

24. **Student audio comment playback** — No student-facing component plays audio comments. The `getAudioCommentUrl` function exists in `annotations.ts` but is not called from any student page.

25. **Band score input** — No UI or database mechanism for teachers to assign per-criterion band scores. The legacy `criterionscores` table exists but is unused.
