# 02 — Grading Workflow

**Last Updated:** v0.9.9 (2026-08-03)

## Purpose

Documents the behavioural workflow from the moment a teacher opens a student submission through to publishing feedback. This describes *how the system behaves* during grading — what becomes visible, when state changes, and what the student sees at each stage. For implementation details, reference the architecture documents linked throughout.

---

## Actors

- **Teacher** — grades the submission, creates annotations, writes feedback, assigns scores, publishes
- **Student** — receives the published feedback (only after Publish)

---

## Prerequisites

- A student has submitted an attempt (see `01_Submission_Workflow.md`)
- The teacher has navigated to the attempt in the grading hierarchy
- The teacher is signed in and owns the class containing the assignment

---

## Flowchart

```
┌─────────────────────────────────────┐
│  Teacher opens submission             │
│  (TeacherGradingPage → AnnotationWorkspace) │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Data loads:                          │
│  - Annotations + comments             │
│  - Text formats                        │
│  - Rubric criteria                    │
│  - Criterion scores                   │
│  - Feedback + transcript (if speaking) │
│  - Audio URL (if speaking)             │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌────────────┐  ┌─────────────────┐
│ Writing    │  │ Speaking         │
│ (direct    │  │ Phase 1:         │
│  annotate) │  │ Transcript Edit  │
└──────┬────┘  └──────┬──────────┘
       │              │
       │              ▼
       │       ┌─────────────────┐
       │       │ Phase 2:         │
       │       │ Annotate transcript│
       │       └──────┬──────────┘
       │              │
       ▼              ▼
┌─────────────────────────────────────┐
│  Teacher annotates:                   │
│  - Select text → FloatingToolbar       │
│  - Assign criterion → highlight         │
│  - Add text/audio comment              │
│  - Apply formatting (independent layer) │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Teacher Notes panel                  │
│  (ExaminerNotesPanel — grouped by     │
│   criterion, click to flash & scroll)  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Teacher writes feedback             │
│  (RichTextEditor → HTML output)       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Teacher assigns criterion scores    │
│  (0.0–9.0 or NULL, step 0.5)          │
│  → Overall band auto-calculated       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Save Draft                           │
│  → Saves to live tables (dirty=false) │
│  → Student sees NOTHING (or previous   │
│    published version)                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Publish Feedback                      │
│  → Snapshots all data                  │
│  → feedback_published = true           │
│  → Student notified                    │
│  → Student sees NEW published version  │
└─────────────────────────────────────┘
```

---

## Step-by-Step Detail

### Step 1 — Teacher Opens Submission

**Page:** `src/pages/teacher/TeacherGradingPage.tsx`
**Component:** `src/components/annotations/AnnotationWorkspace.tsx`

The teacher navigates the grading hierarchy (Classes → Assignments → Items → Students) and clicks a student's attempt. The AnnotationWorkspace opens in the right panel.

**What loads on open:**
- `fetchRubricCriteria(item.type_id)` — criteria for the question type
- `fetchAnnotations(attempt.id)` — existing annotations + comments (teacher draft)
- `fetchTextFormats(attempt.id)` — existing text formatting (teacher draft)
- `fetchCriterionScores(attempt.id)` — existing criterion scores (teacher draft)
- Feedback and transcript from the attempt record (if speaking)
- Audio signed URL via `getAudioUrl(audioPath)` (if speaking)

**Architecture reference:** `08_Grading_Architecture.md` → Grading Hierarchy Flow

### Step 2 — Writing vs Speaking Workflow

#### Writing (Direct Annotation)

The student's written response is rendered directly in `AnnotatableText`. The teacher can immediately select text and annotate.

#### Speaking (Two-Phase Workflow)

Speaking uses a two-phase workflow:

**Phase 1 — Transcript Editing:**
- Teacher types or pastes the transcript in a plain-text textarea
- A warning notice explains the transcript will be locked once annotation begins
- Paste is sanitized to plain text (HTML, images, formatting stripped)
- Teacher clicks "Start Annotation" → transcript is saved via `save_transcript` RPC → transitions to Phase 2

**Phase 2 — Annotation:**
- Transcript is locked (read-only)
- `AnnotatableText` renders the transcript with annotation support
- "Edit Transcript" button allows returning to Phase 1
  - If annotations exist, a confirmation modal warns all annotations will be deleted
  - Confirming clears all annotations and returns to Phase 1

**Auto-phase detection:** On load, if annotations already exist for the attempt, the workspace starts in Phase 2. If no annotations exist, it starts in Phase 1.

**Architecture reference:** `07_Annotation_Architecture.md` → D1 Two-Phase Speaking Workflow

### Step 3 — Annotation Creation

**Component:** `src/components/annotations/FloatingToolbar.tsx`

The teacher selects text in `AnnotatableText`. The FloatingToolbar appears at the selection position.

**Actions available:**
1. **Assign criterion** — hover dropdown, creates annotation with criterion + highlight color
2. **Add text comment** — creates annotation with null criterion, opens CommentModal
3. **Add audio comment** — creates annotation with null criterion, opens CommentModal for recording
4. **Apply formatting** (Bold, Italic, Underline, Strikethrough) — creates/updates/deletes records in `text_formats` table (independent visual layer, NOT annotations)

**Highlight color rules:**
- Color is determined ONLY by the assigned criterion
- Text/audio comments do NOT change the highlight color
- Small badges appear inline: speech bubble (text comment), headphone (audio comment)

**Annotation auto-cleanup:** When all comments are deleted from an annotation that has no criterion and no audio, the annotation is automatically deleted from the database.

**Tables:**
- `annotations` — highlight ranges, criterion, comment flags
- `annotation_comments` — text or audio comments per annotation
- `text_formats` — independent formatting layer

**RPCs:**
- `save_annotation` (create/update modes)
- `delete_annotation`
- `move_annotation`
- `save_annotation_comment`
- `delete_annotation_comment`
- `save_text_format` / `delete_text_format`

**Architecture reference:** `07_Annotation_Architecture.md` → Annotation Creation Flow

### Step 4 — Teacher Notes Panel

**Component:** `src/components/annotations/ExaminerNotesPanel.tsx`

Displays annotations grouped by rubric criterion. Shows:
- Criterion name as section header
- Selected text excerpt for each annotation
- Text/audio comment indicators
- Click to flash and scroll to the annotation in the main text

Annotations without a criterion are NOT displayed in this panel.

### Step 5 — Feedback

**Component:** `src/components/annotations/RichTextEditor.tsx`

The teacher writes feedback in a ContentEditable-based rich text editor. Supports bold, italic, underline, and lists. Output is stored as HTML.

**RPC:** `save_feedback(attempt_id, feedback)` — saves to `student_attempts.feedback` column

For speaking, the teacher transcript is saved separately via `save_transcript(attempt_id, transcript)`.

### Step 6 — Criterion Scores & Overall Band

**Component:** Criterion score inputs in AnnotationWorkspace (below Teacher Notes)

The teacher enters numeric scores (0.0–9.0 or NULL, step 0.5) for each rubric criterion:

| Question Type | Criteria |
|---------------|----------|
| Writing Task 1/2 | Task Response, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy |
| Speaking Part 1/2/3 | Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation |

**Overall band calculation:** Automatically computed from the four criterion scores using IELTS truncation rules:

| Average Remainder | Result |
|---|---|
| .00 | .0 |
| .25 | .0 |
| .50 | .5 |
| .75 | .5 |

Only calculated when ALL four criteria have a score. If any criterion is NULL, overall band is NULL.

Both client-side (`computeOverallBand` in `annotations.ts`) and server-side (`compute_overall_band` RPC) use the same algorithm. The server-side version is authoritative during publish.

**Table:** `criterion_scores` — per-criterion scores (teacher draft)

**RPC:** `save_criterion_score(attempt_id, criterion_id, score)`

**Architecture reference:** `15_Scoring_Architecture.md` → Scoring Workflow

### Step 7 — Save Draft

The teacher clicks "Save Draft" (Writing) or "Save Progress" (Speaking).

**What happens:**
1. `save_feedback(attempt_id, feedback)` — saves feedback to `student_attempts.feedback`
2. `save_transcript(attempt_id, transcript)` — saves transcript (speaking only)
3. Annotations, comments, text formats, and criterion scores are already saved incrementally as the teacher works
4. `dirty` state is set to `false`

**What the student sees:** Nothing changes. The student either sees no feedback (if never published) or the PREVIOUS published version. Draft saves are invisible to students.

**Critical distinction:** Save Draft saves to live teacher-side tables (`annotations`, `text_formats`, `criterion_scores`, `student_attempts.feedback`). Students read from snapshot tables (`published_annotation_snapshots`, `published_text_format_snapshots`, `published_score_snapshots`) which are only updated on Publish.

### Step 8 — Publish Feedback

The teacher clicks "Publish Feedback".

**RPC:** `publish_feedback(attempt_id)`

The Publish button is only enabled when `dirty = true` (there are unsaved changes) or feedback has not yet been published. It is disabled when not dirty and already published.

**What happens (all atomically in one RPC):**
1. Saves current feedback and transcript
2. Snapshots all annotations + comments → `published_annotation_snapshots`
3. Snapshots all text formats → `published_text_format_snapshots`
4. Computes overall band via `compute_overall_band` RPC
5. Snapshots criterion scores + overall band → `published_score_snapshots`
6. Sets `student_attempts.feedback_published = true`
7. Creates/updates `grading` record with `overall_band_score`
8. Creates notification for student:
   - `feedback_published` — first publish (when `feedback_published` was previously `false`)
   - `feedback_updated` — re-publish (when `feedback_published` was already `true`)

**After publish:**
- `dirty = false`
- `published = true`
- Student sees the NEW published version immediately

**Architecture reference:** `15_Scoring_Architecture.md` → Draft vs Published Lifecycle

---

## Draft State vs Published State

### Draft State (teacher editing)

All teacher work is saved to live tables:

| Data | Live Table | Student-Visible? |
|------|-----------|-----------------|
| Annotations + comments | `annotations`, `annotation_comments` | No |
| Text formatting | `text_formats` | No |
| Criterion scores | `criterion_scores` | No |
| Feedback text | `student_attempts.feedback` | No |
| Transcript | `student_attempts.transcript` | No |

During draft, the student sees:
- **Never published before:** Nothing (no feedback, no annotations, no scores)
- **Previously published:** The PREVIOUS published snapshot (unchanged)

### Published State (after Publish Feedback)

All data is snapshotted to immutable tables:

| Data | Snapshot Table | Student-Visible? |
|------|---------------|-----------------|
| Annotations + comments | `published_annotation_snapshots` | Yes |
| Text formatting | `published_text_format_snapshots` | Yes |
| Criterion scores + overall band | `published_score_snapshots` | Yes |
| Feedback text | `student_attempts.feedback` (via `get_student_feedback` RPC, checks `feedback_published`) | Yes |
| Transcript | `student_attempts.transcript` (via `get_student_feedback` RPC) | Yes |

---

## Dirty State Tracking

Every grading change marks the attempt `dirty = true`:

- Feedback edits
- Transcript edits
- Annotation creation / deletion / movement
- Comment creation / deletion (text and audio)
- Criterion score changes
- Text format changes

`dirty` is set to `false` by:
- Save Draft / Save Progress
- Publish Feedback

The Publish button is **disabled** when:
- `dirty = false` AND `published = true` (nothing new to publish)

The Publish button is **enabled** when:
- `dirty = true` (unsaved changes exist)
- `published = false` (feedback has never been published)

**Architecture reference:** `07_Annotation_Architecture.md` → Dirty State

---

## What Becomes Visible and When

| Event | Teacher sees | Student sees |
|-------|-------------|--------------|
| Teacher opens attempt | All live draft data | Nothing or previous published version |
| Teacher annotates | New annotation appears immediately | No change |
| Teacher writes feedback | Feedback appears in editor | No change |
| Teacher assigns scores | Score inputs + overall band update | No change |
| Save Draft | Data saved to DB, dirty=false | No change |
| Publish Feedback | Published badge, dirty=false | NEW: feedback, annotations, scores, formatting |
| Teacher edits after publish | Edits appear immediately | OLD published version (unchanged) |
| Re-publish | New snapshot replaces old | NEW version replaces old |

---

## Tables Involved

| Table | Role |
|-------|------|
| `student_attempts` | Attempt data, feedback, transcript, feedback_published flag |
| `annotations` | Teacher draft annotations |
| `annotation_comments` | Teacher draft comments |
| `text_formats` | Teacher draft formatting |
| `rubric_criteria` | Criteria definitions per question type |
| `criterion_scores` | Teacher draft scores |
| `grading` | Grading record with overall_band_score |
| `published_annotation_snapshots` | Published annotation snapshot |
| `published_text_format_snapshots` | Published formatting snapshot |
| `published_score_snapshots` | Published score snapshot |
| `notifications` | Student notification on publish |

## RPCs Involved

| RPC | Purpose |
|-----|---------|
| `get_rubric_criteria` | Fetch criteria for question type |
| `get_attempt_annotations` | Fetch live annotations (teacher) |
| `save_annotation` | Create/update annotation |
| `delete_annotation` | Delete annotation + comments |
| `move_annotation` | Move annotation to different criterion |
| `save_annotation_comment` | Create/update comment |
| `delete_annotation_comment` | Delete comment |
| `get_text_formats` | Fetch live text formats (teacher) |
| `save_text_format` | Create/update text format |
| `delete_text_format` | Delete text format |
| `save_feedback` | Save feedback text |
| `save_transcript` | Save transcript text |
| `save_criterion_score` | Save criterion score |
| `get_criterion_scores` | Fetch live criterion scores |
| `compute_overall_band` | Server-side overall band calculation |
| `publish_feedback` | Snapshot all data, mark published, notify student |
| `unpublish_feedback` | Unpublish feedback |

## Pages & Components

| Page / Component | Role |
|------------------|------|
| `TeacherGradingPage` | Grading hierarchy + workspace host |
| `AnnotationWorkspace` | Main grading workspace |
| `AnnotatableText` | Segmented text display with highlights |
| `FloatingToolbar` | Criterion dropdown + formatting toolbar |
| `CommentModal` | Text/audio comment editor |
| `RichTextEditor` | Feedback editor |
| `ExaminerNotesPanel` | Criterion-grouped annotation list |

---

## Related Architecture Documents

- `07_Annotation_Architecture.md` — annotation engine, D1 workflow, formatting layer
- `08_Grading_Architecture.md` — grading hierarchy, audio playback
- `15_Scoring_Architecture.md` — scoring, draft/published lifecycle, notification emission
- `12_UI_Workflows.md` — golden path grading workflow
