# Architecture Changelog

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
