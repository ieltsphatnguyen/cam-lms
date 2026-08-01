# Migration Report — Foundation Integrity & Security Fixes

## Overview

This milestone applied 4 database migrations and 1 frontend change to address
findings from the architecture audit. No application features were redesigned.
No authentication, Question Bank, Assignment Template, or Assignment Draft
workflows were modified beyond the specific fixes listed below.

---

## Migrations Applied

### Migration 015: questions_owner_id_fk_not_null

**Schema changes:**
- Added foreign key constraint `questions_owner_id_fkey` linking
  `questions.owner_id → profiles(id)` with `ON DELETE RESTRICT`.
- Altered `questions.owner_id` from nullable to `NOT NULL`.

**Data safety:**
- Verified 0 rows with NULL `owner_id` before migration.
- Verified 0 rows with orphaned `owner_id` (no matching profile) before migration.
- No data was modified or lost.

**Impact on existing functionality:**
- Question creation: unchanged — the column already had `DEFAULT auth.uid()`,
  so inserts continue to work.
- Question ownership: unchanged — the RLS policies already require
  `owner_id = auth.uid()`.
- The new FK prevents deleting a profile that still owns questions
  (`ON DELETE RESTRICT`), which matches the existing RLS behavior (no DELETE
  policy on `profiles`).

---

### Migration 016: secure_resolve_template_to_draft

**Schema changes:**
- Dropped the existing `resolve_template_to_draft(bigint, bigint, text, text, uuid)` function.
- Recreated it as `resolve_template_to_draft(bigint, bigint, text, text)` — the
  `p_owner_id` parameter was removed.
- The function now determines the owner using `auth.uid()` internally.
- Added an explicit check: raises an exception if `auth.uid()` is NULL
  (rejects unauthenticated calls).

**Frontend changes:**
- `src/lib/templates.ts`: `resolveTemplateToDraft()` no longer accepts or sends
  the `ownerId` parameter.
- `src/pages/teacher/TeacherAssignmentsPage.tsx`: the call site no longer passes
  `currentUserId` to `resolveTemplateToDraft()`.

**Impact on existing functionality:**
- Draft creation: unchanged — the same draft is created with the same questions
  resolved from the same template. The only difference is that the owner is now
  determined server-side from the authenticated session rather than trusted
  from the frontend.
- The return shape (`{ draft_id, unresolved_rules }`) is unchanged.

---

### Migration 017: unique_constraints_enrollment

**Schema changes:**
- Added unique constraint `classstudents_student_id_class_id_key` on
  `classstudents (student_id, class_id)`.
- Added unique constraint `teacherclasses_teacher_id_class_id_key` on
  `teacherclasses (teacher_id, class_id)`.

**Data safety:**
- Verified 0 duplicate rows in `classstudents` before migration.
- Verified 0 duplicate rows in `teacherclasses` before migration.
- No data was modified or lost.

**Impact on existing functionality:**
- Class creation and teacher-class linking: unchanged — the application does not
  create duplicate links, so the constraints do not affect existing flows.
- Student enrollment: unchanged — the application does not create duplicate
  enrollments.
- If a duplicate insert is attempted (e.g., due to a race condition or a bug),
  the database will now reject it with a unique constraint violation.

---

### Migration 018: restrict_audit_log_to_admins

**Schema changes:**
- Dropped the existing `select_audit_log` RLS policy on `role_audit_log`.
- Created a new `select_audit_log` policy that requires
  `get_my_role() = 'admin' AND can_current_user_access()`.

**Impact on existing functionality:**
- Admin audit log viewing: unchanged — administrators continue to see the
  audit log exactly as before.
- Non-admin users (teachers, students) can no longer read the audit log via
  the API. Previously, the policy only checked ban status, allowing any
  authenticated user to read the full audit log.

---

## Cascade Delete Verification (Fix #4)

No migration was needed. All foreign keys on the assignment tables already
have explicitly defined `ON DELETE` behavior that is consistent and correct:

| Table | Column | References | ON DELETE | Assessment |
|---|---|---|---|---|
| assignment_template_questions | template_id | assignment_templates.id | CASCADE | Correct — deleting a template removes its questions |
| assignment_template_questions | question_id | questions.id | CASCADE | Correct — deleting a question removes it from templates |
| assignment_template_random_rules | template_id | assignment_templates.id | CASCADE | Correct — deleting a template removes its rules |
| assignment_draft_questions | draft_id | assignment_drafts.id | CASCADE | Correct — deleting a draft removes its questions |
| assignment_draft_questions | question_id | questions.id | CASCADE | Correct — deleting a question removes it from drafts |
| assignment_drafts | template_id | assignment_templates.id | NO ACTION | Correct — deleting a template does not cascade-delete drafts |
| assignment_drafts | class_id | classes.id | NO ACTION | Correct — deleting a class does not cascade-delete drafts |
| assignment_drafts | owner_id | profiles.id | NO ACTION | Correct — deleting a profile does not cascade-delete drafts |
| assignment_templates | owner_id | profiles.id | NO ACTION | Correct — deleting a profile does not cascade-delete templates |

No changes were made to cascade behavior.

---

## Confirmation

- No application features were redesigned.
- No authentication changes were made.
- No Question Bank behavior was modified.
- No Assignment Template or Assignment Draft workflows were changed (only the
  `resolve_template_to_draft` RPC was secured against frontend-supplied owner
  IDs — the workflow itself is identical).
- No legacy tables were removed.
- No legacy columns were removed.
- No performance optimizations were applied.
- The project builds successfully (`npm run build` passes with no errors).
