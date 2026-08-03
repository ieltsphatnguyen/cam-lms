# 07 — Annotation Engine Architecture

**Last Updated:** v0.8.2a (2026-08-03)

## Purpose

The annotation engine allows teachers to annotate student submissions by highlighting text and assigning rubric criteria. It supports text comments, audio comments, and inline formatting (bold, italic, underline, strikethrough). Formatting is an independent visual layer — it does NOT create annotations, comments, highlights, or criterion assignments. The engine is shared between Writing responses and Speaking transcripts.

## Components

### AnnotationWorkspace (`src/components/annotations/AnnotationWorkspace.tsx`)

The main grading workspace. Owns all annotation state and orchestrates the annotation workflow.

**State:**
- `annotations: Annotation[]` — all annotations for the current attempt
- `textFormats: TextFormat[]` — independent text formatting for the current attempt
- `criteria: RubricCriterion[]` — rubric criteria for the question type
- `selection: SelectionRange | null` — current text selection
- `commentModalAnnotation: CommentModalAnnotation | null` — open comment modal
- `commentModalMode: 'text' | 'audio'` — comment type
- `feedback: string` — teacher feedback text
- `transcript: string` — teacher transcript (for speaking)
- `audioUrl: string | null` — signed URL for student recording
- `audioLoading: boolean` — audio URL fetch loading state
- `savedToast: boolean` — save confirmation toast
- `publishing: boolean` — publish in progress
- `published: boolean` — feedback published state
- `transcriptPhase: 'editing' | 'annotating'` — D1 two-phase speaking workflow
- `showEditWarning: boolean` — edit transcript confirmation modal
- `clearingAnnotations: boolean` — clearing annotations in progress

**Layout:**
Two-column layout:
- Left column (~35%): Question prompt, student recording (audio), word count
- Right column (~65%): Annotatable text/transcript + Teacher Notes panel + feedback editor + action buttons

### AnnotatableText (`src/components/annotations/AnnotatableText.tsx`)

Renders text as character segments with highlight overlays. Shared by both Writing and Speaking (transcript) annotations. Accepts both `annotations` and `textFormats` as independent layers — formatting is applied from `text_formats`, highlights from `annotations`.

**Key Functions:**
- `criterionColor(criterionId, criteria)` — deterministic color assignment per criterion
- `buildSegments(text, annotations, textFormats)` — splits text into segments based on annotation AND format ranges
- `getSegmentClass(segment, annotations, criteria)` — applies highlight classes (criterion + comment only)
- `getFormattingStyle(annotations, textFormats)` — applies bold/italic/underline/strikethrough from both layers

**Highlight Color Rules:**
- Highlight color is determined ONLY by the assigned criterion
- Text and audio comments do NOT change the highlight color
- Small badges appear inline to indicate comments:
  - Text comment badge: small speech bubble icon
  - Audio comment badge: small headphone icon

**Color Palette:**
```typescript
HIGHLIGHT_STYLES = {
  purple: { bg: 'bg-purple-200/60', border: 'border-b-2 border-purple-500' },
  yellow: { bg: 'bg-yellow-200/60', border: 'border-b-2 border-yellow-500' },
  green:  { bg: 'bg-green-200/60',  border: 'border-b-2 border-green-500' },
  cyan:   { bg: 'bg-cyan-200/60',   border: 'border-b-2 border-cyan-500' },
}
```

### FloatingToolbar (`src/components/annotations/FloatingToolbar.tsx`)

Appears when text is selected. Provides:
- Criterion dropdown (hover-based, with delayed close timer and padding bridge)
- Formatting toggles: Bold, Italic, Underline, Strikethrough — these apply to the selected text as an independent visual layer via the `text_formats` table. They do NOT create annotations, comments, highlights, or criterion assignments.
- Text comment button (creates annotation with null criterion, opens CommentModal)
- Audio comment button (creates annotation with null criterion, opens CommentModal)

**Formatting is decoupled from annotations (v0.8.2a):** Formatting buttons create/update/delete records in the `text_formats` table, which is a separate visual layer. The `annotations` table's `format_bold`/`format_italic`/`format_underline`/`format_strikethrough` columns are legacy and no longer used by the toolbar.

**Hover Menu Fix:**
The criterion dropdown uses a delayed-close timer (150ms) and a transparent padding bridge between the button and the dropdown to prevent premature closing when the cursor moves between them.

### CommentModal (`src/components/annotations/CommentModal.tsx`)

Modal for adding/editing text or audio comments on an annotation. Supports a `readOnly` prop (added v0.8.4) for student-facing use — hides editor area and delete/edit buttons.

### RichTextEditor (`src/components/annotations/RichTextEditor.tsx`)

ContentEditable-based rich text editor for teacher feedback. Supports bold, italic, underline, lists, and produces HTML output.

### ExaminerNotesPanel (`src/components/annotations/ExaminerNotesPanel.tsx`)

Displays annotations grouped by criterion. Shows:
- Criterion name as section header
- Selected text excerpt
- Text/audio comment indicators
- Click to flash and scroll to the annotation in the text

**Note:** "Uncategorized" section is NOT shown. Annotations without criteria are not displayed in this panel.

## Library Module

`src/lib/annotations.ts` — all annotation CRUD and feedback operations.

### API Functions

| Function | Purpose |
|----------|---------|
| `fetchRubricCriteria(questionTypeId)` | Get criteria for a question type |
| `fetchAnnotations(attemptId)` | Get all annotations + comments for an attempt (teacher) |
| `fetchPublishedAnnotations(attemptId)` | Get published annotation snapshots (student) |
| `fetchTextFormats(attemptId)` | Get all text formats for an attempt (teacher) |
| `fetchPublishedTextFormats(attemptId)` | Get published text format snapshots (student) |
| `saveTextFormat(params)` | Create a new text format record |
| `updateTextFormat(formatId, format)` | Update an existing text format record |
| `deleteTextFormat(formatId)` | Delete a text format record |
| `createAnnotation(params)` | Create new annotation (save_annotation RPC, mode='create') |
| `updateAnnotation(annotationId, params)` | Update annotation (save_annotation RPC, mode='update') |
| `deleteAnnotation(annotationId)` | Delete annotation + comments |
| `moveAnnotation(annotationId, criterionId, highlightColor)` | Move annotation to different criterion |
| `saveTextComment(annotationId, content, commentId?)` | Create/update text comment |
| `saveAudioComment(annotationId, audioPath, commentId?)` | Create/update audio comment |
| `deleteComment(commentId)` | Delete a comment |
| `uploadAudioComment(annotationId, blob)` | Upload audio to `annotation-audio` bucket |
| `getAudioCommentUrl(audioPath)` | Get signed URL for audio comment |
| `saveFeedback(attemptId, feedback)` | Save teacher feedback |
| `saveTranscript(attemptId, transcript)` | Save teacher transcript |
| `publishFeedback(attemptId)` | Mark feedback as published |
| `unpublishFeedback(attemptId)` | Unpublish feedback |
| `fetchStudentFeedback(attemptId)` | Student retrieves published feedback |
| `fetchAssignmentStatus(publishedAssignmentId, studentProfileId)` | Get per-item status |
| `computeAssignmentStatus(items)` | Compute overall assignment status |

## D1 Two-Phase Speaking Workflow

For speaking attempts, the annotation workspace uses a two-phase workflow:

### Phase 1: Transcript Editing
- Teacher types or pastes the transcript in a plain-text textarea
- A warning notice explains that the transcript will be locked once annotation begins
- Paste is sanitized to plain text only (HTML, images, formatting stripped)
- "Start Annotation" button saves the transcript and transitions to Phase 2

### Phase 2: Annotation
- Transcript is locked (read-only)
- AnnotatableText renders the transcript with highlight/annotation support
- "Edit Transcript" button allows returning to Phase 1
  - If annotations exist, a confirmation modal warns that all annotations will be deleted
  - Confirming clears all annotations and returns to Phase 1

### Auto-Phase Detection
- On load, if annotations already exist for the attempt, the workspace starts in Phase 2
- If no annotations exist, it starts in Phase 1

## Database Tables

| Table | Purpose |
|-------|---------|
| `annotations` | Highlight ranges, criterion, comment flags (teacher draft data) |
| `annotation_comments` | Text or audio comments per annotation (teacher draft data) |
| `text_formats` | Independent text formatting (bold/italic/underline/strikethrough) — teacher draft |
| `rubric_criteria` | Criteria per question type |
| `published_annotation_snapshots` | Immutable snapshot of annotations + comments at publish time (student reads) |
| `published_text_format_snapshots` | Immutable snapshot of text formats at publish time (student reads) |

## RPCs

| RPC | Purpose |
|-----|---------|
| `get_rubric_criteria` | Fetch criteria for question type |
| `get_attempt_annotations` | Fetch annotations + comments (teacher) |
| `get_published_annotations` | Fetch annotation snapshots (student, published only) |
| `save_annotation` | Create/update annotation |
| `delete_annotation` | Delete annotation + comments |
| `move_annotation` | Move annotation to different criterion |
| `save_annotation_comment` | Create/update comment |
| `delete_annotation_comment` | Delete comment |
| `get_text_formats` | Fetch text formats (teacher) |
| `get_published_text_formats` | Fetch text format snapshots (student, published only) |
| `save_text_format` | Create/update text format |
| `delete_text_format` | Delete text format |
| `save_feedback` | Save feedback text |
| `save_transcript` | Save transcript text |
| `publish_feedback` | Snapshot annotations + text formats, mark feedback as published |
| `unpublish_feedback` | Unpublish feedback |
| `get_student_feedback` | Student retrieves published feedback |
| `get_assignment_status` | Per-item status for a student |

## Storage

| Bucket | Path Pattern | Purpose |
|--------|--------------|---------|
| `annotation-audio` | `annotation-{id}-{timestamp}.webm` | Teacher audio comments |
| `question-images` | `student-audio/{uid}/{filename}` | Student audio recordings (read by teacher) |

## Data Flow

### Annotation Creation Flow

```
1. Teacher selects text in AnnotatableText
   → FloatingToolbar appears at selection position

2. Teacher picks a criterion from dropdown
   → createAnnotation() called with offsets, selected text, criterion, highlight color
   → Highlight color is determined ONLY by the assigned criterion

3. Annotation saved via save_annotation RPC
   → annotations table: criterion_id, start_offset, end_offset, highlight_color

4. Teacher clicks the annotation to add a comment
   → CommentModal opens
   → saveTextComment() or saveAudioComment() called
   → annotation_comments table: type, content or audio_path
   → annotations table: has_text_comment / has_audio_comment flags updated
   → Small badges appear inline: text comment (MessageSquare icon), audio comment (AudioLines icon)

5. If all comments are deleted and annotation has no criterion and no audio
   → Annotation is automatically deleted from database
   → Plain text becomes plain text again
```

### Dirty State (v0.8.4)

Every grading change marks the attempt dirty:
- Feedback edits
- Transcript edits
- Annotation creation/deletion/movement
- Comment creation/deletion
- Audio comment creation/deletion

Students only receive updates after Publish Feedback. Save Draft/Save Progress saves to the database without publishing. The Publish button is disabled when not dirty or already published.

### Feedback Publishing Flow

```
1. Teacher writes feedback in RichTextEditor
   → feedback state updated → dirty = true

2. Teacher clicks "Save Draft" (Writing) or "Save Progress" (Speaking)
   → saveFeedback() RPC (and saveTranscript() if speaking)
   → dirty = false (saved but NOT published)

3. Teacher clicks "Publish Feedback"
   → saveFeedback() + saveTranscript() (if speaking) + publishFeedback() RPCs
   → publish_feedback RPC:
     a. Snapshots all annotations + comments into published_annotation_snapshots
     b. Snapshots all text_formats into published_text_format_snapshots
     c. Sets student_attempts.feedback_published = true
     d. Creates/updates grading record
   → dirty = false, published = true

4. Student views feedback
   → fetchStudentFeedback() RPC — returns feedback + transcript only if published
   → fetchPublishedAnnotations() RPC — reads from published_annotation_snapshots
   → fetchPublishedTextFormats() RPC — reads from published_text_format_snapshots
   → All three return empty/null if feedback_published = false

5. Teacher edits after publishing (re-publish)
   → Teacher edits annotations/comments/formats/feedback → dirty = true
   → Student still sees the OLD published snapshot (immutable)
   → Teacher clicks Publish again
   → Old snapshots are deleted, new snapshots created from current state
   → Student now sees the NEW published version
```

## Terminology

- "Examiner Notes" has been renamed to "Teacher Notes" throughout the grading workspace
- "Examiner Transcript" → "Teacher Transcript"
- "Examiner Feedback" → "Teacher Feedback"
- Student-facing comment titles show "Teacher Comment(s)" instead of "Uncategorized"

## Known Limitations

1. Annotations use character offsets — editing the underlying text invalidates all annotation positions. The D1 workflow addresses this by locking the transcript during annotation.
2. The RichTextEditor produces HTML — the feedback is stored as HTML in the database.
3. Audio comments are limited to webm format.
4. No collaborative annotation — only one teacher can annotate at a time.
5. The `AnnotatableTranscript` component was deleted in v0.8.1g — Speaking and Writing now share `AnnotatableText`.
