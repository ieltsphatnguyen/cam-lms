# 05 — Publishing Workflow

**Last Updated:** v0.9.9 (2026-08-03)

## Purpose

Documents the behavioural workflow for the publish lifecycle — from draft state through publishing, snapshot creation, student viewing, teacher re-editing, and re-publishing. This describes *how the system behaves* when feedback is published, what exactly is snapshotted, and what students read at each stage.

---

## Actors

- **Teacher** — edits draft data, publishes, re-edits, re-publishes
- **Student** — reads published snapshots

---

## Prerequisites

- Teacher has opened a student submission for grading (see `02_Grading_Workflow.md`)
- Teacher has created annotations, comments, formatting, feedback, and/or criterion scores

---

## Flowchart

```
┌─────────────────────────────────────┐
│  DRAFT STATE                          │
│  Teacher edits:                       │
│  - Annotations + comments             │
│  - Text formatting                     │
│  - Feedback                            │
│  - Transcript (speaking)               │
│  - Criterion scores                    │
│  All saved to LIVE tables              │
│  Student sees: NOTHING or previous     │
│  published version                     │
└──────────────┬──────────────────────┘
               │
               ▼ Publish Feedback (publish_feedback RPC)
               │
┌─────────────────────────────────────┐
│  SNAPSHOT CREATION (atomic)           │
│                                       │
│  1. Save feedback + transcript        │
│  2. Snapshot annotations + comments   │
│     → published_annotation_snapshots  │
│  3. Snapshot text formats              │
│     → published_text_format_snapshots  │
│  4. Compute overall band               │
│  5. Snapshot criterion scores + band   │
│     → published_score_snapshots        │
│  6. Set feedback_published = true      │
│  7. Create/update grading record       │
│  8. Notify student                     │
│     → feedback_published (first)       │
│     → feedback_updated (re-publish)     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  STUDENT VIEW                         │
│  Student opens SubmissionReview:       │
│  - get_student_feedback RPC            │
│    (checks feedback_published = true)  │
│  - get_published_annotations RPC      │
│    (reads from snapshots)              │
│  - get_published_text_formats RPC     │
│    (reads from snapshots)              │
│  - get_published_scores RPC            │
│    (reads from snapshots)              │
│  Student sees: published feedback,    │
│  annotations, formatting, scores       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  TEACHER EDITS AFTER PUBLISHING       │
│  Teacher modifies annotations,        │
│  feedback, scores, etc.                │
│  → dirty = true                        │
│  Student still sees OLD snapshots      │
│  (unchanged)                           │
└──────────────┬──────────────────────┘
               │
               ▼ Re-publish (publish_feedback RPC again)
               │
┌─────────────────────────────────────┐
│  SNAPSHOT REPLACEMENT (atomic)        │
│                                       │
│  1. Delete old snapshots for attempt  │
│     - published_annotation_snapshots  │
│     - published_text_format_snapshots  │
│     - published_score_snapshots        │
│  2. Create new snapshots from current  │
│     live data                          │
│  3. feedback_published stays true      │
│  4. Update grading record              │
│  5. Notify student: feedback_updated    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  STUDENT SEES NEW VERSION             │
│  Student opens SubmissionReview:       │
│  → reads from NEW snapshots            │
│  → sees updated feedback, annotations, │
│    formatting, scores                  │
└─────────────────────────────────────┘
```

---

## Step-by-Step Detail

### Stage 1 — Draft State

During grading, all teacher work is saved to live (non-snapshot) tables:

| Data | Live Table | Student-Visible? |
|------|-----------|-----------------|
| Annotations + comments | `annotations`, `annotation_comments` | No |
| Text formatting | `text_formats` | No |
| Criterion scores | `criterion_scores` | No |
| Feedback text | `student_attempts.feedback` | No |
| Transcript | `student_attempts.transcript` | No |

**What the student sees during draft:**
- **Never published before:** Nothing — no feedback, no annotations, no scores, no formatting
- **Previously published:** The PREVIOUS published snapshot (completely unchanged by draft edits)

**Critical isolation:** The student reads exclusively from snapshot tables. Teacher draft edits to live tables have zero effect on what the student sees. This isolation is the core design principle of the publishing workflow.

**Architecture reference:** `07_Annotation_Architecture.md` → Feedback Publishing Flow

### Stage 2 — Publish Feedback

**Trigger:** Teacher clicks "Publish Feedback" in AnnotationWorkspace

**Button availability:**
- **Enabled** when `dirty = true` (unsaved changes) OR `published = false` (never published)
- **Disabled** when `dirty = false` AND `published = true` (nothing new)

**RPC:** `publish_feedback(attempt_id)`

**What happens (all atomically in one database transaction):**

#### 2a — Save Current Content

1. Saves feedback via `save_feedback(attempt_id, feedback)`
2. Saves transcript via `save_transcript(attempt_id, transcript)` (speaking only)

#### 2b — Snapshot Annotations + Comments

All annotations and their associated comments are copied from live tables into the snapshot table:

- **Source:** `annotations` + `annotation_comments` (joined)
- **Destination:** `published_annotation_snapshots`
- **Data copied:** annotation ID, attempt ID, criterion ID, start/end offsets, selected text, highlight color, comment content (text or audio path), comment type

#### 2c — Snapshot Text Formats

All text format records are copied:

- **Source:** `text_formats`
- **Destination:** `published_text_format_snapshots`
- **Data copied:** format ID, attempt ID, start/end offsets, bold/italic/underline/strikethrough flags

#### 2d — Compute Overall Band

The `compute_overall_band` RPC calculates the authoritative overall band from the four criterion scores using IELTS truncation rules:

| Average Remainder | Result |
|---|---|
| .00 | .0 |
| .25 | .0 |
| .50 | .5 |
| .75 | .5 |

If any criterion is NULL, overall band is NULL.

#### 2e — Snapshot Criterion Scores

All criterion scores + the computed overall band are copied:

- **Source:** `criterion_scores` + computed overall band
- **Destination:** `published_score_snapshots`
- **Data copied:** attempt ID, criterion ID, score, overall band score

#### 2f — Mark as Published

Sets `student_attempts.feedback_published = true`

#### 2g — Create/Update Grading Record

Creates or updates a row in `grading` with:
- `submission_id` = attempt ID
- `grading_status` = `'completed'` or `'graded'`
- `grader_id` = teacher's profile ID
- `overall_band_score` = computed overall band

#### 2h — Notify Student

Creates a notification row in `notifications`:
- **First publish** (`feedback_published` was `false`): type = `feedback_published`
- **Re-publish** (`feedback_published` was already `true`): type = `feedback_updated`
- Link = `/student-assignments`

**State after publish:**
- `student_attempts.feedback_published = true`
- Three snapshot tables populated for this attempt
- `grading` record updated
- `notifications` row for student
- Teacher UI: `dirty = false`, `published = true`, "Published" badge shown

### Stage 3 — Student View

**Page:** `src/pages/student/SubmissionReview.tsx`

The student opens the assignment item. SubmissionReview fetches data exclusively from published sources:

| RPC | Source | Returns |
|-----|--------|---------|
| `get_student_feedback` | `student_attempts` (checks `feedback_published = true`) | Feedback text + transcript |
| `get_published_annotations` | `published_annotation_snapshots` | Annotations + comments |
| `get_published_text_formats` | `published_text_format_snapshots` | Text formatting |
| `get_published_scores` | `published_score_snapshots` | Criterion scores + overall band |

**If `feedback_published = false`:** All four RPCs return empty/null. The student sees nothing.

**Display order in SubmissionReview:**
1. **Question** — the original prompt
2. **Submission** — student's written response or audio + transcript
3. **Teacher Feedback** — rendered HTML (always before scores)
4. **Teacher Notes** — criterion-grouped annotation tags with inline score badges, clickable to open CommentModal in read-only mode
5. **Overall Band** — single highlighted card with overall band score

**Architecture reference:** `15_Scoring_Architecture.md` → Teacher Feedback Flow

### Stage 4 — Teacher Edits After Publishing

After publishing, the teacher can continue editing:
- Modify annotations (add, delete, move)
- Add or remove comments
- Change text formatting
- Edit feedback text
- Update criterion scores

Each change sets `dirty = true`. The Publish button becomes enabled again.

**What the student sees during this stage:** The OLD published snapshots — completely unchanged. The student has no indication that the teacher is editing. This is the core draft/published isolation guarantee.

### Stage 5 — Re-publish

The teacher clicks "Publish Feedback" again.

**RPC:** `publish_feedback(attempt_id)` (same RPC as first publish)

**What happens differently from first publish:**

1. **Delete old snapshots:** All existing rows for this `attempt_id` are deleted from:
   - `published_annotation_snapshots`
   - `published_text_format_snapshots`
   - `published_score_snapshots`

2. **Create new snapshots:** Fresh snapshots are created from the current live data (same as Stage 2b–2e)

3. **`feedback_published` stays `true`** (it was already true)

4. **Notification type:** Since `feedback_published` was already `true`, the notification type is `feedback_updated` (not `feedback_published`)

**State after re-publish:**
- Three snapshot tables contain NEW snapshots (old ones deleted)
- `notifications` row: type = `feedback_updated`
- Teacher UI: `dirty = false`, `published = true`

### Stage 6 — Student Sees New Version

The student opens SubmissionReview again. The RPCs read from the NEW snapshots. The student sees the updated feedback, annotations, formatting, and scores.

There is no "version history" for the student — they always see the latest published version. Previous published versions are deleted on re-publish.

---

## What Exactly Is Snapshotted

### Annotation Snapshots (`published_annotation_snapshots`)

Each snapshot row contains:
- The annotation's criterion ID
- Start and end character offsets
- The selected text excerpt
- The highlight color
- Associated comments (text content or audio path, comment type)

This is a complete copy of the annotation + its comments at publish time.

### Text Format Snapshots (`published_text_format_snapshots`)

Each snapshot row contains:
- Start and end character offsets
- Bold, italic, underline, strikethrough flags

This is a complete copy of the formatting at publish time.

### Score Snapshots (`published_score_snapshots`)

Each snapshot row contains:
- Criterion ID
- Score (0.0–9.0 or NULL)
- Overall band score (stored once per attempt, not per criterion)

This is a complete copy of all criterion scores + the computed overall band at publish time.

### Feedback and Transcript

Feedback and transcript are NOT snapshotted into separate tables. They remain on `student_attempts.feedback` and `student_attempts.transcript`. The `get_student_feedback` RPC checks `feedback_published = true` before returning them, providing the same isolation guarantee.

---

## What Students Read

Students interact with four RPCs, each of which only returns data when `feedback_published = true`:

| RPC | Reads From | Returns When Published | Returns When Not Published |
|-----|-----------|----------------------|---------------------------|
| `get_student_feedback` | `student_attempts` | Feedback + transcript | null/empty |
| `get_published_annotations` | `published_annotation_snapshots` | Annotations + comments | empty array |
| `get_published_text_formats` | `published_text_format_snapshots` | Text formats | empty array |
| `get_published_scores` | `published_score_snapshots` | Scores + overall band | empty array |

**No grading information bypasses publication.** The `fetchAttemptForItem` function in `attempts.ts` explicitly excludes the `feedback` and `transcript` columns from its select — only `get_student_feedback` returns those, and only when published.

---

## Snapshot Lifecycle Summary

```
First Publish:
  Live tables → Copy → Snapshot tables (new rows)
  feedback_published: false → true
  Notification: feedback_published

Teacher Edits:
  Live tables updated
  Snapshot tables UNCHANGED
  Student sees OLD snapshots

Re-publish:
  Snapshot tables → DELETE all rows for attempt
  Live tables → Copy → Snapshot tables (new rows)
  feedback_published: stays true
  Notification: feedback_updated

Student Views:
  Reads from snapshot tables (always latest published version)
  No access to live tables
  No version history
```

---

## Tables Involved

| Table | Role in publishing workflow |
|-------|----------------------------|
| `student_attempts` | Stores feedback, transcript, `feedback_published` flag |
| `annotations` | Live teacher draft annotations (source for snapshot) |
| `annotation_comments` | Live teacher draft comments (source for snapshot) |
| `text_formats` | Live teacher draft formatting (source for snapshot) |
| `criterion_scores` | Live teacher draft scores (source for snapshot) |
| `published_annotation_snapshots` | Immutable snapshot of annotations + comments (student reads) |
| `published_text_format_snapshots` | Immutable snapshot of formatting (student reads) |
| `published_score_snapshots` | Immutable snapshot of scores + overall band (student reads) |
| `grading` | Grading record with `overall_band_score` |
| `notifications` | Student notification on publish/re-publish |

## RPCs Involved

| RPC | Purpose |
|-----|---------|
| `publish_feedback` | Snapshot all data, mark published, notify student |
| `unpublish_feedback` | Unpublish feedback (removes published state) |
| `save_feedback` | Save feedback text (called before snapshot) |
| `save_transcript` | Save transcript text (called before snapshot, speaking only) |
| `compute_overall_band` | Server-side overall band calculation (called during snapshot) |
| `get_student_feedback` | Student retrieves published feedback + transcript |
| `get_published_annotations` | Student retrieves published annotation snapshots |
| `get_published_text_formats` | Student retrieves published text format snapshots |
| `get_published_scores` | Student retrieves published score snapshots |

## Pages & Components

| Page / Component | Role |
|------------------|------|
| `AnnotationWorkspace` | Teacher edits and publishes |
| `SubmissionReview` | Student reads published feedback |
| `AnnotatableText` | Renders annotated text (teacher: live, student: snapshots) |
| `CommentModal` | Teacher: editable comments; Student: read-only comments |
| `ExaminerNotesPanel` | Teacher: criterion-grouped annotations |
| `SnapshotViewerModal` | Teacher: read-only view of historical published snapshots |

---

## Related Architecture Documents

- `07_Annotation_Architecture.md` — feedback publishing flow, snapshot creation, draft/published isolation
- `15_Scoring_Architecture.md` — draft vs published lifecycle, score snapshots, notification emission
- `09_StudentDashboard_Architecture.md` — student feedback review flow
- `08_Grading_Architecture.md` — snapshot inspection for historical submissions
