# 03 — Revision Workflow

**Last Updated:** v0.9.9 (2026-08-03)

## Purpose

Documents the behavioural workflow for the revision cycle — from the initial submission through teacher feedback, revision request, student resubmission, and the repeat cycle. This describes *how the system behaves* across multiple submission rounds, including which submissions are editable, which are read-only, and how snapshots are managed across attempts.

---

## Actors

- **Teacher** — publishes feedback, requests revision, grades the new submission
- **Student** — receives revision request, submits a new attempt

---

## Prerequisites

- Student has submitted at least one attempt (see `01_Submission_Workflow.md`)
- Teacher has opened the submission for grading (see `02_Grading_Workflow.md`)

---

## Flowchart

```
┌─────────────────────────────────────┐
│  Submission 1                        │
│  student_attempts: status=submitted   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Teacher publishes feedback          │
│  publish_feedback RPC                │
│  → feedback_published = true         │
│  → snapshots created                  │
│  → student notified: feedback_published │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Teacher requests revision           │
│  request_revision RPC                │
│  → revision_requested = true         │
│  → grading_status = 'revision_requested' │
│  → student notified: revision_requested │
│  → revision_toast shown to teacher    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Student receives notification       │
│  → "Revision Requested" in panel     │
│  → clicks → navigates to assignments  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Assignment item unlocked            │
│  Student opens item → StudentWorkspace │
│  → clicks "Start"                    │
│  → start_attempt RPC                 │
│  → OLD attempt: revision_requested   │
│    cleared, preserved for history    │
│  → NEW attempt: status=in_progress   │
│  → question content revealed          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Submission 2                        │
│  Student completes + submits         │
│  submit_attempt RPC                  │
│  → status = submitted                │
│  → notify_teacher_of_submission      │
│    emits 'resubmission' notification │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Teacher receives notification       │
│  → "Resubmission" in panel            │
│  → clicks → navigates to grading     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Teacher sees:                       │
│  - Current Submission Card           │
│    (Submission 2, "Resubmitted" badge)│
│  - Grading Workspace (editable)       │
│  - Submission History (read-only)    │
│    - Submission 1 with "Open Snapshot"│
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Teacher grades Submission 2         │
│  → Publish Feedback (or request      │
│    another revision)                 │
│  → Cycle repeats from top            │
└─────────────────────────────────────┘
```

---

## Attempt Lifecycle

### Attempt Statuses

| Status | Meaning | Editable by student? |
|--------|---------|---------------------|
| `in_progress` | Student is working on the attempt | Yes |
| `submitted` | Student has submitted the attempt | No |
| `auto_submitted` | Attempt auto-submitted by timeout | No |

### Revision-Specific Columns on `student_attempts`

| Column | Type | Purpose |
|--------|------|---------|
| `revision_requested` | boolean | Set to `true` by `request_revision` RPC |
| `revision_notes` | text | Optional notes from teacher about the revision request |

### Lifecycle Across One Revision Cycle

```
Attempt 1: in_progress → submitted → [feedback_published=true] → [revision_requested=true]
    │
    │  Student starts new attempt (start_attempt RPC)
    │  → revision_requested cleared on Attempt 1
    │
Attempt 2: in_progress → submitted → [feedback_published=true] → [revision_requested=true]
    │
    │  Student starts new attempt
    │  → revision_requested cleared on Attempt 2
    │
Attempt 3: in_progress → submitted → ...
```

Each attempt is a separate row in `student_attempts`. The old attempt is NEVER deleted or modified beyond clearing the `revision_requested` flag. The old attempt's feedback, transcript, annotations, and snapshots all remain intact for historical viewing.

---

## Step-by-Step Detail

### Step 1 — Submission 1

The student submits their first attempt. See `01_Submission_Workflow.md` for the full submission flow.

**State after Step 1:**
- `student_attempts` row: `status = 'submitted'`, `feedback_published = false`, `revision_requested = false`

### Step 2 — Teacher Publishes Feedback

The teacher grades the submission and clicks "Publish Feedback". See `02_Grading_Workflow.md` for the full grading flow.

**RPC:** `publish_feedback(attempt_id)`

**State after Step 2:**
- `student_attempts`: `feedback_published = true`
- `published_annotation_snapshots` — snapshot of annotations + comments
- `published_text_format_snapshots` — snapshot of formatting
- `published_score_snapshots` — snapshot of criterion scores + overall band
- `notifications` row for student: type = `feedback_published`

### Step 3 — Teacher Requests Revision

After publishing (or without publishing), the teacher clicks "Request Revision" in the AnnotationWorkspace.

**RPC:** `request_revision(attempt_id)`

**What happens:**
1. Sets `student_attempts.revision_requested = true`
2. Sets `student_attempts.revision_notes` (if provided)
3. Updates `grading.grading_status = 'revision_requested'`
4. Creates `notifications` row for student: type = `revision_requested`, link = `/student-assignments`
5. Shows an amber toast in the teacher's workspace: "Revision Requested — Student Notified"

**State after Step 3:**
- `student_attempts`: `revision_requested = true`
- `grading`: `grading_status = 'revision_requested'`
- `notifications`: `revision_requested` notification for student

**Architecture reference:** `15_Scoring_Architecture.md` → Revision Requests

### Step 4 — Student Receives Notification

**Component:** `src/components/shared/NotificationsPanel.tsx`

The student sees a "Revision Requested" notification in their dashboard NotificationsPanel. The notification links to `/student-assignments`.

When the student clicks the notification:
1. The link `/student-assignments` is converted to route `student-assignments`
2. The student is navigated to the Student Assignments page
3. The assignment item now shows as `available` (because `revision_requested = true` on the existing attempt allows a new attempt)

### Step 5 — Assignment Unlocked / Student Starts New Attempt

**Page:** `src/pages/student/StudentAssignmentDetailPage.tsx` → `StudentWorkspace.tsx`

The student opens the assignment item and clicks "Start".

**RPC:** `start_attempt(p_published_item_id)`

**What happens inside the RPC:**
1. Finds the existing attempt (Attempt 1) with `status = 'submitted'` and `revision_requested = true`
2. Clears `revision_requested = false` on Attempt 1 (so the cycle can repeat cleanly if needed)
3. Creates a NEW attempt (Attempt 2) with `status = 'in_progress'`
4. Returns the question content for the new attempt

**Critical behaviour:** Attempt 1 is preserved completely. Its feedback, transcript, annotations, and snapshots remain intact. The teacher can still view Attempt 1's published feedback via the Submission History.

**State after Step 5:**
- Attempt 1: `revision_requested = false` (cleared), `feedback_published = true` (unchanged), all snapshots intact
- Attempt 2: `status = 'in_progress'`, `feedback_published = false`, `revision_requested = false`

### Step 6 — Submission 2

The student completes and submits the new attempt. See `01_Submission_Workflow.md` for the submission flow.

**RPC:** `submit_attempt(attempt_id, payload)`

**What happens:**
1. Attempt 2: `status = 'submitted'`
2. `notify_teacher_of_submission` is called internally (server-side, same transaction)
3. Since the student already had a previous attempt for this item, the notification type is `resubmission` (not `new_submission`)
4. Teacher receives `resubmission` notification with link `/teacher-grading`

**State after Step 6:**
- Attempt 2: `status = 'submitted'`, `feedback_published = false`
- `notifications` row for teacher: type = `resubmission`

### Step 7 — Teacher Receives Resubmission Notification

The teacher sees a "Resubmission" notification in their dashboard. They click it and navigate to the grading page.

### Step 8 — Teacher Views Submission History

**Page:** `src/pages/teacher/TeacherGradingPage.tsx`

When the teacher opens the student for this item, they see:

1. **Current Submission Card** — Submission 2 (newest), with "Resubmitted" badge, showing Published/Draft status
2. **Grading Workspace** — AnnotationWorkspace operating on Submission 2 (editable)
3. **Submission History** — read-only list below the workspace:
   - Submission 1 with submitted date, overall band (if scored), Published/Draft status, and "Open Snapshot" button

**Key rules:**
- The Current Submission (newest) is ALWAYS editable in the workspace
- Historical submissions are NEVER editable
- The Current Submission never appears in the history list
- History is chronological, newest first
- Clicking "Open Snapshot" on a historical submission opens the `SnapshotViewerModal` — a read-only modal showing the student response, teacher feedback, teacher notes, criterion scores, and overall band

**Architecture reference:** `08_Grading_Architecture.md` → Teacher Grading Workflow

### Step 9 — Repeat Cycle

The teacher grades Submission 2 and either:
- **Publishes feedback** → student sees updated feedback
- **Requests another revision** → cycle repeats from Step 3

Each revision cycle creates a new attempt row. There is no hard limit on the number of revision cycles.

---

## Which Submission Is Editable?

| Submission | Teacher Editable? | Student Editable? |
|-----------|-------------------|-------------------|
| Current (newest) attempt | Yes — via AnnotationWorkspace | Yes — if `status = 'in_progress'` |
| Historical attempts | No — read-only via SnapshotViewerModal | No — read-only via SubmissionReview |

The teacher can only grade the current (newest) submission. Historical submissions are viewable but not editable. This is enforced by the UI — the AnnotationWorkspace always operates on the newest attempt.

---

## Snapshot Behaviour Across Revisions

Each attempt has its own independent set of snapshots:

```
Attempt 1:
  ├── published_annotation_snapshots (if feedback_published)
  ├── published_text_format_snapshots (if feedback_published)
  └── published_score_snapshots (if feedback_published)

Attempt 2:
  ├── published_annotation_snapshots (if feedback_published)
  ├── published_text_format_snapshots (if feedback_published)
  └── published_score_snapshots (if feedback_published)
```

**Key behaviours:**
- Publishing Attempt 2 does NOT affect Attempt 1's snapshots
- Re-publishing the SAME attempt deletes and replaces that attempt's snapshots only
- The student sees feedback for each attempt independently via `fetchStudentFeedback(attemptId)`
- The teacher sees historical snapshots via `SnapshotViewerModal` which reads from the same snapshot tables

**Architecture reference:** `15_Scoring_Architecture.md` → Published Feedback Integrity

---

## Visibility Summary

| Data | Attempt 1 (historical) | Attempt 2 (current) |
|------|----------------------|---------------------|
| Student response | Read-only (snapshot viewer / submission review) | Read-only after submit |
| Teacher feedback | Read-only (snapshot) | Editable in workspace |
| Annotations | Read-only (snapshot) | Editable in workspace |
| Criterion scores | Read-only (snapshot) | Editable in workspace |
| Overall band | Read-only (snapshot) | Auto-calculated in workspace |
| Text formatting | Read-only (snapshot) | Editable in workspace |

---

## Notification Flow Across the Cycle

| Event | Notification Type | Recipient | Link |
|-------|-------------------|-----------|------|
| Student submits Attempt 1 | `new_submission` | Teacher | `/teacher-grading` |
| Teacher publishes feedback (Attempt 1) | `feedback_published` | Student | `/student-assignments` |
| Teacher requests revision | `revision_requested` | Student | `/student-assignments` |
| Student submits Attempt 2 | `resubmission` | Teacher | `/teacher-grading` |
| Teacher publishes feedback (Attempt 2) | `feedback_published` or `feedback_updated` | Student | `/student-assignments` |
| Teacher requests revision again | `revision_requested` | Student | `/student-assignments` |
| Student submits Attempt 3 | `resubmission` | Teacher | `/teacher-grading` |

**Note:** `feedback_published` is emitted on the first publish of an attempt. `feedback_updated` is emitted on re-publish of the same attempt (when `feedback_published` was already `true`).

---

## Tables Involved

| Table | Role in revision workflow |
|-------|--------------------------|
| `student_attempts` | Multiple attempt rows per student+item; `revision_requested` flag drives the cycle |
| `grading` | Grading record per attempt; `grading_status` tracks revision state |
| `published_annotation_snapshots` | Per-attempt annotation snapshots (independent) |
| `published_text_format_snapshots` | Per-attempt formatting snapshots (independent) |
| `published_score_snapshots` | Per-attempt score snapshots (independent) |
| `notifications` | Revision-requested and resubmission notifications |

## RPCs Involved

| RPC | Purpose |
|-----|---------|
| `publish_feedback` | Publish feedback for an attempt (creates snapshots, notifies student) |
| `request_revision` | Mark attempt as needing revision, notify student |
| `start_attempt` | Create new attempt when `revision_requested = true` on existing attempt |
| `submit_attempt` | Submit new attempt, notify teacher with `resubmission` type |
| `notify_teacher_of_submission` | Called internally by `submit_attempt` — emits `resubmission` for subsequent attempts |

## Pages & Components

| Page / Component | Role |
|------------------|------|
| `TeacherGradingPage` | Shows Current Submission + Submission History |
| `AnnotationWorkspace` | Grades the current (newest) submission |
| `SnapshotViewerModal` | Read-only view of historical submission snapshots |
| `NotificationsPanel` | Shows revision-requested (student) and resubmission (teacher) notifications |
| `StudentAssignmentDetailPage` | Shows item as available when revision requested |
| `StudentWorkspace` | Student completes the new attempt |

---

## Related Architecture Documents

- `06_Assignment_Architecture.md` — attempt creation and `start_attempt` RPC behaviour
- `08_Grading_Architecture.md` — Current Submission vs Submission History
- `15_Scoring_Architecture.md` — revision requests, notification types, snapshot lifecycle
- `07_Annotation_Architecture.md` — snapshot creation on publish
