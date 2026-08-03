# 09 — Student Dashboard Architecture

**Last Updated:** v0.8.4 (2026-08-03)

## Purpose

Students view their enrolled classes, see assigned work, complete assignments (Writing or Speaking), and review graded feedback.

## Pages

| Page | File | Purpose |
|------|------|---------|
| Student Dashboard | `src/pages/student/StudentDashboard.tsx` | Overview with stats and quick links |
| Student Classes | `src/pages/student/StudentClassesPage.tsx` | List of enrolled classes |
| Student Assignments | `src/pages/student/StudentAssignmentsPage.tsx` | Assignments from enrolled classes |
| Assignment Detail | `src/pages/student/StudentAssignmentDetailPage.tsx` | Items within an assignment with status |
| Student Workspace | `src/pages/student/StudentWorkspace.tsx` | Routes to Writing or Speaking workspace |
| Writing Workspace | `src/pages/student/WritingWorkspace.tsx` | Writing response editor with timer |
| Speaking Workspace | `src/pages/student/SpeakingWorkspace.tsx` | Audio recording interface |
| Pre-Flight Check | `src/pages/student/PreFlightCheck.tsx` | Pre-submission confirmation |
| Submission Review | `src/pages/student/SubmissionReview.tsx` | Student views graded feedback |
| Join Class Modal | `src/pages/student/JoinClassModal.tsx` | Join class via class code |

## Components

### StudentWorkspace (`src/pages/student/StudentWorkspace.tsx`)

Entry point for answering a question. Routes to the appropriate workspace based on `response_type`:
- `text` → `WritingWorkspace`
- `audio` → `SpeakingWorkspace`

Receives `item: StudentAssignmentItem` and `assignmentName` as props from the router.

### WritingWorkspace (`src/pages/student/WritingWorkspace.tsx`)

Writing response interface:
- Textarea for written response
- Word count display
- Optional timer (if `timed` is true on the item)
- Image display (if item has `image_url`)
- Submit button

### SpeakingWorkspace (`src/pages/student/SpeakingWorkspace.tsx`)

Audio recording interface:
- MediaRecorder API for audio capture
- Preparation timer (if `prep_time_seconds` is set)
- Recording timer (if `recording_time_seconds` is set)
- Audio playback review before submit
- Uploads recording to `question-images` bucket at `student-audio/{uid}/` path

### SubmissionReview (`src/pages/student/SubmissionReview.tsx`)

Student-facing feedback review:
- Displays teacher's annotated text/transcript
- Shows teacher feedback (rendered HTML from RichTextEditor)
- Shows teacher transcript (for speaking)
- Uses CommentModal in read-only mode (v0.8.4) — students click highlights to view teacher comments
- Uses `getAudioUrl()` from grading lib for student audio playback (v0.8.4) — no duplicated signed URL logic
- Displays "Teacher Comment(s)" for annotation comments

### JoinClassModal (`src/pages/student/JoinClassModal.tsx`)

Modal for joining a class:
- Student enters a class code
- Creates a `classstudents` record

## Library Modules

### `src/lib/attempts.ts`

All student attempt operations (see `06_Assignment_Architecture.md` for full function list).

### `src/lib/annotations.ts` (student-facing functions)

| Function | Purpose |
|----------|---------|
| `fetchStudentFeedback(attemptId)` | Retrieve published feedback |
| `fetchAssignmentStatus(publishedAssignmentId, studentProfileId)` | Per-item status |
| `computeAssignmentStatus(items)` | Overall assignment status |

### `src/lib/templates.ts` (student-facing functions)

| Function | Purpose |
|----------|---------|
| `fetchStudentAssignments(studentId, profileId)` | Assignments for enrolled classes |

## Database Tables

| Table | Purpose |
|-------|---------|
| `classstudents` | Enrollment records |
| `published_assignments` | Assigned work |
| `published_assignment_items` | Individual items |
| `student_attempts` | Student responses |

## RPCs

| RPC | Purpose |
|-----|---------|
| `start_attempt` | Start/resume attempt |
| `submit_attempt` | Submit response |
| `get_student_feedback` | Retrieve published feedback |
| `get_assignment_status` | Per-item status |

## Storage

| Bucket | Path Pattern | Purpose |
|--------|--------------|---------|
| `question-images` | `student-audio/{uid}/{filename}` | Student audio recordings |

## Data Flow

### Assignment Completion Flow

```
1. Student sees assignment list (fetchStudentAssignments)
   → classstudents → published_assignments (via class_id)

2. Student opens assignment detail (fetchStudentAssignmentItems)
   → published_assignment_items + student_attempts
   → Each item shows status: locked / available / completed / overdue

3. Student clicks available item → StudentWorkspace
   → Routes to WritingWorkspace or SpeakingWorkspace based on response_type

4. Student starts attempt (start_attempt RPC)
   → Creates student_attempts record (status='in_progress')
   → Returns question content (the ONLY way content is revealed)

5a. Writing: Student types response → word count tracked
5b. Speaking: Student records audio → uploads to question-images/student-audio/{uid}/

6. Student submits (submit_attempt RPC)
   → Updates student_attempts (status='submitted')
   → For speaking: audio_path stored in attempt

7. Student waits for grading
   → Item status changes to 'completed' after submission
```

### Feedback Review Flow

```
1. Student sees assignment status as 'graded'
2. Student opens SubmissionReview
3. fetchStudentFeedback(attemptId) RPC called
   → Only returns data if feedback_published = true
4. Displays:
   - Annotated text/transcript with highlights
   - Teacher feedback (HTML)
   - Teacher transcript (for speaking)
   - "Teacher Comment(s)" for each annotation
```

## Assignment Status Computation

`computeAssignmentStatus(items)` returns:

| Status | Condition |
|--------|-----------|
| `not_started` | No attempts, no submissions |
| `in_progress` | Any attempt running or any submitted |
| `waiting_for_grading` | All items submitted, none graded |
| `graded` | All items graded |

## Known Limitations

1. `SubmissionReview` has its own copy of the segment rendering logic — it does not reuse `AnnotatableText`. This is a known duplication.
2. Speaking workspace uses the browser's MediaRecorder API — browser compatibility varies.
3. Audio uploads are limited to webm format.
4. No draft saving for writing responses — if the student navigates away, in-progress work is lost.
5. The student workspace renders fullscreen (no sidebar) for focus.
