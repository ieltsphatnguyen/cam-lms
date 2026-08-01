# Permissions

This document details the permission model for every table in scope, covering
both Teacher and Administrator roles, and identifies the enforcement mechanism
for each permission.

**Enforcement mechanism codes:**

| Code | Meaning |
|---|---|
| RLS | Row Level Security policy on the table |
| RPC | PostgreSQL SECURITY DEFINER function |
| EF | Edge Function (Deno, service-role) |
| FE | Frontend (client-side only — not security-enforcing) |
| N/A | Not applicable (table not used by this role) |

---

## profiles

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | Own profile only (`auth.uid() = id`) | All profiles | Own profile only | RLS (`select_own_profile`) |
| **Create** | Cannot create | Cannot create directly | Own profile (role=student only, via `register_student` RPC or `register-student` EF) | RLS (`insert_student_profile`) + RPC/EF |
| **Update** | Own profile (display_name, avatar_url only, via `update_own_profile` RPC) | Own profile (same restriction) | Own profile (same restriction) | RLS (`update_own_profile`) + RPC |
| **Delete** | Not permitted | Not permitted | Not permitted | RLS (no DELETE policy) |

**Notes:**
- `update_own_profile` RPC only updates `display_name` and `avatar_url`. The RLS UPDATE policy allows any column update by the owner, but the application only calls the RPC, which restricts the columns.
- Admins cannot update other users' profiles directly — they must use the `change_user_role` RPC for role changes and the `admin-user-management` edge function for disabling/restoring.
- Profile creation is restricted to student self-registration via the RLS INSERT policy (`role = 'student'`). Teacher and admin profiles are created by edge functions using the service-role key, which bypasses RLS.

---

## teachers

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | Own record (if `profiles.teacher_id` matches) or any teacher record (if role is teacher) | All | Not permitted | RLS (`select_teachers`) |
| **Create** | Not permitted | Via `change_user_role` RPC or `create-teacher` EF | Not permitted | RPC / EF |
| **Update** | Own record (if `profiles.teacher_id` matches) | Any teacher record | Not permitted | RLS (`update_own_teacher`) |
| **Delete** | Not permitted | Not permitted | Not permitted | RLS (no DELETE policy) |

**Notes:**
- The `select_teachers` policy allows any teacher to read all teacher records (not just their own). This is because the policy checks `get_my_role() = ANY(ARRAY['admin', 'teacher'])`.
- Teacher records are created internally by `change_user_role` (when promoting a user to teacher) and `create-teacher` EF. There is no direct INSERT RLS policy.

---

## students

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All students (if role is teacher) | All | Own record (if `profiles.student_id` matches) | RLS (`select_students`) |
| **Create** | Not permitted | Not permitted directly | Via `register_student` RPC or `register-student` EF | RPC / EF |
| **Update** | Not permitted | Any student record | Own record | RLS (`update_own_student`) |
| **Delete** | Not permitted | Not permitted | Not permitted | RLS (no DELETE policy) |

**Notes:**
- Student records are created internally by `register_student` RPC (called by the `register-student` edge function). There is no direct INSERT RLS policy.

---

## role_audit_log

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | Not permitted | All records (if not banned) | Not permitted | RLS (`select_audit_log`) |
| **Create** | Not permitted | Not permitted directly (written by `change_user_role` RPC) | Not permitted | RPC (SECURITY DEFINER) |
| **Update** | Not permitted | Not permitted | Not permitted | RLS (no UPDATE policy) |
| **Delete** | Not permitted | Not permitted | Not permitted | RLS (no DELETE policy) |

**Notes:**
- The `select_audit_log` policy uses `can_current_user_access()` which only checks ban status, not role. However, the grant is only to `authenticated`, and the policy's `USING` clause is `can_current_user_access()` — meaning any non-banned authenticated user can read the audit log. This is a potential issue (see Findings.md).

---

## classes

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All non-banned users | All non-banned users | All non-banned users | RLS (`select_classes`) |
| **Create** | Yes (if not banned) | Yes | Not permitted | RLS (`insert_classes`) |
| **Update** | Own classes (where teacher is linked via `teacherclasses`) | Any class | Not permitted | RLS (`update_classes`) |
| **Archive** | Own classes (via UPDATE setting `archived_at`) | Any class (via UPDATE) | Not permitted | RLS (`update_classes`) + FE |
| **Delete** | Not permitted | Not permitted | Not permitted | RLS (no DELETE policy) |

**Notes:**
- `select_classes` uses `can_current_user_access()` which allows any non-banned user to read all classes. Students can see all classes, not just their enrolled ones. Enrollment filtering is done in the frontend.
- The UPDATE policy checks whether the teacher is linked to the class via `teacherclasses` and `profiles.teacher_id`, or if the user is an admin.
- Archiving is done by setting `archived_at` to a timestamp (or NULL to restore). The frontend calls UPDATE with just the `archived_at` column.

---

## teacherclasses

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | Own links (where `teacher_id` matches `profiles.teacher_id`) | All | Not permitted | RLS (`select_teacherclasses`) |
| **Create** | Own links (teacher_id must match own `profiles.teacher_id`) | Any | Not permitted | RLS (`insert_teacherclasses`) |
| **Update** | Not permitted (no UPDATE policy) | Not permitted | Not permitted | RLS (no UPDATE policy) |
| **Delete** | Own links | Any | Not permitted | RLS (`delete_teacherclasses`) |

**Notes:**
- The INSERT policy requires `get_my_role() = 'admin'` OR (`get_my_role() = 'teacher'` AND `teacher_id` matches the caller's `profiles.teacher_id`). This prevents teachers from creating links for other teachers.

---

## classstudents

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All enrollments (if role is teacher or admin) | All | Own enrollments (where `student_id` matches `profiles.student_id`) | RLS (`select_classstudents`) |
| **Create** | Own enrollment (student_id must match own `profiles.student_id`) or teacher/admin | Any | Own enrollment | RLS (`insert_classstudents`) |
| **Update** | Not permitted (no UPDATE policy) | Not permitted | Not permitted | RLS (no UPDATE policy) |
| **Delete** | Own enrollment or teacher/admin | Any | Own enrollment | RLS (`delete_classstudents`) |

**Notes:**
- Students can self-enroll (the INSERT policy allows `student_id` matching own profile).
- Teachers and admins can enroll/unenroll any student.
- The StudentClassesPage uses this table for viewing and leaving classes.

---

## studentclasses (legacy)

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All | All | All | **None — RLS is not enabled** |
| **Create** | All | All | All | **None — RLS is not enabled** |
| **Update** | All | All | All | **None — RLS is not enabled** |
| **Delete** | All | All | All | **None — RLS is not enabled** |

**Warning:** This table has no RLS and grants full CRUD to both `anon` and `authenticated` roles. It is not used by the application but poses a security risk (see Findings.md).

---

## questiontypes

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All (if not banned) | All | All (if not banned) | RLS (`select_questiontypes`) |
| **Create** | Not permitted | Not permitted | Not permitted | RLS (no INSERT policy) |
| **Update** | Not permitted | Not permitted | Not permitted | RLS (no UPDATE policy) |
| **Delete** | Not permitted | Not permitted | Not permitted | RLS (no DELETE policy) |

**Notes:**
- This is a read-only lookup table. No application code writes to it.

---

## questions

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All active+archived questions (if not banned) | All | All (if not banned) | RLS (`select_questions`) |
| **Create** | Own questions (`owner_id = auth.uid()`) | Own questions | Not permitted | RLS (`insert_questions`) |
| **Update** | Own questions (`owner_id = auth.uid()`) | Any question | Not permitted | RLS (`update_questions`) |
| **Archive** | Own questions (via UPDATE setting `status='archived', archived_at`) | Any question (via UPDATE) | Not permitted | RLS (`update_questions`) + FE |
| **Delete** | Own questions | Any question | Not permitted | RLS (`delete_questions`) |

**Notes:**
- The SELECT policy uses `can_current_user_access()` which allows any non-banned user to read all questions. Students can read all questions, not just those in their assignments.
- The INSERT policy requires `get_my_role() = ANY(['teacher', 'admin'])` AND `owner_id = auth.uid()`. This prevents students from creating questions and prevents teachers from creating questions with a different owner.
- The UPDATE and DELETE policies allow `owner_id = auth.uid()` OR `get_my_role() = 'admin'`.

---

## assignment_templates

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All templates (if not banned) | All | All (if not banned) | RLS (`select_assignment_templates`) |
| **Create** | Own templates (`owner_id = auth.uid()`) | Own templates | Not permitted | RLS (`insert_assignment_templates`) |
| **Update** | Own templates (`owner_id = auth.uid()`) | Any template | Not permitted | RLS (`update_assignment_templates`) |
| **Archive** | Own templates (via UPDATE setting `status='archived', archived_at`) | Any template (via UPDATE) | Not permitted | RLS (`update_assignment_templates`) + FE |
| **Delete** | Not permitted | Any template | Not permitted | RLS (`delete_assignment_templates`) |

**Notes:**
- DELETE is admin-only. Teachers can archive but not delete templates.
- The INSERT policy requires `get_my_role() = ANY(['teacher', 'admin'])` AND `owner_id = auth.uid()`.

---

## assignment_template_questions

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All (if not banned) | All | All (if not banned) | RLS (`select_atq`) |
| **Create** | If parent template is owned by caller | If parent template is owned by caller or caller is admin | Not permitted | RLS (`insert_atq`) |
| **Update** | If parent template is owned by caller | If parent template is owned by caller or caller is admin | Not permitted | RLS (`update_atq`) |
| **Delete** | If parent template is owned by caller | If parent template is owned by caller or caller is admin | Not permitted | RLS (`delete_atq`) |

**Notes:**
- All policies check ownership via a subquery: `EXISTS (SELECT 1 FROM assignment_templates t WHERE t.id = assignment_template_questions.template_id AND (t.owner_id = auth.uid() OR get_my_role() = 'admin') AND can_current_user_access())`.
- This is an indirect ownership check — the child table inherits the parent's ownership.

---

## assignment_template_random_rules

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All (if not banned) | All | All (if not banned) | RLS (`select_atrr`) |
| **Create** | If parent template is owned by caller | If parent template is owned by caller or caller is admin | Not permitted | RLS (`insert_atrr`) |
| **Update** | If parent template is owned by caller | If parent template is owned by caller or caller is admin | Not permitted | RLS (`update_atrr`) |
| **Delete** | If parent template is owned by caller | If parent template is owned by caller or caller is admin | Not permitted | RLS (`delete_atrr`) |

**Notes:**
- Same indirect ownership pattern as `assignment_template_questions`.

---

## assignment_drafts

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All drafts (if not banned) | All | All (if not banned) | RLS (`select_assignment_drafts`) |
| **Create** | Own drafts (`owner_id = auth.uid()`) — teacher/admin only | Own drafts | Not permitted | RLS (`insert_assignment_drafts`) + RPC (`resolve_template_to_draft`) |
| **Update** | Own drafts (`owner_id = auth.uid()`) | Any draft | Not permitted | RLS (`update_assignment_drafts`) |
| **Archive** | Not applicable (no archive column) | Not applicable | Not applicable | N/A |
| **Delete** | Own drafts | Any draft | Not permitted | RLS (`delete_assignment_drafts`) |

**Notes:**
- Drafts are created exclusively via the `resolve_template_to_draft` RPC (SECURITY DEFINER). The RPC inserts with the `p_owner_id` parameter. The RLS INSERT policy also exists but the RPC bypasses RLS.
- The INSERT RLS policy requires `get_my_role() = ANY(['teacher', 'admin'])` AND `owner_id = auth.uid()`.

---

## assignment_draft_questions

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All (if not banned) | All | All (if not banned) | RLS (`select_adq`) |
| **Create** | If parent draft is owned by caller | If parent draft is owned by caller or caller is admin | Not permitted | RLS (`insert_adq`) + RPC |
| **Update** | If parent draft is owned by caller | If parent draft is owned by caller or caller is admin | Not permitted | RLS (`update_adq`) |
| **Delete** | If parent draft is owned by caller | If parent draft is owned by caller or caller is admin | Not permitted | RLS (`delete_adq`) |

**Notes:**
- Same indirect ownership pattern — checks parent `assignment_drafts.owner_id`.
- In practice, draft questions are created by the `resolve_template_to_draft` RPC, which bypasses RLS (SECURITY DEFINER).

---

## Courses Module Tables (courses, coursesessions, classcourseapplications, generatedschedules)

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All | All | All | **None — RLS is not enabled** |
| **Create** | All | All | All | **None — RLS is not enabled** |
| **Update** | All | All | All | **None — RLS is not enabled** |
| **Delete** | All | All | All | **None — RLS is not enabled** |

**Warning:** These tables have no RLS. They are not used by the application (Courses page shows "Coming Soon"). They pose a security risk if the anon key is known (see Findings.md).

---

## Legacy Tables (assignmenttemplates, assignmenttemplateitems, assignmentdrafts, assignmentdraftitems, randomrules)

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All | All | All | **None — RLS is not enabled** |
| **Create** | All | All | All | **None — RLS is not enabled** |
| **Update** | All | All | All | **None — RLS is not enabled** |
| **Delete** | All | All | All | **None — RLS is not enabled** |

**Warning:** All legacy tables have no RLS. They are not used by the application but are accessible via the Supabase API with the anon key (see Findings.md).

---

## Unimplemented Module Tables (publishedassignments, studentassignmentitems, studentsubmissions, grading, criterionscores, generalfeedback, inlineannotations, rubrics, rubriccriteria, questionsnapshots)

| Permission | Teacher | Admin | Student | Enforcement |
|---|---|---|---|---|
| **Read** | All | All | All | **None — RLS is not enabled** |
| **Create** | All | All | All | **None — RLS is not enabled** |
| **Update** | All | All | All | **None — RLS is not enabled** |
| **Delete** | All | All | All | **None — RLS is not enabled** |

**Warning:** All unimplemented module tables have no RLS. They are accessible via the Supabase API with the anon key.

---

## Permission Summary Matrix

### Teacher Permissions

| Table | Read | Create | Update | Archive | Delete |
|---|---|---|---|---|---|
| profiles | Own only | No | Own (display_name, avatar_url) | N/A | No |
| teachers | All teachers | No (via RPC/EF) | Own | N/A | No |
| students | All students | No (via RPC/EF) | No | N/A | No |
| role_audit_log | No | No | No | N/A | No |
| classes | All | Yes | Own classes | Own classes | No |
| teacherclasses | Own | Own | No | N/A | Own |
| classstudents | All | Own/any | No | N/A | Own/any |
| questiontypes | All | No | No | N/A | No |
| questions | All | Own | Own | Own | Own |
| assignment_templates | All | Own | Own | Own | No |
| assignment_template_questions | All | If parent owned | If parent owned | N/A | If parent owned |
| assignment_template_random_rules | All | If parent owned | If parent owned | N/A | If parent owned |
| assignment_drafts | All | Own (via RPC) | Own | N/A | Own |
| assignment_draft_questions | All | If parent owned (via RPC) | If parent owned | N/A | If parent owned |

### Administrator Permissions

| Table | Read | Create | Update | Archive | Delete |
|---|---|---|---|---|---|
| profiles | All | No (via EF) | Own (display_name, avatar_url) | N/A | No |
| teachers | All | Via RPC/EF | Any | N/A | No |
| students | All | Via RPC/EF | Any | N/A | No |
| role_audit_log | All | No (via RPC) | No | N/A | No |
| classes | All | Yes | Any | Any | No |
| teacherclasses | All | Any | No | N/A | Any |
| classstudents | All | Any | No | N/A | Any |
| questiontypes | All | No | No | N/A | No |
| questions | All | Own | Any | Any | Any |
| assignment_templates | All | Own | Any | Any | Any |
| assignment_template_questions | All | If parent owned/admin | If parent owned/admin | N/A | If parent owned/admin |
| assignment_template_random_rules | All | If parent owned/admin | If parent owned/admin | N/A | If parent owned/admin |
| assignment_drafts | All | Own (via RPC) | Any | N/A | Any |
| assignment_draft_questions | All | If parent owned/admin (via RPC) | If parent owned/admin | N/A | If parent owned/admin |
