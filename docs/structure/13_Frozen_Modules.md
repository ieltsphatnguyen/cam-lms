# 13 — Frozen Modules

**Last Updated:** v0.8.2 (2026-08-03)

## Purpose

Documents every module that is frozen — meaning it must not be modified without explicit instruction. Frozen modules are stable, production-tested, and changes to them risk breaking dependent functionality.

## What "Frozen" Means

A frozen module:
- Must NOT have its database tables altered (schema, RLS policies, constraints)
- Must NOT have its RPCs altered (signatures, behavior, security)
- Must NOT have its component APIs changed (props, exports, behavior)
- Must NOT be refactored or restructured
- Must NOT have new dependencies added
- Bug fixes are allowed only with explicit instruction

---

## 1. Authentication

**Why Frozen:** The auth flow is security-critical. Changes to session handling, ban enforcement, or role assignment could lock users out or grant unauthorized access.

**Files:**
- `src/contexts/AuthContext.tsx`
- `src/pages/auth/LoginPage.tsx`
- `src/pages/auth/RegisterPage.tsx`
- `src/pages/auth/ForgotPasswordPage.tsx`
- `src/pages/auth/ResetPasswordPage.tsx`
- `src/pages/shared/ProfilePage.tsx`
- `supabase/functions/setup-admin/index.ts`
- `supabase/functions/create-teacher/index.ts`
- `supabase/functions/register-student/index.ts`
- `supabase/functions/admin-user-management/index.ts`

**Database Tables:**
- `profiles`
- `teachers`
- `students`
- `audit_log`

**RPCs / Edge Functions:**
- `setup-admin`
- `create-teacher`
- `register-student`
- `admin-user-management`

**What Must Never Change:**
- Email/password-only auth (no social providers, no magic links)
- Email confirmation OFF
- Role values: 'admin', 'teacher', 'student'
- Ban enforcement via RLS (banned users get null profile)
- Profile fetching on every auth state change
- `AuthContext` interface (user, profile, session, loading, authView, signOut, refreshProfile)

---

## 2. Question Bank

**Why Frozen:** The question type system (7 types with specific behaviors), category options, and similarity search are tightly coupled to the UI and assignment workflow.

**Files:**
- `src/pages/teacher/TeacherQuestionLibraryPage.tsx`
- `src/components/questions/QuestionForm.tsx`
- `src/components/questions/QuestionPreview.tsx`
- `src/components/questions/SimilarQuestionsDialog.tsx`
- `src/lib/questions.ts`

**Database Tables:**
- `questions`
- `questiontypes`
- `question_categories`

**RPCs:**
- `search_similar_questions`

**What Must Never Change:**
- The 7 question type IDs (1-7) and their names
- `QUESTION_TYPE_IDS` constant values
- `DEFAULT_RESPONSE_TYPE` mapping
- `IMAGE_CAPABLE_TYPES` set
- `CATEGORY_OPTIONS` per type
- pg_trigram similarity search threshold (0.3)
- Question status values: 'active', 'archived'
- `question-images` bucket for image storage

---

## 3. Assignment Templates

**Why Frozen:** Template resolution (including random rules) and duplicate detection are complex RPC-based operations that are tested and stable.

**Files:**
- `src/pages/teacher/TeacherAssignmentTemplatesPage.tsx`
- `src/components/templates/TemplateForm.tsx`
- `src/components/templates/TemplatePreview.tsx`
- `src/components/templates/PresetBrowser.tsx`
- `src/components/templates/DuplicateTemplateDialog.tsx`
- `src/lib/templates.ts` (template-related functions)

**Database Tables:**
- `assignment_templates`
- `assignment_template_questions`
- `assignment_template_random_rules`
- `assignment_template_favorites`

**RPCs:**
- `check_duplicate_template`
- `resolve_template_to_draft`
- `resolve_random_rule`

**What Must Never Change:**
- Template status values: 'active', 'archived'
- Duplicate detection logic (sorted question ID comparison)
- Random rule resolution (excludes used question IDs)
- Canonical type ordering
- Favorite toggle mechanism

---

## 4. Assignment Drafts & Publishing

**Why Frozen:** The publishing flow creates immutable snapshots. Changing this risks breaking student attempts that reference published items.

**Files:**
- `src/pages/teacher/TeacherAssignmentsPage.tsx`
- `src/lib/templates.ts` (draft and publishing functions)
- `src/lib/attempts.ts`

**Database Tables:**
- `assignment_drafts`
- `assignment_draft_questions`
- `published_assignments`
- `published_assignment_items`
- `student_attempts`

**RPCs:**
- `resolve_template_to_draft`
- `publish_draft`
- `unpublish_draft`
- `start_attempt`
- `submit_attempt`

**What Must Never Change:**
- Draft status values: 'draft', 'published'
- Published items are immutable snapshots (denormalized from questions)
- One attempt per item enforcement
- `start_attempt` is the ONLY way question content becomes available to students
- Attempt status values: 'in_progress', 'submitted', 'auto_submitted'
- Scheduling metadata fields and their semantics

---

## 5. Annotation Engine

**Why Frozen:** The annotation engine was recently stabilized (v0.8.1g) after extensive bug fixing. The D1 two-phase speaking workflow replaced the unstable dual-mode component. Changes risk reintroducing resolved bugs.

**Files:**
- `src/components/annotations/AnnotationWorkspace.tsx`
- `src/components/annotations/AnnotatableText.tsx`
- `src/components/annotations/FloatingToolbar.tsx`
- `src/components/annotations/CommentModal.tsx`
- `src/components/annotations/RichTextEditor.tsx`
- `src/components/annotations/ExaminerNotesPanel.tsx`
- `src/lib/annotations.ts`

**Database Tables:**
- `annotations`
- `annotation_comments`
- `rubric_criteria`

**RPCs:**
- `get_rubric_criteria`
- `get_attempt_annotations`
- `save_annotation`
- `delete_annotation`
- `move_annotation`
- `save_annotation_comment`
- `delete_annotation_comment`
- `save_feedback`
- `save_transcript`
- `publish_feedback`
- `unpublish_feedback`
- `get_student_feedback`
- `get_assignment_status`

**What Must Never Change:**
- `AnnotatableText` is the ONLY text annotation component (no `AnnotatableTranscript`)
- Highlight color determined ONLY by criterion (not by comments)
- D1 two-phase speaking workflow (editing → annotating)
- Transcript is plain-text only (no HTML in transcript)
- "Teacher Notes" terminology (not "Examiner Notes")
- `annotation-audio` bucket for audio comments
- `question-images` bucket for student audio
- SECURITY DEFINER on all annotation RPCs

---

## 6. Grading

**Why Frozen:** The grading hierarchy and student listing logic is stable and depends on multiple SECURITY DEFINER functions for profile resolution.

**Files:**
- `src/pages/teacher/TeacherGradingPage.tsx`
- `src/lib/grading.ts`

**Database Tables:**
- `grading`
- `student_attempts`
- (reads from published_assignments, published_assignment_items, classstudents)

**RPCs:**
- `get_student_name`
- `get_profile_to_student_mapping`
- `get_profile_display_names`
- `publish_feedback`
- `unpublish_feedback`

**What Must Never Change:**
- Grading status values: 'completed', 'graded'
- Profile-to-student mapping via SECURITY DEFINER (not direct profile reads)
- Signed URL approach for audio playback (1-hour expiry)
- Grading hierarchy structure (Classes → Assignments → Items → Students)

---

## 7. Student Dashboard

**Why Frozen:** The student-facing workflows (assignment completion, feedback review) are stable and user-tested.

**Files:**
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
- `src/lib/attempts.ts`

**What Must Never Change:**
- Fullscreen workspace mode (no sidebar)
- Item status computation logic
- Assignment status computation logic
- `SubmissionReview` shows "Teacher Comment(s)" (not "Uncategorized")
- Student audio uploads to `student-audio/{uid}/` paths

---

## 8. UI Component Library

**Why Frozen:** These primitives are used everywhere. Changing their APIs would break the entire application.

**Files:**
- `src/components/ui/Button.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Modal.tsx`
- `src/components/ui/LoadingSpinner.tsx`
- `src/components/ui/SmartTooltip.tsx`

**What Must Never Change:**
- Button variants: 'primary', 'secondary', 'ghost', 'danger'
- Button sizes: 'sm', 'md', 'lg'
- No alternative button, modal, or input components should be created

---

## 9. Layout & Routing

**Why Frozen:** The custom router and AppShell are stable. Introducing React Router or changing navigation mechanics would require a full rewrite.

**Files:**
- `src/App.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/Sidebar.tsx`

**What Must Never Change:**
- State-based routing (no React Router)
- Browser history via `pushState`/`popstate`
- Role-based page prefix validation
- Fullscreen workspace mode for `student-workspace`
- Key-based remount via `navKey`
