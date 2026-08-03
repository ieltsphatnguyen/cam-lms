# Project Architecture Index

**Last Updated:** v0.9.1 (2026-08-03)
**Status:** Source of truth for all development

This is the only file that needs to be read first. It indexes every subsystem and links to its detailed architecture document.

---

## System Overview

The Class Assignment Management (CAM) system is an IELTS-focused educational platform built with React + Vite + TypeScript on the frontend and Supabase (PostgreSQL + Auth + Storage + Edge Functions) on the backend. It supports three roles: admin, teacher, and student.

For the full system architecture, see `01_System_Architecture.md`.

---

## Subsystem: Authentication

**Purpose**
Handles user sign-in, registration, password recovery, session management, and role-based access control. Three roles: admin, teacher, student.

**Primary Pages**
- `src/pages/auth/LoginPage.tsx`
- `src/pages/auth/RegisterPage.tsx`
- `src/pages/auth/ForgotPasswordPage.tsx`
- `src/pages/auth/ResetPasswordPage.tsx`
- `src/pages/shared/ProfilePage.tsx`

**Primary Components**
- `src/contexts/AuthContext.tsx` — Auth provider, session state, profile fetching

**Database Tables**
- `profiles` — user role, display name, avatar, teacher/student links
- `teachers` — teacher records
- `students` — student records
- `audit_log` — admin action audit trail

**RPCs**
- `register_student` (Edge Function)
- `create_teacher` (Edge Function)
- `setup_admin` (Edge Function)
- `admin_user_management` (Edge Function)

**Storage Buckets**
- `avatars` — user profile pictures

**Current Status**
Frozen

**Last Updated Version**
v0.8.2

**Architecture File**
`04_Authentication_Architecture.md`

---

## Subsystem: Question Bank

**Purpose**
Manages the library of IELTS questions (Writing Task 1/2, Speaking Part 1/2/3, Extra Homework, Custom). Supports CRUD, archiving, duplication, similarity search, image uploads, and tag/category filtering.

**Primary Pages**
- `src/pages/teacher/TeacherQuestionLibraryPage.tsx` (also used by admin)

**Primary Components**
- `src/components/questions/QuestionForm.tsx`
- `src/components/questions/QuestionPreview.tsx`
- `src/components/questions/SimilarQuestionsDialog.tsx`

**Database Tables**
- `questions` — question content, type, category, tags, status
- `questiontypes` — 7 built-in question types
- `question_categories` — category lookup

**RPCs**
- `search_similar_questions` — pg_trigram similarity search

**Storage Buckets**
- `question-images` — question images (Writing Task 1, Speaking Part 2, Custom)

**Current Status**
Frozen

**Last Updated Version**
v0.8.2

**Architecture File**
`05_QuestionBank_Architecture.md`

---

## Subsystem: Assignment Templates

**Purpose**
Reusable collections of questions that teachers save as presets. Supports fixed question lists, random question rules, duplication detection, and favorites.

**Primary Pages**
- `src/pages/teacher/TeacherAssignmentTemplatesPage.tsx`

**Primary Components**
- `src/components/templates/TemplateForm.tsx`
- `src/components/templates/TemplatePreview.tsx`
- `src/components/templates/PresetBrowser.tsx`
- `src/components/templates/DuplicateTemplateDialog.tsx`

**Database Tables**
- `assignment_templates` — template metadata
- `assignment_template_questions` — junction: template ↔ questions
- `assignment_template_random_rules` — random question selection rules
- `assignment_template_favorites` — user favorites

**RPCs**
- `check_duplicate_template` — detects identical question sets
- `resolve_template_to_draft` — resolves template (including random rules) into a draft
- `resolve_random_rule` — resolves a single random rule to a question ID

**Storage Buckets**
None

**Current Status**
Frozen

**Last Updated Version**
v0.8.2

**Architecture File**
`06_Assignment_Architecture.md`

---

## Subsystem: Assignment Drafts & Publishing

**Purpose**
Working documents that teachers configure with scheduling metadata (available_from, due_date, time limits) before publishing to a class. Supports resolving templates, adding individual questions, and publishing/unpublishing.

**Primary Pages**
- `src/pages/teacher/TeacherAssignmentsPage.tsx`

**Primary Components**
- (Uses TemplateForm, QuestionForm for composition)

**Database Tables**
- `assignment_drafts` — draft metadata, class assignment, status
- `assignment_draft_questions` — junction: draft ↔ questions with scheduling metadata

**RPCs**
- `resolve_template_to_draft`
- `publish_draft` — creates published assignment + items from draft
- `unpublish_draft` — removes published assignment

**Storage Buckets**
None

**Current Status**
Frozen

**Last Updated Version**
v0.8.2

**Architecture File**
`06_Assignment_Architecture.md`

---

## Subsystem: Published Assignments & Student Attempts

**Purpose**
Published assignments are immutable snapshots visible to enrolled students. Students start attempts, submit written or audio responses, and receive grades.

**Primary Pages**
- `src/pages/student/StudentAssignmentsPage.tsx`
- `src/pages/student/StudentAssignmentDetailPage.tsx`
- `src/pages/student/StudentWorkspace.tsx`
- `src/pages/student/WritingWorkspace.tsx`
- `src/pages/student/SpeakingWorkspace.tsx`
- `src/pages/student/PreFlightCheck.tsx`

**Primary Components**
- `src/pages/student/StudentWorkspace.tsx` — routes to Writing/Speaking workspace

**Database Tables**
- `published_assignments` — immutable assignment snapshot
- `published_assignment_items` — immutable item snapshot with scheduling
- `student_attempts` — student responses (text or audio), status, timestamps

**RPCs**
- `start_attempt` — creates/locks attempt, returns question content
- `submit_attempt` — submits written or audio response

**Storage Buckets**
- `question-images` — student audio uploads (`student-audio/{uid}/` paths)

**Current Status**
Frozen

**Last Updated Version**
v0.8.2

**Architecture File**
`06_Assignment_Architecture.md`

---

## Subsystem: Annotation Engine

**Purpose**
Teachers annotate student submissions by highlighting text and assigning rubric criteria. Supports text comments, audio comments, and independent text formatting (bold, italic, underline, strikethrough). Formatting is decoupled from annotations — it does NOT create annotations, comments, highlights, or criterion assignments. Used for both Writing and Speaking (transcript) annotations.

**Primary Pages**
- (Rendered within `TeacherGradingPage`)

**Primary Components**
- `src/components/annotations/AnnotationWorkspace.tsx` — main workspace
- `src/components/annotations/AnnotatableText.tsx` — segmented text display with highlights
- `src/components/annotations/FloatingToolbar.tsx` — criterion dropdown + formatting toolbar
- `src/components/annotations/CommentModal.tsx` — text/audio comment modal
- `src/components/annotations/RichTextEditor.tsx` — feedback editor
- `src/components/annotations/ExaminerNotesPanel.tsx` — criterion-grouped annotation list

**Database Tables**
- `annotations` — highlight ranges, criterion, comment flags (teacher draft)
- `annotation_comments` — text/audio comments per annotation (teacher draft)
- `text_formats` — independent text formatting layer (teacher draft)
- `rubric_criteria` — criteria per question type
- `published_annotation_snapshots` — immutable published snapshot (student reads)
- `published_text_format_snapshots` — immutable published text format snapshot (student reads)
- `criterion_scores` — per-criterion scores 0.0–9.0 or NULL (teacher draft)
- `published_score_snapshots` — immutable published score snapshot (student reads)
- `notifications` — dashboard notifications for teachers and students

**RPCs**
- `get_rubric_criteria`
- `get_attempt_annotations` (teacher)
- `get_published_annotations` (student, reads from snapshots)
- `save_annotation` (create/update modes)
- `delete_annotation`
- `move_annotation`
- `save_annotation_comment`
- `delete_annotation_comment`
- `get_text_formats` (teacher)
- `get_published_text_formats` (student, reads from snapshots)
- `save_text_format`
- `delete_text_format`
- `save_feedback`
- `save_transcript`
- `publish_feedback` (snapshots annotations + text formats, marks published)
- `unpublish_feedback`
- `get_student_feedback`
- `get_published_annotations`
- `get_published_text_formats`
- `get_published_scores`
- `get_assignment_status`
- `get_notifications`
- `mark_notification_read`
- `mark_all_notifications_read`

**Storage Buckets**
- `annotation-audio` — teacher audio comments
- `question-images` — student audio recordings (`student-audio/` paths)

**Current Status**
Frozen

**Last Updated Version**
v0.9.0

**Architecture File**
`07_Annotation_Architecture.md` and `15_Scoring_Architecture.md`

---

## Subsystem: Grading

**Purpose**
Teachers view submitted attempts, grade them using the annotation engine, and publish feedback to students. Provides a hierarchy: Classes → Assignments → Items → Students.

**Primary Pages**
- `src/pages/teacher/TeacherGradingPage.tsx`

**Primary Components**
- `src/components/annotations/AnnotationWorkspace.tsx` (embedded)

**Database Tables**
- `grading` — grading records (submission_id, status, grader, overall_band_score)
- `student_attempts` — the submissions being graded (now includes revision_requested, revision_notes)
- `published_annotation_snapshots` — published annotation snapshots (student visibility)
- `published_text_format_snapshots` — published text format snapshots
- `published_score_snapshots` — published criterion scores + overall band snapshots
- `criterion_scores` — live criterion scores (teacher draft)
- `notifications` — dashboard notifications

**RPCs**
- `get_student_name`
- `get_profile_to_student_mapping`
- `get_profile_display_names`
- `publish_feedback` / `unpublish_feedback`

**Storage Buckets**
- `question-images` — student audio playback via signed URLs
- `annotation-audio` — teacher audio comments

**Current Status**
Frozen

**Last Updated Version**
v0.9.0

**Architecture File**
`08_Grading_Architecture.md` and `15_Scoring_Architecture.md`

---

## Subsystem: Student Dashboard

**Purpose**
Students view their enrolled classes, assigned assignments, and submission status. They complete assignments (Writing or Speaking) and view graded feedback.

**Primary Pages**
- `src/pages/student/StudentDashboard.tsx`
- `src/pages/student/StudentClassesPage.tsx`
- `src/pages/student/StudentAssignmentsPage.tsx`
- `src/pages/student/StudentAssignmentDetailPage.tsx`
- `src/pages/student/StudentWorkspace.tsx`
- `src/pages/student/WritingWorkspace.tsx`
- `src/pages/student/SpeakingWorkspace.tsx`
- `src/pages/student/PreFlightCheck.tsx`
- `src/pages/student/SubmissionReview.tsx`
- `src/pages/student/JoinClassModal.tsx`

**Primary Components**
- `src/pages/student/StudentWorkspace.tsx` — routes to Writing/Speaking workspace
- `src/pages/student/SubmissionReview.tsx` — student views graded feedback

**Database Tables**
- `classstudents` — enrollment
- `published_assignments` — assigned work
- `published_assignment_items` — individual items
- `student_attempts` — student responses

**RPCs**
- `start_attempt`
- `submit_attempt`
- `get_student_feedback`
- `get_published_annotations`
- `get_published_text_formats`
- `get_published_scores`
- `get_assignment_status`
- `get_notifications`
- `mark_notification_read`
- `mark_all_notifications_read`

**Storage Buckets**
- `question-images` — student audio uploads and image display

**Current Status**
Frozen

**Last Updated Version**
v0.9.0

**Architecture File**
`09_StudentDashboard_Architecture.md` and `15_Scoring_Architecture.md`

---

## Subsystem: Teacher Dashboard

**Purpose**
Teachers manage classes, courses, question library, assignment templates, assignments, grading, and students.

**Primary Pages**
- `src/pages/teacher/TeacherDashboard.tsx`
- `src/pages/teacher/TeacherClassesPage.tsx`
- `src/pages/teacher/TeacherCoursesPage.tsx`
- `src/pages/teacher/TeacherQuestionLibraryPage.tsx`
- `src/pages/teacher/TeacherAssignmentTemplatesPage.tsx`
- `src/pages/teacher/TeacherAssignmentsPage.tsx`
- `src/pages/teacher/TeacherGradingPage.tsx`
- `src/pages/teacher/TeacherStudentsPage.tsx`
- `src/pages/teacher/TeacherProfilePage.tsx`
- `src/pages/teacher/ComingSoonPage.tsx`

**Primary Components**
- `src/components/layout/AppShell.tsx` — sidebar + content layout
- `src/components/layout/Sidebar.tsx` — navigation

**Database Tables**
- `teachers` — teacher records
- `teacherclasses` — teacher ↔ class mapping
- `classes` — class records
- `classstudents` — enrollment

**RPCs**
- (Uses all teacher-side RPCs from Question Bank, Templates, Assignments, Grading)

**Storage Buckets**
- `question-images` — question images
- `annotation-audio` — audio comments

**Current Status**
Frozen

**Last Updated Version**
v0.9.0

**Architecture File**
`10_TeacherDashboard_Architecture.md` and `15_Scoring_Architecture.md`

---

## Subsystem: Admin Dashboard

**Purpose**
Admins manage teachers (create, ban, unban), view all users, manage auth settings, and have full access to teacher functionality.

**Primary Pages**
- `src/pages/admin/AdminDashboard.tsx`
- `src/pages/admin/AdminTeachersPage.tsx`
- `src/pages/admin/AdminAuthPage.tsx`
- `src/pages/admin/AdminUsersPage.tsx`

**Primary Components**
- (Reuses teacher pages for classes, courses, assignments, grading, etc.)

**Database Tables**
- `profiles` — all user profiles
- `teachers` — teacher records
- `audit_log` — admin action audit trail

**RPCs**
- `admin_user_management` (Edge Function)
- `create_teacher` (Edge Function)

**Storage Buckets**
None (admin does not directly use storage)

**Current Status**
Frozen

**Last Updated Version**
v0.8.2

**Architecture File**
`10_TeacherDashboard_Architecture.md` (covered alongside Teacher Dashboard)

---

## Subsystem: UI Component Library

**Purpose**
Reusable UI primitives shared across all pages.

**Primary Components**
- `src/components/ui/Button.tsx` — variants: primary, secondary, ghost, danger
- `src/components/ui/Input.tsx` — text input
- `src/components/ui/Modal.tsx` — modal dialog
- `src/components/ui/LoadingSpinner.tsx` — loading indicator
- `src/components/ui/SmartTooltip.tsx` — tooltip

**Database Tables**
None

**RPCs**
None

**Storage Buckets**
None

**Current Status**
Frozen

**Last Updated Version**
v0.8.2

**Architecture File**
`11_Component_Architecture.md`

---

## Subsystem: Layout & Routing

**Purpose**
Application shell with sidebar navigation, role-based routing, browser back/forward support, and workspace fullscreen mode.

**Primary Components**
- `src/App.tsx` — root router, page switching, history management
- `src/components/layout/AppShell.tsx` — sidebar + content wrapper
- `src/components/layout/Sidebar.tsx` — navigation menu

**Database Tables**
None

**RPCs**
None

**Storage Buckets**
None

**Current Status**
Frozen

**Last Updated Version**
v0.8.2

**Architecture File**
`01_System_Architecture.md` (routing section) and `12_UI_Workflows.md`

---

## Frozen Modules Summary

| Module | Status | Architecture File |
|--------|--------|-------------------|
| Authentication | Frozen | `04_Authentication_Architecture.md` |
| Question Bank | Frozen | `05_QuestionBank_Architecture.md` |
| Assignment Templates | Frozen | `06_Assignment_Architecture.md` |
| Assignment Drafts & Publishing | Frozen | `06_Assignment_Architecture.md` |
| Student Attempts | Frozen | `06_Assignment_Architecture.md` |
| Annotation Engine | Frozen | `07_Annotation_Architecture.md` |
| Grading | Frozen | `08_Grading_Architecture.md` |
| Scoring & Notifications | Active | `15_Scoring_Architecture.md` (v0.9.1) |
| Student Dashboard | Frozen | `09_StudentDashboard_Architecture.md` |
| Teacher Dashboard | Frozen | `10_TeacherDashboard_Architecture.md` |
| UI Component Library | Frozen | `11_Component_Architecture.md` |

See `13_Frozen_Modules.md` for detailed frozen module documentation.

---

## Workflow Documentation

Workflow documents describe **how the system behaves** — the end-to-end behavioural paths users follow. They are distinct from architecture documents (which describe *how the system is built*) and reference architecture files rather than duplicating them.

**Index:** `docs/structure/workflows/WORKFLOW_INDEX.md`

| Document | Description |
|----------|-------------|
| `01_Submission_Workflow.md` | Student receives assignment → submits → teacher notified |
| `02_Grading_Workflow.md` | Teacher annotates → scores → publishes feedback |
| `03_Revision_Workflow.md` | Revision cycle: submit → publish → request revision → resubmit |
| `04_Notification_Workflow.md` | Every notification type end-to-end |
| `05_Publishing_Workflow.md` | Draft → publish → snapshot → student view → re-publish |

---

## Development Rules

See `14_Development_Rules.md` for the permanent development rules governing this project. Updated in v0.8.3 with 18 rules covering table/component duplication, RPC repair, investigation-before-fix, architecture freeze, UI consistency, and single source of truth.
