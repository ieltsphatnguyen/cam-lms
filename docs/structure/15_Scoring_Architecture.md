# 15 — Scoring, Notifications & Published Feedback Architecture

**Last Updated:** v0.9.0a (2026-08-03)

## Purpose

This subsystem implements the complete IELTS scoring workflow, notification system, and published feedback lifecycle. Students receive teacher feedback, criterion scores, overall band, teacher comments, and annotations ONLY after teachers publish. No grading information leaks before publication.

## Components

### AnnotationWorkspace (updated v0.9.0)
The teacher grading workspace now includes:
- **Criterion Score Inputs** — numeric inputs (0.0–9.0 or empty) for each rubric criterion, displayed below Teacher Notes
- **Overall Band Display** — automatically calculated from criterion scores using IELTS rounding rules
- **Request Revision Button** — marks the attempt as needing revision and notifies the student

### SubmissionViewerView (updated v0.9.1)
`src/pages/teacher/TeacherGradingPage.tsx` — the teacher grading view now shows:
1. **Breadcrumb** — existing class/assignment/student breadcrumb (unchanged)
2. **Current Submission Card** — always shows the newest submission being graded, with submission number, status (Resubmitted if applicable), and Published/Draft badge
3. **Grading Workspace** — the AnnotationWorkspace, operating on the Current Submission only
4. **Submission History** — read-only list of older submissions, each with date, overall band, status, and "Open Snapshot" button

### SnapshotViewerModal (new v0.9.1)
`src/components/annotations/SnapshotViewerModal.tsx` — read-only modal for inspecting historical submissions. Displays:
- Student response (text or audio + transcript)
- Teacher feedback
- Teacher notes (criterion-grouped annotations)
- Criterion score cards + overall band

Nothing is editable. Reuses existing `fetchPublished*` functions.

### SubmissionReview (updated v0.9.0a)
The student feedback review page now shows, in order:
1. **Question** — the original prompt
2. **Submission** — student's written response or transcript
3. **Teacher Feedback** — rendered HTML feedback (always before scores)
4. **Teacher Notes** — criterion-grouped annotation tags with inline score badges, clickable to open CommentModal
5. **Overall Band** — single highlighted card with overall band score

Removed in v0.9.0a: Teacher Comments section (comment-only annotations without criterion) and duplicate Criterion Score Cards. Scores now appear only as inline badges next to each criterion name in Teacher Notes.

### NotificationsPanel (new)
`src/components/shared/NotificationsPanel.tsx` — reusable component showing notifications with unread badges, mark-all-read, and click-to-navigate. Used by both Teacher and Student dashboards.

## Library Modules

### `src/lib/annotations.ts` (scoring functions)

| Function | Purpose |
|----------|---------|
| `fetchCriterionScores(attemptId)` | Teacher: fetch live criterion scores |
| `saveCriterionScore(attemptId, criterionId, score)` | Teacher: save a criterion score (NULL allowed) |
| `fetchPublishedScores(attemptId)` | Student: fetch published score snapshots |
| `requestRevision(attemptId, notes?)` | Teacher: request revision, notify student |
| `computeOverallBand(scores[])` | Client-side IELTS overall band calculation |

### `src/lib/notifications.ts` (new)

| Function | Purpose |
|----------|---------|
| `fetchNotifications(recipientId)` | Fetch notifications for a user |
| `markNotificationRead(id)` | Mark a single notification as read |
| `markAllNotificationsRead(recipientId)` | Mark all notifications as read |
| `notifyTeacherOfSubmission(attemptId)` | Legacy client-side call (now handled server-side in submit_attempt RPC) |

## Database Tables

| Table | Purpose |
|-------|---------|
| `criterion_scores` | Per-criterion scores (0.0–9.0 or NULL) — teacher draft |
| `published_score_snapshots` | Immutable snapshot of scores + overall band at publish time (student reads) |
| `notifications` | Dashboard notifications for teachers and students |
| `grading` | Grading records (now includes `overall_band_score`) |
| `student_attempts` | Added `revision_requested` and `revision_notes` columns |

## RPCs

| RPC | Purpose |
|-----|---------|
| `save_criterion_score` | Insert/update a criterion score (teacher) |
| `get_criterion_scores` | Fetch live criterion scores (teacher) |
| `get_published_scores` | Fetch published score snapshots (student, published only) |
| `compute_overall_band` | Server-side IELTS overall band calculation |
| `request_revision` | Mark revision requested, notify student |
| `get_notifications` | Fetch notifications for a user |
| `mark_notification_read` | Mark a notification as read |
| `mark_all_notifications_read` | Mark all notifications as read |
| `notify_teacher_of_submission` | Create notification for teacher after student submits |
| `publish_feedback` | Updated: snapshots scores + notifies student (emits `feedback_published` on first publish, `feedback_updated` on re-publish) |
| `submit_attempt` | Updated v0.9.1: now calls `notify_teacher_of_submission` internally (server-side, reliable) |

## Scoring Workflow

### Criterion Scores

**Writing (4 criteria):**
- Task Response
- Coherence & Cohesion
- Lexical Resource
- Grammatical Range & Accuracy

**Speaking (4 criteria):**
- Fluency & Coherence
- Lexical Resource
- Grammatical Range & Accuracy
- Pronunciation

Each criterion supports:
- NULL (not yet scored)
- 0.0–9.0 (free input, step 0.5)

### Overall Band Calculation (v0.9.0a)

### Project Rounding Rules

Each criterion accepts NULL, whole band, or .5 band. Averages produce .00, .25, .50, or .75. The project uses **truncation** (not IELTS round-up):

| Average Remainder | Result |
|---|---|
| .00 | .0 |
| .25 | .0 |
| .50 | .5 |
| .75 | .5 |

### Examples

```
6 + 6 + 6 + 7 = 25 / 4 = 6.25 → Overall Band 6.0
6 + 7 + 7 + 7 = 27 / 4 = 6.75 → Overall Band 6.5
```

### Single Source of Truth

Both the client helper (`computeOverallBand` in `src/lib/annotations.ts`) and the database RPC (`compute_overall_band`) use the exact same algorithm. They must not diverge.

The overall band is automatically calculated using IELTS rounding rules:
- Only calculated when ALL required criteria have a score
- If any criterion is NULL → overall remains NULL
- Average of 4 scores, rounded to nearest 0.5 using IELTS .25/.75 rules:
  - .00 → stays
  - .25 → rounds up to .5
  - .5 → stays
  - .75 → rounds up to next whole

Both client-side (`computeOverallBand` in annotations.ts) and server-side (`compute_overall_band` RPC) implementations exist. The server-side version is used during `publish_feedback` to store the authoritative value.

## Teacher Feedback Flow

Student page displays in this order:
```
Question
↓
Submission
↓
Teacher Feedback (always before scores)
↓
Teacher Notes (criterion-grouped annotations with score badges)
↓
Criterion Score Cards (one per criterion)
↓
Overall Band Card
```

## Teacher Grading Workflow (v0.9.1)

### Current Submission vs History

When a teacher opens a student, they see:
1. **Current Submission Card** — the newest submission, always labeled with its submission number and status
2. **Grading Workspace** — operates on the Current Submission only
3. **Submission History** — read-only list of older submissions below the workspace

The Current Submission never appears in the history list. History is chronological, newest first. Each history card shows:
- Submission number
- Submitted date/time
- Overall Band (if scored)
- Status (Published/Draft)
- Revision Requested badge (if applicable)
- "Open Snapshot" button → opens SnapshotViewerModal

### Submission Numbering

Submissions are numbered chronologically: Submission 1 = oldest, Submission N = newest. The number is derived from the attempt's position in the full history list (sorted oldest-first).

## Draft vs Published Lifecycle

```
1. Teacher edits feedback, scores, annotations, comments
   → All changes are Draft (saved to live tables)
   → Student sees the PREVIOUS published version (or nothing)

2. Teacher clicks "Publish Feedback"
   → publish_feedback RPC:
     a. Snapshots annotations + comments → published_annotation_snapshots
     b. Snapshots text formats → published_text_format_snapshots
     c. Computes overall band
     d. Snapshots criterion scores + overall band → published_score_snapshots
     e. Sets feedback_published = true
     f. Creates/updates grading record with overall_band_score
     g. Creates notification for student: 'feedback_published' (first publish) or 'feedback_updated' (re-publish)
   → Everything updates simultaneously — no partial updates

3. Student views feedback
   → fetchStudentFeedback() — returns feedback only if published
   → fetchPublishedAnnotations() — reads from snapshots
   → fetchPublishedTextFormats() — reads from snapshots
   → fetchPublishedScores() — reads from snapshots
   → All return empty/null if not published

4. Teacher edits after publishing (re-publish)
   → Teacher edits → dirty = true
   → Student still sees OLD published snapshot
   → Teacher clicks Publish again
   → Old snapshots deleted, new snapshots created
   → Student sees NEW version
```

## Revision Requests

```
1. Teacher clicks "Request Revision"
   → request_revision RPC:
     a. Sets revision_requested = true on student_attempts
     b. Updates grading_status to 'revision_requested'
     c. Creates 'revision_requested' notification for student

2. Student receives notification
   → "Revision Requested" appears in notifications

3. Student resubmits
   → submit_attempt RPC called
   → submit_attempt internally calls notify_teacher_of_submission (server-side, reliable)
   → Teacher sees "Resubmission Received" in notifications
```

## Notification Link Navigation (v0.9.1 fix)

Notification `link` values are stored as URL paths (e.g. `/teacher-grading`, `/student-assignments`).
Dashboard `NotificationsPanel` transforms these to route identifiers by stripping the leading slash and converting remaining slashes to hyphens: `link.replace(/^\//, '').replace(/\//g, '-')`.

| Notification | DB `link` | Route | Page |
|---|---|---|---|
| `new_submission` / `resubmission` | `/teacher-grading` | `teacher-grading` | Teacher Grading Page |
| `feedback_published` / `feedback_updated` | `/student-assignments` | `student-assignments` | Student Assignments Page |
| `revision_requested` | `/student-assignments` | `student-assignments` | Student Assignments Page |

## Notification Reliability (v0.9.1 fix)

Previously, `notify_teacher_of_submission` was called fire-and-forget from the client after `submit_attempt` returned. If the client died between submit and notify, the teacher never received a notification.

Now, `submit_attempt` RPC calls `notify_teacher_of_submission` internally (server-side, same transaction). The client-side fire-and-forget call has been removed from `attempts.ts`.

No duplicate notifications are created — each transition produces exactly one notification:
- Submit → 1 notification (inside `submit_attempt` RPC)
- Publish feedback → 1 notification (inside `publish_feedback` RPC)
- Request revision → 1 notification (inside `request_revision` RPC)

## Notification Types

| Type | Recipient | Trigger |
|------|-----------|---------|
| `new_submission` | Teacher | Student submits attempt |
| `resubmission` | Teacher | Student resubmits after revision request |
| `ready_to_publish` | Teacher | (Future: automated detection) |
| `feedback_published` | Student | Teacher publishes feedback |
| `revision_requested` | Student | Teacher requests revision |
| `feedback_updated` | Student | Teacher re-publishes updated feedback |

## Read-Only Student Notes

Students see the same annotations used by teachers:
- Criterion-grouped sections (Task Response, Coherence & Cohesion, etc.)
- Score badge next to each criterion name
- Highlighted text excerpts as clickable tags
- Click opens CommentModal in read-only mode
- Students can read text comments and play audio comments
- Students cannot edit, record, or delete

The existing `CommentModal` component is reused with `readOnly={true}`. No `StudentFloatingCommentModal` was created.

## Published Feedback Integrity

All student-facing data comes from snapshot tables:
- `published_annotation_snapshots` — annotations + comments
- `published_text_format_snapshots` — text formatting
- `published_score_snapshots` — criterion scores + overall band

The `get_student_feedback` RPC returns feedback/transcript only when `feedback_published = true`.

The `fetchAttemptForItem` function in `attempts.ts` excludes `feedback` and `transcript` columns from the select — only `fetchStudentFeedback` (which checks `feedback_published`) returns those.

No grading information bypasses publication.

---

## Technical Debt Investigation: Version-Based Snapshot Model

**Status:** Documentation only — no database changes in this milestone.

### Current Architecture

Each publish operation creates snapshots in three independent tables:
- `published_annotation_snapshots`
- `published_text_format_snapshots`
- `published_score_snapshots`

All three are keyed by `attempt_id`. Re-publishing deletes all existing snapshots for that attempt and re-inserts new ones. There is no parent entity that groups snapshots from a single publish operation.

### Current Limitations

1. **No publish history** — Only the latest publish is retained. Previous published versions are deleted on re-publish. Teachers cannot compare what changed between publishes.
2. **No atomic grouping** — The three snapshot tables are deleted and repopulated independently within a single RPC. If the RPC fails midway, snapshots could be left in an inconsistent state (though the transaction wraps the entire function).
3. **No audit trail** — There is no record of who published what when, beyond the `published_at` and `published_by` columns on each snapshot row.
4. **No rollback** — If a teacher accidentally publishes incorrect feedback, the previous version is already deleted. There is no way to revert to a prior published state.
5. **Snapshot-per-attempt coupling** — Snapshots are tied to `attempt_id`, but a revision cycle creates a NEW attempt. The relationship between "Submission 1's published feedback" and "Submission 2's published feedback" is implicit (same student+item), not explicit in the schema.

### Proposed Version-Based Model

Introduce a parent entity:

```sql
CREATE TABLE published_feedback_versions (
  id bigint PRIMARY KEY,
  attempt_id bigint REFERENCES student_attempts(id),
  version_number integer NOT NULL,
  overall_band_score numeric(3,1),
  published_by uuid REFERENCES auth.users(id),
  published_at timestamptz DEFAULT now(),
  UNIQUE(attempt_id, version_number)
);
```

This table would own:
- `published_annotation_snapshots` (FK → `published_feedback_versions.id`)
- `published_text_format_snapshots` (FK → `published_feedback_versions.id`)
- `published_score_snapshots` (FK → `published_feedback_versions.id`)

### Advantages

1. **Publish history** — All previous published versions are retained. Teachers can compare versions.
2. **Audit trail** — Each version has a clear `published_by`, `published_at`, and `version_number`.
3. **Rollback** — A teacher or admin could revert the student's view to a previous version by updating a `current_version_id` pointer on `student_attempts`.
4. **Atomic grouping** — All snapshots for a single publish are explicitly grouped under one parent row.
5. **Cross-submission tracking** — A query could trace the full feedback history for a student+item across all attempts and versions.

### Migration Complexity

**Medium.** The migration would involve:
1. Create `published_feedback_versions` table.
2. For each existing attempt with `feedback_published = true`, insert a version row (version 1).
3. Add `version_id` FK columns to the three snapshot tables, backfilling from step 2.
4. Update `publish_feedback` RPC to create a new version row instead of deleting old snapshots.
5. Update student-facing RPCs (`get_published_annotations`, `get_published_text_formats`, `get_published_scores`, `get_student_feedback`) to read from the current version's snapshots.
6. Optionally add a `current_version_id` column to `student_attempts` for rollback support.
7. Update frontend `fetchPublished*` functions — no API change needed if RPCs maintain the same return shape.

**Estimated scope:** 1 migration, 1 new table, 3 altered tables, 4 updated RPCs, 0 frontend changes (RPC return shapes unchanged).

### Recommendation

Defer to a future milestone. The current architecture works correctly for the single-publish-per-attempt workflow. The version-based model becomes valuable when:
- Teachers need to compare feedback versions
- Audit/rollback is required for compliance
- Multiple graders collaborate on the same attempt

Until then, the current snapshot-per-attempt model is sufficient.
