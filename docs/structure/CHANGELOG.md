# Architecture Changelog

## v0.9.9 — 2026-08-03

Documentation only — no code, database, RPC, Edge Function, UI, or storage changes.

Added workflow documentation for:

- **Submission** — student receives assignment through teacher opening submission
- **Grading** — teacher annotates, scores, saves draft, publishes feedback
- **Revision** — full revision cycle including attempt lifecycle, snapshot behaviour, and submission history
- **Notifications** — every notification type from event through destination page
- **Publishing** — draft/publish/snapshot/student view/re-publish lifecycle

Created `docs/structure/workflows/` directory containing:
- `01_Submission_Workflow.md`
- `02_Grading_Workflow.md`
- `03_Revision_Workflow.md`
- `04_Notification_Workflow.md`
- `05_Publishing_Workflow.md`
- `WORKFLOW_INDEX.md`

Updated `PROJECT_ARCHITECTURE.md` with Workflow Documentation section linking to the new directory.

Workflow documents describe how the system behaves. Architecture documents describe how the system is built. Workflow documents reference architecture rather than duplicating it.

## v0.9.1 — 2026-08-03

Teacher Workflow, Submission History & Notifications — fixes white page bug, adds Current Submission card, Submission History with read-only snapshot inspection, and repairs notification workflow.

### Phase 0: White Page Bug Fix
- Root cause: `markDirty` callback referenced in `handleScoreChange` dependency array before declaration (temporal dead zone violation)
- Fix: moved `markDirty` declaration above `handleScoreChange` in AnnotationWorkspace
- Teacher grading workspace now loads normally: Class → Assignment → Item → Student

### Phase 1: Teacher Workflow — Current Submission
- Added `fetchSubmissionHistory()` to grading.ts — fetches all attempts for a student+item, newest first
- Added Current Submission Card above the grading workspace in SubmissionViewerView
- Card shows: submission number, student name, Resubmitted badge (if applicable), Published/Draft status
- Grading workspace always operates on the Current Submission only
- No duplicated submission numbers elsewhere (breadcrumb remains unchanged)

### Phase 2: Submission History
- Added Submission History section below the grading workspace
- Each historical submission card shows: submission number, submitted date/time, overall band, status (Published/Draft), Revision Requested badge
- "Open Snapshot" button opens SnapshotViewerModal — a new read-only modal component
- SnapshotViewerModal displays: student response, teacher feedback, teacher notes (criterion-grouped annotations), criterion score cards, overall band
- Nothing is editable in the snapshot viewer
- Current Submission never appears in the history list — only older submissions
- History is chronological, newest first
- Reuses existing snapshot architecture — no database changes

### Phase 3: Notification Workflow Repairs
- Fixed broken navigation links:
  - Teacher: DB link changed from `/grading` → `/teacher-grading`
  - Student: DB link changed from `/student/assignments` → `/student-assignments`
- Fixed dashboard link parsing: `link.replace(/^\//, '').replace(/\//g, '-')` converts URL paths to route identifiers correctly
- Moved `notify_teacher_of_submission` call from client-side fire-and-forget into `submit_attempt` RPC (server-side, reliable, same transaction)
- Added `feedback_updated` notification type — emitted on re-publish (when `feedback_published` was already true), instead of duplicate `feedback_published`
- Updated `publish_feedback` RPC: checks `feedback_published` before update, emits `feedback_updated` on re-publish
- Updated `request_revision` RPC: fixed link to `/student-assignments`
- Updated `notify_teacher_of_submission` RPC: fixed link to `/teacher-grading`
- Removed client-side fire-and-forget call from `attempts.ts`
- No duplicate notifications: each transition produces exactly one notification

### Technical Debt Investigation (Documentation Only)
- Documented current snapshot architecture limitations in 15_Scoring_Architecture.md
- Evaluated proposed `published_feedback_versions` parent entity
- Documented advantages: publish history, audit trail, rollback, atomic grouping
- Documented migration complexity: medium (1 new table, 3 altered tables, 4 updated RPCs, 0 frontend changes)
- Recommendation: defer to future milestone when version comparison or audit/rollback is needed
- No database schema changes for this investigation

### Database Changes
- Migration 042: `042_notification_workflow_repairs.sql`
- Updated RPCs: `notify_teacher_of_submission`, `request_revision`, `publish_feedback`, `submit_attempt`
- No new tables, no new columns

### Files Modified
- `src/components/annotations/AnnotationWorkspace.tsx` — fixed markDirty declaration order (Phase 0)
- `src/lib/grading.ts` — added fetchSubmissionHistory + SubmissionHistoryEntry type (Phase 1)
- `src/pages/teacher/TeacherGradingPage.tsx` — Current Submission card, Submission History section, SnapshotViewerModal integration (Phases 1-2)
- `src/components/annotations/SnapshotViewerModal.tsx` — new read-only snapshot viewer modal (Phase 2)
- `src/lib/attempts.ts` — removed fire-and-forget notification call (Phase 3)
- `src/pages/teacher/TeacherDashboard.tsx` — fixed notification link parsing (Phase 3)
- `src/pages/student/StudentDashboard.tsx` — fixed notification link parsing (Phase 3)
- `docs/structure/15_Scoring_Architecture.md` — updated with v0.9.1 changes + technical debt investigation
- `docs/structure/CHANGELOG.md` — this entry

## v0.9.0 — 2026-08-03

Scoring, Notifications & Published Feedback Workflow — complete IELTS scoring workflow, notification system, and published feedback lifecycle.

### Criterion Scores
- Writing: Task Response, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy
- Speaking: Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation
- Each criterion supports NULL (not yet scored) or 0.0–9.0 (free input, step 0.5)
- New table: `criterion_scores` with unique constraint on (attempt_id, criterion_id)
- New RPCs: `save_criterion_score`, `get_criterion_scores`

### Overall Band
- Automatically calculated using IELTS rounding rules (.25→.5, .75→next whole)
- Only calculated when ALL required criteria have a score — NULL criterion → NULL overall
- Client-side: `computeOverallBand()` in annotations.ts
- Server-side: `compute_overall_band` RPC (used during publish for authoritative value)
- Stored in `grading.overall_band_score` column (pre-existing)

### Teacher Feedback Flow
- Student page displays: Question → Submission → Teacher Feedback → Teacher Notes → Criterion Score Cards → Overall Band
- Teacher Feedback always appears before scores
- Teacher Notes show criterion-grouped annotations with score badges

### Read-Only Student Notes
- Students see the same annotations used by teachers
- Criterion sections with highlighted text excerpts as clickable tags
- Click opens existing CommentModal in read-only mode (readOnly={true})
- Students can read text comments and play audio comments
- Students cannot edit, record, or delete
- No StudentFloatingCommentModal created — existing CommentModal reused

### Draft vs Published
- Teacher edits (feedback, scores, annotations, comments, audio) remain Draft
- Students continue seeing the previous published version
- Only "Publish Feedback" creates a new published version
- Everything updates simultaneously — no partial updates
- New table: `published_score_snapshots` — immutable snapshot of scores + overall band
- Updated `publish_feedback` RPC: now snapshots scores, computes overall band, notifies student

### Notifications
- New table: `notifications` with RLS (users only see their own)
- New reusable component: `NotificationsPanel` (`src/components/shared/NotificationsPanel.tsx`)
- Teacher notifications: New Submission, Resubmission
- Student notifications: Feedback Published, Revision Requested
- Notification links navigate to relevant pages
- New RPCs: `get_notifications`, `mark_notification_read`, `mark_all_notifications_read`, `notify_teacher_of_submission`
- `submitAttempt` in attempts.ts now calls `notify_teacher_of_submission` (fire-and-forget)

### Revision Requests
- Teacher clicks "Request Revision" → `request_revision` RPC
- Sets `revision_requested = true` and `revision_notes` on `student_attempts`
- Updates `grading_status` to 'revision_requested'
- Creates 'revision_requested' notification for student
- Student resubmits → `notify_teacher_of_submission` creates 'resubmission' notification for teacher
- New columns: `student_attempts.revision_requested`, `student_attempts.revision_notes`

### Published Feedback Integrity
- All student-facing data comes from snapshot tables:
  - `published_annotation_snapshots` — annotations + comments
  - `published_text_format_snapshots` — text formatting
  - `published_score_snapshots` — criterion scores + overall band
- `get_student_feedback` RPC returns feedback only when `feedback_published = true`
- `fetchAttemptForItem` excludes `feedback` and `transcript` columns
- No grading information bypasses publication

### Database Changes
- New table: `criterion_scores`
- New table: `published_score_snapshots`
- New table: `notifications`
- New columns: `student_attempts.revision_requested`, `student_attempts.revision_notes`
- Updated RPC: `publish_feedback` — now snapshots scores + notifies student
- New RPCs: `save_criterion_score`, `get_criterion_scores`, `get_published_scores`, `compute_overall_band`, `request_revision`, `get_notifications`, `mark_notification_read`, `mark_all_notifications_read`, `notify_teacher_of_submission`

### Files Modified
- `src/types/database.ts` — added CriterionScore, PublishedScoreSnapshot, AppNotification, NotificationType types
- `src/lib/annotations.ts` — added scoring functions (fetchCriterionScores, saveCriterionScore, fetchPublishedScores, requestRevision, computeOverallBand)
- `src/lib/notifications.ts` — new module for notification CRUD
- `src/lib/attempts.ts` — submitAttempt now calls notify_teacher_of_submission
- `src/components/annotations/AnnotationWorkspace.tsx` — criterion score inputs, overall band display, revision request button
- `src/pages/student/SubmissionReview.tsx` — teacher feedback → teacher notes → score cards → overall band
- `src/components/shared/NotificationsPanel.tsx` — new reusable notifications panel
- `src/pages/teacher/TeacherDashboard.tsx` — added NotificationsPanel
- `src/pages/student/StudentDashboard.tsx` — added NotificationsPanel
- `src/App.tsx` — passes onNavigate to both dashboards
- `docs/structure/15_Scoring_Architecture.md` — new architecture document
- `docs/structure/PROJECT_ARCHITECTURE.md` — updated with scoring subsystem
- `docs/structure/CHANGELOG.md` — this entry

## v0.8.2a — 2026-08-03

Annotation Lifecycle Stabilisation — decoupled formatting from annotations and introduced immutable published snapshots for draft/published isolation.

### Part A — Independent Text Formatting

- **Root cause:** Formatting (bold/italic/underline/strikethrough) was stored as columns on the `annotations` table. Formatting only worked if an annotation already overlapped the selection — it was coupled to annotation records.
- **Fix:** Created `text_formats` table as an independent visual layer. Formatting can now be applied to ANY selected text without requiring an annotation to exist. Formatting does NOT create annotations, comments, highlights, or criterion assignments.
- **New RPCs:** `save_text_format`, `delete_text_format`, `get_text_formats`, `get_published_text_formats`.
- **FloatingToolbar:** Restored B/I/U/S buttons. They create/update/delete `text_formats` records — never annotations.
- **AnnotatableText:** Now accepts `textFormats` prop and renders formatting from both `text_formats` and legacy `annotations.format_*` columns.
- **AnnotationWorkspace:** Loads text formats alongside annotations, passes them to renderer, handles format CRUD independently.

### Part B — Draft/Published Isolation

- **Root cause:** Teacher and student read the same `annotations` table. The `get_published_annotations` RPC checked `feedback_published = true` on the attempt but still read live records — teacher edits after publishing would be immediately visible to students.
- **Fix:** Created `published_annotation_snapshots` and `published_text_format_snapshots` tables. `publish_feedback` RPC now snapshots all annotations, comments, and text formats into immutable snapshot tables before marking `feedback_published = true`.
- **Student UI:** `get_published_annotations` and `get_published_text_formats` RPCs now read exclusively from snapshot tables. Students never read the live `annotations` or `text_formats` tables.
- **Re-publishing:** Old snapshots are deleted and replaced with new ones on each Publish Feedback. Students always see one consistent published version.
- **Column-level fix:** `fetchAttemptForItem` no longer selects `feedback` and `transcript` columns — only `fetchStudentFeedback` (which checks `feedback_published`) returns those.

### Part C — Publication Verification

Verified: teacher edits to comments, criteria, feedback, and band scores are invisible to students until Publish Feedback is pressed. After publishing, students immediately receive the snapshotted annotations, comments, criterion colors, formatting, and feedback.

### Database Changes

- New table: `text_formats` — independent text formatting layer
- New table: `published_annotation_snapshots` — immutable published annotation snapshot
- New table: `published_text_format_snapshots` — immutable published text format snapshot
- Updated RPC: `publish_feedback` — now snapshots annotations + text formats
- Updated RPC: `get_published_annotations` — now reads from snapshots
- New RPC: `get_published_text_formats` — reads from snapshots
- New RPC: `save_text_format` — create/update text format
- New RPC: `delete_text_format` — delete text format
- New RPC: `get_text_formats` — fetch text formats (teacher)
- Updated RPC: `can_annotate_attempt` — fixed admin check using EXISTS subqueries

### Files Modified

- `src/types/database.ts` — added `TextFormat` interface
- `src/lib/annotations.ts` — added text format CRUD functions, removed `updateAnnotationFormat`
- `src/lib/attempts.ts` — restricted `fetchAttemptForItem` column selection
- `src/components/annotations/FloatingToolbar.tsx` — restored B/I/U/S buttons with independent formatting
- `src/components/annotations/AnnotatableText.tsx` — accepts `textFormats` prop, renders formatting independently
- `src/components/annotations/AnnotationWorkspace.tsx` — text format state, CRUD, and rendering
- `src/pages/student/SubmissionReview.tsx` — uses `AnnotatableText` component, fetches published text formats
- `docs/structure/07_Annotation_Architecture.md` — updated to reflect new architecture
- `docs/structure/CHANGELOG.md` — this entry

## v0.8.4 — 2026-08-03

Grading UX Stabilisation — UI/UX polish, annotation engine fixes, and speaking workflow audit.

### Group A — UI / UX Polish

- **Collapsible sidebar:** Sidebar collapses to icons-only with pin/unpin toggle. State persists in sessionStorage. Entire sidebar scrolls as one panel (logo, nav, account). Profile nav item removed; bottom account section is now the entry point to profile.
- **Grading bottom toolbar:** Merged two rows into one: Previous Student | Save Draft + Publish Feedback | Next Student. Removed duplicated student name from toolbar.
- **Terminology:** "Examiner" replaced with "Teacher" throughout grading workspace (feedback placeholder, notes panel label).
- **Uncategorized removed:** ExaminerNotesPanel already only renders criterion-grouped annotations. Annotations without criteria remain internal and never appear in Teacher Notes.
- **Student review ordering:** Feedback appears before any score sections. No band scores section exists yet.

### Group B — Annotation Engine Stabilisation

- **Formatting no longer creates annotations:** FloatingToolbar removed all formatting buttons (bold, italic, underline, strikethrough, text color). Formatting is only available inside RichTextEditor (feedback) and CommentModal (comment editor). Formatting never creates highlights, annotations, comments, or criteria.
- **Criterion colors always determine highlight:** AnnotatableText `getSegmentClass` now filters to criterion-based annotations only. Annotations without a criterion do not produce a visible highlight. Comment/audio badges appear inline as small icons.
- **Empty annotations disappear:** When all comments are deleted from an annotation that has no criterion and no audio, the annotation is automatically deleted from the database. Plain text becomes plain text again.
- **Publish dirty state:** All grading changes (feedback, transcript, annotations, comments, audio comments) mark the attempt dirty. Students only receive updates after Publish Feedback. Save Draft/Save Progress saves without publishing. Publish button is disabled when not dirty or already published.
- **Student annotation viewer:** SubmissionReview now uses CommentModal in read-only mode. Students can click highlights to open the modal and view teacher comments. Teachers continue using the editable version.

### Group C — Speaking Workflow Stabilisation

- **D1 transcript workflow preserved:** Two-phase (editing → annotating) workflow unchanged. Transcript locked once annotation begins.
- **Student recording pipeline fixed:** SubmissionReview now uses `getAudioUrl()` from grading lib instead of duplicating signed URL logic. Teacher and student use the same recording from `question-images` bucket at `student-audio/{uid}/` paths. No duplicate recordings, no new storage buckets.
- **Shared audio logic:** SubmissionReview's direct `supabase.storage` call replaced with `getAudioUrl()` from `src/lib/grading.ts`, eliminating duplicated signed URL generation logic.

### Files Modified

- `src/components/layout/Sidebar.tsx` — collapsible, scrollable, profile entry
- `src/components/layout/AppShell.tsx` — collapse state management, sessionStorage
- `src/components/annotations/FloatingToolbar.tsx` — removed formatting buttons
- `src/components/annotations/AnnotationWorkspace.tsx` — dirty state, merged toolbar, terminology, empty annotation cleanup
- `src/components/annotations/AnnotatableText.tsx` — criterion-only highlights, clickable fix
- `src/components/annotations/CommentModal.tsx` — added readOnly prop
- `src/components/annotations/ExaminerNotesPanel.tsx` — documented no-uncategorized behavior
- `src/pages/student/SubmissionReview.tsx` — read-only CommentModal, shared audio URL logic

No database, RPC, or architecture changes.

## v0.8.3 — 2026-08-03

Strengthened Development Rules (`14_Development_Rules.md`):

- Rule 1: Added prohibition on tables with suffixes (`_v2`, `_new`, `_temp`, `_copy`, `_backup`) and requirement to extend via migration.
- Rule 2: Added frozen reusable components: FloatingToolbar, FloatingCommentModal, CommentModal, AnnotatableTranscript (deleted, must not be recreated), SubmissionReview, TeacherGradingPage. All must never have V2 versions.
- Rule 4: Added requirement to repair incorrect RPCs rather than creating alternative RPCs with similar behaviour.
- Rule 6: Added requirement to STOP and document investigation when root cause is uncertain. No speculative fixes.
- Rule 7: Added requirement to repair existing implementations rather than replacing components because repair appears difficult.
- Rule 11: Added requirement to not change working UI layouts unless explicitly requested. Bug fixes must preserve existing layouts.
- Rule 12: Added requirement that architecture documents are the source of truth. Future development must conform. No silent divergence.
- Rule 16 (new): Freeze Existing Architecture — no redesigning modules while fixing bugs. Must explain why, what changes, and risks, then wait for approval.
- Rule 17 (new): UI Consistency — preserve layouts, navigation, terminology, and interaction patterns during bug fixes.
- Rule 18 (new): One Source of Truth — every responsibility has exactly one owner. No parallel implementations.

No code, database, RPC, component, or architecture changes.
Documentation only.

## v0.8.2 — 2026-08-03

Initial architecture documentation created.

Established `docs/structure/` as the permanent architecture reference directory containing:

- `PROJECT_ARCHITECTURE.md` — master index of all subsystems
- `01_System_Architecture.md` — system overview, routing, state ownership
- `02_Database_Architecture.md` — all tables, relationships, storage buckets
- `03_RPC_Architecture.md` — all PostgreSQL RPCs and Edge Functions
- `04_Authentication_Architecture.md` — auth flows, ban enforcement, user creation
- `05_QuestionBank_Architecture.md` — question types, CRUD, similarity search
- `06_Assignment_Architecture.md` — templates, drafts, publishing, student attempts
- `07_Annotation_Architecture.md` — annotation engine, D1 workflow, feedback publishing
- `08_Grading_Architecture.md` — grading hierarchy, audio playback, profile resolution
- `09_StudentDashboard_Architecture.md` — student workflows, assignment completion
- `10_TeacherDashboard_Architecture.md` — teacher and admin pages
- `11_Component_Architecture.md` — reusable components, hierarchy, duplication rules
- `12_UI_Workflows.md` — golden path workflows for all roles
- `13_Frozen_Modules.md` — frozen module inventory and constraints
- `14_Development_Rules.md` — permanent development rules
- `CHANGELOG.md` — this file

All documentation describes the current implementation as of v0.8.2.
No functionality was modified during this milestone.
