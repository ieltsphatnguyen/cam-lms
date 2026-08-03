# 04 — Notification Workflow

**Last Updated:** v0.9.9 (2026-08-03)

## Purpose

Documents every notification type in the system — from the triggering event through the RPC that creates it, the database row, the dashboard rendering, the navigation target, and the expected UI on the destination page. This is a workflow document — it describes *how notifications behave end-to-end*.

---

## Notification System Overview

All notifications follow the same lifecycle:

```
Event occurs (submit / publish / request revision)
    │
    ▼
RPC creates notification row (server-side, same transaction)
    │
    ▼
notifications table row (recipient_id, type, link, read=false)
    │
    ▼
Dashboard NotificationsPanel fetches via get_notifications RPC
    │
    ▼
Unread badge count shown on dashboard
    │
    ▼
User clicks notification
    │
    ▼
Link converted to route: link.replace(/^\//, '').replace(/\//g, '-')
    │
    ▼
User navigated to destination page
    │
    ▼
Notification marked as read (mark_notification_read RPC)
```

---

## Notification Types

### Teacher Notifications

#### 1. New Submission

| Field | Value |
|-------|-------|
| **Type** | `new_submission` |
| **Recipient** | Teacher (class owner) |
| **Trigger** | Student submits their first attempt for an item |
| **Creating RPC** | `submit_attempt` (calls `notify_teacher_of_submission` internally) |
| **DB link** | `/teacher-grading` |
| **Route** | `teacher-grading` |
| **Destination Page** | Teacher Grading Page |
| **Expected UI** | Grading hierarchy — teacher navigates to the specific class → assignment → item → student to find the new submission |

**Full chain:**
```
Student clicks Submit
    │
    ▼
submit_attempt RPC
    │
    ▼
notify_teacher_of_submission RPC (internal, same transaction)
    │
    ▼
notifications row:
  recipient_id = teacher's profile id
  type = 'new_submission'
  link = '/teacher-grading'
  read = false
    │
    ▼
Teacher dashboard: NotificationsPanel shows "New Submission"
    │
    ▼
Teacher clicks → navigates to teacher-grading route
    │
    ▼
Teacher Grading Page loads → teacher navigates hierarchy to find the submission
```

#### 2. Resubmission

| Field | Value |
|-------|-------|
| **Type** | `resubmission` |
| **Recipient** | Teacher (class owner) |
| **Trigger** | Student submits a subsequent attempt after a revision was requested |
| **Creating RPC** | `submit_attempt` (calls `notify_teacher_of_submission` internally) |
| **DB link** | `/teacher-grading` |
| **Route** | `teacher-grading` |
| **Destination Page** | Teacher Grading Page |
| **Expected UI** | Grading hierarchy — teacher sees the student's newest submission as the Current Submission, with "Resubmitted" badge |

**Full chain:**
```
Student submits after revision request
    │
    ▼
submit_attempt RPC
    │
    ▼
notify_teacher_of_submission RPC (internal)
  → detects existing previous attempt
  → emits 'resubmission' type (not 'new_submission')
    │
    ▼
notifications row:
  recipient_id = teacher's profile id
  type = 'resubmission'
  link = '/teacher-grading'
  read = false
    │
    ▼
Teacher dashboard: NotificationsPanel shows "Resubmission"
    │
    ▼
Teacher clicks → navigates to teacher-grading route
    │
    ▼
Teacher Grading Page loads → Current Submission shows Submission 2 with "Resubmitted" badge
```

**Distinction from `new_submission`:** The `notify_teacher_of_submission` RPC checks whether the student already has a prior attempt for the same item. If yes, the type is `resubmission`. If no, the type is `new_submission`.

---

### Student Notifications

#### 3. Feedback Published

| Field | Value |
|-------|-------|
| **Type** | `feedback_published` |
| **Recipient** | Student |
| **Trigger** | Teacher publishes feedback for the first time on an attempt |
| **Creating RPC** | `publish_feedback` |
| **DB link** | `/student-assignments` |
| **Route** | `student-assignments` |
| **Destination Page** | Student Assignments Page |
| **Expected UI** | Assignment list — the relevant assignment shows status update (e.g., `graded` or `waiting_for_grading` depending on item count). Student opens the assignment → opens the item → sees SubmissionReview with teacher feedback. |

**Full chain:**
```
Teacher clicks "Publish Feedback" (first publish)
    │
    ▼
publish_feedback RPC
    │
    ▼
Checks: feedback_published was false → emits 'feedback_published'
    │
    ▼
notifications row:
  recipient_id = student's profile id
  type = 'feedback_published'
  link = '/student-assignments'
  read = false
    │
    ▼
Student dashboard: NotificationsPanel shows "Feedback Published"
    │
    ▼
Student clicks → navigates to student-assignments route
    │
    ▼
Student Assignments Page loads → student finds the assignment → opens item → SubmissionReview
```

#### 4. Feedback Updated

| Field | Value |
|-------|-------|
| **Type** | `feedback_updated` |
| **Recipient** | Student |
| **Trigger** | Teacher re-publishes feedback on an attempt that was already published |
| **Creating RPC** | `publish_feedback` |
| **DB link** | `/student-assignments` |
| **Route** | `student-assignments` |
| **Destination Page** | Student Assignments Page |
| **Expected UI** | Same as `feedback_published` — student opens the assignment item and sees the updated feedback in SubmissionReview |

**Full chain:**
```
Teacher edits after publishing → clicks "Publish Feedback" again
    │
    ▼
publish_feedback RPC
    │
    ▼
Checks: feedback_published was already true → emits 'feedback_updated'
    │
    ▼
notifications row:
  recipient_id = student's profile id
  type = 'feedback_updated'
  link = '/student-assignments'
  read = false
    │
    ▼
Student dashboard: NotificationsPanel shows "Feedback Updated"
    │
    ▼
Student clicks → navigates to student-assignments route
    │
    ▼
Student sees the UPDATED published version (old snapshots replaced with new)
```

**Distinction from `feedback_published`:** The `publish_feedback` RPC checks the current value of `feedback_published` before updating. If it was `false`, the type is `feedback_published` (first publish). If it was already `true`, the type is `feedback_updated` (re-publish).

#### 5. Revision Requested

| Field | Value |
|-------|-------|
| **Type** | `revision_requested` |
| **Recipient** | Student |
| **Trigger** | Teacher clicks "Request Revision" in the AnnotationWorkspace |
| **Creating RPC** | `request_revision` |
| **DB link** | `/student-assignments` |
| **Route** | `student-assignments` |
| **Destination Page** | Student Assignments Page |
| **Expected UI** | Assignment list — the relevant assignment item now shows as `available` (unlocked for a new attempt). Student opens the item → clicks "Start" → new attempt created. |

**Full chain:**
```
Teacher clicks "Request Revision"
    │
    ▼
request_revision RPC
    │
    ▼
Sets revision_requested = true on student_attempts
Updates grading_status = 'revision_requested'
    │
    ▼
notifications row:
  recipient_id = student's profile id
  type = 'revision_requested'
  link = '/student-assignments'
  read = false
    │
    ▼
Student dashboard: NotificationsPanel shows "Revision Requested"
    │
    ▼
Student clicks → navigates to student-assignments route
    │
    ▼
Student sees the assignment item is now available → opens item → starts new attempt
```

---

## Notification Table Schema

| Column | Type | Purpose |
|--------|------|---------|
| `id` | bigint | Primary key |
| `recipient_id` | uuid | The user who receives the notification (references `auth.users.id`) |
| `type` | text | Notification type (see above) |
| `link` | text | URL path for navigation (e.g., `/teacher-grading`, `/student-assignments`) |
| `read` | boolean | Whether the notification has been read |
| `created_at` | timestamptz | When the notification was created |
| `metadata` | jsonb | Optional context data (e.g., attempt ID, student name, assignment name) |

**RLS:** Users can only see notifications where `recipient_id = auth.uid()`.

---

## Link-to-Route Conversion

The `NotificationsPanel` component converts database `link` values to route identifiers:

```javascript
const route = link.replace(/^\//, '').replace(/\//g, '-');
```

| DB `link` | Route | Page |
|-----------|-------|------|
| `/teacher-grading` | `teacher-grading` | Teacher Grading Page |
| `/student-assignments` | `student-assignments` | Student Assignments Page |

This conversion is necessary because the routing system uses hyphenated route identifiers (e.g., `teacher-grading`) while the database stores URL-style paths (e.g., `/teacher-grading`).

---

## Notification Reliability

All notifications are created server-side within the same database transaction as the triggering event:

| Event | RPC | Notification created inside RPC? |
|-------|-----|--------------------------------|
| Student submits | `submit_attempt` | Yes — `notify_teacher_of_submission` called internally |
| Teacher publishes | `publish_feedback` | Yes — notification row created in same function |
| Teacher requests revision | `request_revision` | Yes — notification row created in same function |

**No client-side fire-and-forget:** Previously, `notify_teacher_of_submission` was called as a fire-and-forget client-side call after `submit_attempt` returned. If the client died between submit and notify, the teacher never received a notification. This was fixed in v0.9.1 — the notification is now created inside the `submit_attempt` RPC transaction.

**No duplicate notifications:** Each transition produces exactly one notification:
- Submit → 1 notification (inside `submit_attempt` RPC)
- Publish feedback → 1 notification (inside `publish_feedback` RPC)
- Request revision → 1 notification (inside `request_revision` RPC)

**Architecture reference:** `15_Scoring_Architecture.md` → Notification Reliability

---

## NotificationsPanel Component

**File:** `src/components/shared/NotificationsPanel.tsx`

**Features:**
- Fetches notifications via `get_notifications` RPC
- Shows unread badge count
- Lists notifications chronologically (newest first)
- Click on a notification:
  1. Converts link to route
  2. Calls `onNavigate(route)` to navigate
  3. Marks the notification as read via `mark_notification_read` RPC
- "Mark all read" button calls `mark_all_notifications_read` RPC
- Used by both Teacher Dashboard and Student Dashboard

---

## RPCs Involved

| RPC | Purpose |
|-----|---------|
| `get_notifications` | Fetch notifications for the current user |
| `mark_notification_read` | Mark a single notification as read |
| `mark_all_notifications_read` | Mark all notifications as read |
| `notify_teacher_of_submission` | Create teacher notification (called inside `submit_attempt`) |

---

## Summary Table

| Type | Recipient | Trigger | RPC | Link | Destination |
|------|-----------|---------|-----|------|-------------|
| `new_submission` | Teacher | Student's first submission | `submit_attempt` | `/teacher-grading` | Teacher Grading Page |
| `resubmission` | Teacher | Student resubmits after revision | `submit_attempt` | `/teacher-grading` | Teacher Grading Page |
| `feedback_published` | Student | Teacher's first publish | `publish_feedback` | `/student-assignments` | Student Assignments Page |
| `feedback_updated` | Student | Teacher re-publishes | `publish_feedback` | `/student-assignments` | Student Assignments Page |
| `revision_requested` | Student | Teacher requests revision | `request_revision` | `/student-assignments` | Student Assignments Page |

---

## Related Architecture Documents

- `15_Scoring_Architecture.md` — notification types, reliability, link navigation
- `09_StudentDashboard_Architecture.md` — student-side NotificationsPanel
- `10_TeacherDashboard_Architecture.md` — teacher-side NotificationsPanel
- `12_UI_Workflows.md` — notification-related UI workflows
