# 08 — Grading Architecture

**Last Updated:** v0.9.1 (2026-08-03)

## Purpose

Teachers view submitted student attempts, grade them using the annotation engine, and publish feedback. The grading subsystem provides a hierarchy view (Classes → Assignments → Items → Students) and embeds the AnnotationWorkspace for individual attempt grading.

## Pages

- `src/pages/teacher/TeacherGradingPage.tsx` — grading hierarchy + annotation workspace + submission history

## Components

- `src/components/annotations/AnnotationWorkspace.tsx` — embedded for individual attempt grading (Current Submission)
- `src/components/annotations/SnapshotViewerModal.tsx` — read-only modal for inspecting historical submission snapshots (v0.9.1)

## Library Module

`src/lib/grading.ts` — all grading hierarchy and attempt listing operations.

### Types

```typescript
interface GradingItemInfo {
  id: number;
  type_id: number;
  type_name: string;
  response_type: ResponseType;
  selection_order: number;
  due_date: string | null;
  // ... other published item fields
}

interface GradingAttemptInfo extends StudentAttempt {
  student_name: string;
  student_email: string;
}

interface ItemProgress {
  item: GradingItemInfo;
  totalStudents: number;
  submittedCount: number;
  gradedCount: number;
  lateCount: number;
}

interface AssignmentProgress {
  assignment: GradingAssignmentInfo;
  items: ItemProgress[];
  totalSubmissions: number;
  totalGraded: number;
}

interface ClassProgress {
  classInfo: GradingClassInfo;
  assignments: AssignmentProgress[];
  totalSubmissions: number;
  totalGraded: number;
}
```

### API Functions

| Function | Purpose |
|----------|---------|
| `fetchGradingHierarchy()` | Fetch full hierarchy: classes → assignments → items with progress |
| `fetchItemStudents(itemId, classId)` | Fetch all enrolled students with their attempt status for an item |
| `fetchAttemptForGrading(attemptId)` | Fetch a single attempt with student name/email for grading |
| `fetchSubmissionHistory(studentProfileId, itemId)` | Fetch all attempts for a student+item, newest first (v0.9.1) |
| `getAudioUrl(audioPath)` | Create signed URL for student audio recording (3600s expiry) |

### Progress Color Utility

```typescript
type ProgressColor = 'green' | 'yellow' | 'red' | 'grey';
```

Used to color-code grading progress badges based on submission/grading ratios.

## Database Tables

| Table | Purpose |
|-------|---------|
| `grading` | Grading records (submission_id, grading_status, grader_id, overall_band_score) |
| `student_attempts` | The submissions being graded (includes revision_requested, revision_notes) |
| `published_assignments` | Assignment context |
| `published_assignment_items` | Item context |
| `classstudents` | Enrollment (for student list) |

## RPCs

| RPC | Purpose |
|-----|---------|
| `get_student_name` | Resolve student ID to name |
| `get_profile_to_student_mapping` | Map profile UUIDs to student IDs + names |
| `get_profile_display_names` | Resolve profile UUIDs to display names |
| `publish_feedback` | Mark feedback as published (snapshots scores + annotations, emits feedback_published or feedback_updated notification) |
| `unpublish_feedback` | Unpublish feedback |
| `request_revision` | Mark revision requested, notify student |
| `submit_attempt` | Student submits attempt (now calls notify_teacher_of_submission internally) |

## Storage

| Bucket | Purpose |
|--------|---------|
| `question-images` | Student audio recordings (read via signed URL) |
| `annotation-audio` | Teacher audio comments |

## Data Flow

### Grading Hierarchy Flow

```
fetchGradingHierarchy()
  1. Fetch published_assignments via RLS (teacher sees assignments in their classes)
  2. Fetch published_assignment_items for those assignments
  3. Fetch student_attempts for those items
  4. Fetch grading records to determine which attempts are graded
  5. Fetch enrolled student counts per class
  6. Build hierarchy: ClassProgress[] → AssignmentProgress[] → ItemProgress[]
```

### Student List Flow

```
fetchItemStudents(itemId, classId)
  1. Fetch classstudents (enrolled students) for the class
  2. Fetch student_attempts for the item
  3. Resolve profile UUIDs → student IDs + names via get_profile_to_student_mapping RPC
  4. Fetch grading records for attempt status
  5. Build GradingAttemptInfo[] with student_name, attempt status, graded status
```

### Audio Playback Flow

```
1. Teacher opens attempt with audio_path
2. AnnotationWorkspace useEffect calls getAudioUrl(audioPath)
3. getAudioUrl calls supabase.storage.from('question-images').createSignedUrl(path, 3600)
4. Returns signed URL valid for 1 hour
5. <audio> element plays the recording
6. If URL fetch fails, error is logged and "Audio unavailable" is shown
7. While fetching, "Loading recording..." spinner is shown
```

## Teacher Grading Workflow (v0.9.1)

### Current Submission vs Submission History

When a teacher opens a student from the grading hierarchy, they see:
1. **Current Submission Card** — the newest submission, with submission number, status, and Published/Draft badge
2. **Grading Workspace** — AnnotationWorkspace operating on the Current Submission only
3. **Submission History** — read-only list of older submissions below the workspace

The Current Submission never appears in the history list. History is chronological, newest first.

### Snapshot Inspection

Clicking "Open Snapshot" on a historical submission opens SnapshotViewerModal, which displays:
- Student response (text or audio + transcript)
- Teacher feedback
- Teacher notes (criterion-grouped annotations)
- Criterion score cards + overall band

Nothing is editable in the snapshot viewer.

## Grading Status

### Bottom Toolbar (v0.8.4)

Merged into a single row: Previous Student | Save Draft + Publish Feedback | Next Student. The duplicated student name was removed from the toolbar (it remains in the breadcrumb above).

The `grading` table tracks:
- `submission_id` — references student_attempts.id
- `grading_status` — 'completed' or 'graded' when done
- `grader_id` — the teacher who graded

An attempt is considered "graded" if a grading record exists with status 'completed' or 'graded'.

## Known Limitations

1. `fetchGradingHierarchy` makes N+1 queries for student counts per class — not optimized for large class counts.
2. `fetchItemStudents` uses `get_profile_to_student_mapping` because RLS blocks teachers from reading other users' profiles directly.
3. Audio signed URLs expire after 1 hour — if the teacher leaves the page open longer, playback may fail.
4. The grading hierarchy does not support real-time updates — teachers must refresh to see new submissions.
5. `owner_display_name` in published assignments is resolved via `get_profile_display_names` RPC because profiles RLS blocks cross-user reads.
6. Submission History only shows published snapshots — unpublished historical submissions show limited data (no annotations, scores, or feedback).
