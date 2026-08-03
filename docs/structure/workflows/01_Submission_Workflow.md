# 01 — Submission Workflow

**Last Updated:** v0.9.9 (2026-08-03)

## Purpose

Documents the behavioural workflow from the moment a student receives an assignment through to the teacher opening the submission for grading. This is a workflow document — it describes *how the system behaves*, not how it is built. For implementation details, reference the architecture documents linked throughout.

---

## Actors

- **Student** — completes the assignment item
- **Teacher** — receives the submission notification and opens it for grading

---

## Prerequisites

- Teacher has published an assignment to a class (see `06_Assignment_Architecture.md` → Publishing Flow)
- Student is enrolled in the class (`classstudents` record exists)
- Student is signed in with a valid, non-banned profile

---

## Flowchart

```
┌─────────────────────────────────┐
│  Student opens Assignments page  │
│  (StudentAssignmentsPage)        │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Student clicks an assignment   │
│  → StudentAssignmentDetailPage  │
│  Items shown with status badges  │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Student clicks an available    │
│  item → StudentWorkspace        │
│  (routes to Writing or Speaking) │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Student clicks "Start"          │
│  → start_attempt RPC             │
│  → student_attempts row created   │
│  → status = 'in_progress'         │
│  → question content revealed      │
└──────────────┬──────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌────────────┐  ┌─────────────┐
│ Writing    │  │ Speaking    │
│ Workspace  │  │ Workspace   │
│ (text)     │  │ (audio)     │
└──────┬─────┘  └──────┬──────┘
       │               │
       │               ▼
       │       ┌───────────────┐
       │       │ Prep timer    │
       │       │ (if configured)│
       │       └──────┬────────┘
       │              │
       │              ▼
       │       ┌───────────────┐
       │       │ Record audio  │
       │       │ (MediaRecorder)│
       │       └──────┬────────┘
       │              │
       │              ▼
       │       ┌───────────────┐
       │       │ Playback review│
       │       └──────┬────────┘
       │              │
       ▼              ▼
┌─────────────────────────────────┐
│  Student clicks "Submit"         │
│  → PreFlightCheck confirmation   │
│  → submit_attempt RPC            │
│  → status = 'submitted'           │
│  → notify_teacher_of_submission  │
│    (server-side, same transaction)│
│  → notification row created        │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Teacher sees notification        │
│  (NotificationsPanel on dashboard)│
│  → "New Submission" badge          │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Teacher clicks notification      │
│  → navigates to TeacherGradingPage│
│  → opens the specific attempt     │
│  → AnnotationWorkspace loads      │
└─────────────────────────────────┘
```

---

## Step-by-Step Detail

### Step 1 — Student Sees Assignment List

**Page:** `src/pages/student/StudentAssignmentsPage.tsx`

The student navigates to their Assignments page. The page calls `fetchStudentAssignments(studentId, profileId)` which queries `classstudents` → `published_assignments` (via `class_id`). Only assignments from classes the student is enrolled in are visible.

Each assignment card shows the assignment name, class name, and an overall status computed by `computeAssignmentStatus(items)`:

| Status | Condition |
|--------|-----------|
| `not_started` | No attempts, no submissions |
| `in_progress` | Any attempt running or any submitted |
| `waiting_for_grading` | All items submitted, none graded |
| `graded` | All items graded |

**Architecture reference:** `09_StudentDashboard_Architecture.md` → Assignment Completion Flow

### Step 2 — Student Opens Assignment Detail

**Page:** `src/pages/student/StudentAssignmentDetailPage.tsx`

The student clicks an assignment. The detail page calls `fetchStudentAssignmentItems(publishedAssignmentId)` which fetches `published_assignment_items` and joins with `student_attempts` for the current student.

Each item displays a status badge computed by `computeItemStatus(item, attempt, now)`:

| Status | Condition |
|--------|-----------|
| `completed` | Attempt exists with status `submitted` or `auto_submitted` |
| `available` | Attempt is `in_progress`, OR no attempt and item is available |
| `locked` | No attempt and `available_from` is in the future |
| `overdue` | No attempt and `due_date` has passed |

The student clicks an available item to open the workspace.

**Architecture reference:** `06_Assignment_Architecture.md` → Item Status Logic

### Step 3 — Student Starts Attempt

**Page:** `src/pages/student/StudentWorkspace.tsx` → routes to `WritingWorkspace` or `SpeakingWorkspace`

**RPC:** `start_attempt(p_published_item_id)`

The student clicks "Start". The `start_attempt` RPC:

1. Verifies the student is authenticated and enrolled in the class
2. Checks the item is available (`available_from` has passed)
3. Checks for an existing attempt:
   - If `in_progress` attempt exists → resumes it (returns the same attempt ID)
   - If a submitted attempt exists with `revision_requested = true` → creates a NEW attempt (see Workflow 03 — Revision)
   - If a submitted attempt exists without revision → returns the existing attempt as `already_submitted`
   - If no attempt exists → creates a new one
4. Creates a `student_attempts` row with `status = 'in_progress'`
5. Returns the full question content (content, type, image URL, scheduling metadata, timing settings)

**Critical behaviour:** The question content is ONLY revealed through this RPC. It is not visible on the assignment detail page or anywhere else before the attempt starts.

**Table:** `student_attempts`

| Column | Value at creation |
|--------|-------------------|
| `published_assignment_item_id` | The item ID |
| `student_profile_id` | `auth.uid()` |
| `status` | `'in_progress'` |
| `time_limit_seconds` | From item (if timed) |
| `response_type` | From item (`'text'` or `'audio'`) |
| `started_at` | `now()` (DB default) |

**Architecture reference:** `06_Assignment_Architecture.md` → Student Attempt Flow

### Step 4a — Writing Response

**Page:** `src/pages/student/WritingWorkspace.tsx`

The student types their response in a textarea. A live word count is tracked using `countWords(text)`. If the item is timed (`timed = true`), a countdown timer runs using `time_limit_seconds`.

The student can review their work before submitting. No draft saving occurs — if the student navigates away, in-progress text is lost (known limitation, see `09_StudentDashboard_Architecture.md`).

### Step 4b — Speaking Response

**Page:** `src/pages/student/SpeakingWorkspace.tsx`

The speaking workflow has additional phases:

1. **Preparation** (if `prep_time_seconds` is set): A countdown timer runs. The student prepares their answer.
2. **Recording**: The student records audio via the browser's `MediaRecorder` API. If `recording_time_seconds` is set, a recording countdown timer runs.
3. **Playback Review**: The student can listen to their recording before deciding to submit or re-record.

The recording is uploaded to the `question-images` storage bucket at path `student-audio/{uid}/{filename}`.

**Storage reference:** `question-images` bucket, `student-audio/{uid}/` path pattern

### Step 5 — Submission

**Page:** `src/pages/student/PreFlightCheck.tsx` → confirmation modal

**RPC:** `submit_attempt(p_attempt_id, p_payload)`

The student clicks "Submit". A pre-flight confirmation checklist appears. After confirming:

1. The `submit_attempt` RPC is called with the attempt ID and payload (text content or audio path)
2. The RPC updates `student_attempts`:
   - `status` → `'submitted'` (or `'auto_submitted'` if triggered by timeout)
   - `submitted_at` → `now()`
   - `response_text` (writing) or `audio_path` (speaking) stored
3. The RPC internally calls `notify_teacher_of_submission` (server-side, same transaction):
   - Creates a `notifications` row for the teacher
   - Notification type: `'new_submission'` (first submission) or `'resubmission'` (after revision)
   - Link: `/teacher-grading`

**Critical behaviour:** The notification is created inside the same database transaction as the submission. There is no client-side fire-and-forget call. If the submission succeeds, the notification is guaranteed to exist.

**Tables touched:**
- `student_attempts` — status update
- `notifications` — new row for teacher

**Architecture reference:** `15_Scoring_Architecture.md` → Notification Reliability

### Step 6 — Teacher Receives Notification

**Component:** `src/components/shared/NotificationsPanel.tsx`

The teacher's dashboard includes a NotificationsPanel. On the next refresh (or real-time update if available), the teacher sees:

- A "New Submission" notification with the student name and assignment context
- An unread badge count

The teacher clicks the notification.

**Architecture reference:** `15_Scoring_Architecture.md` → Notification Types

### Step 7 — Teacher Opens Submission

**Page:** `src/pages/teacher/TeacherGradingPage.tsx`

The notification click navigates to the grading page (`/teacher-grading` route). The teacher navigates the grading hierarchy:

1. **Classes** — teacher sees their classes
2. **Assignments** — teacher selects an assignment
3. **Items** — teacher sees items with submission counts
4. **Students** — teacher sees the student list with submission status
5. **Attempt** — teacher clicks the student's attempt → AnnotationWorkspace opens

The AnnotationWorkspace loads all grading data for the attempt: annotations, text formats, rubric criteria, criterion scores, feedback, and transcript (if speaking).

**Architecture reference:** `08_Grading_Architecture.md` → Grading Hierarchy Flow

---

## Status Transitions Summary

```
No attempt
    │
    ▼ start_attempt RPC
in_progress
    │
    ▼ submit_attempt RPC
submitted (or auto_submitted)
    │
    ▼ teacher publishes feedback
feedback_published = true
    │
    ▼ teacher requests revision
revision_requested = true
    │
    ▼ student starts new attempt (start_attempt)
new attempt: in_progress
    │
    ▼ submit_attempt RPC
new attempt: submitted
    └── (cycle repeats)
```

---

## Tables Involved

| Table | Role in this workflow |
|-------|----------------------|
| `classstudents` | Enrollment check — student must be in the class |
| `published_assignments` | Assignment context (class, name, owner) |
| `published_assignment_items` | Item content, scheduling, timing |
| `student_attempts` | Attempt creation, status, response data |
| `notifications` | Teacher notification on submission |

## RPCs Involved

| RPC | Purpose |
|-----|---------|
| `start_attempt` | Create/resume attempt, reveal question content |
| `submit_attempt` | Submit response, emit teacher notification |
| `notify_teacher_of_submission` | Called internally by `submit_attempt` — creates teacher notification |

## Storage

| Bucket | Path | Purpose |
|--------|------|---------|
| `question-images` | `student-audio/{uid}/{filename}` | Student audio recordings (speaking items) |

## Pages & Components

| Page / Component | Role |
|------------------|------|
| `StudentAssignmentsPage` | Assignment list with status |
| `StudentAssignmentDetailPage` | Items with status badges |
| `StudentWorkspace` | Routes to Writing or Speaking workspace |
| `WritingWorkspace` | Text response editor with word count and timer |
| `SpeakingWorkspace` | Audio recording with prep time and playback |
| `PreFlightCheck` | Pre-submission confirmation |
| `NotificationsPanel` | Teacher sees submission notification |
| `TeacherGradingPage` | Teacher opens the submission for grading |

---

## Related Architecture Documents

- `06_Assignment_Architecture.md` — template/draft/publish/attempt data flows
- `09_StudentDashboard_Architecture.md` — student page flows and status computation
- `08_Grading_Architecture.md` — grading hierarchy and attempt access
- `15_Scoring_Architecture.md` — notification creation and reliability
- `12_UI_Workflows.md` — golden path UI workflows
