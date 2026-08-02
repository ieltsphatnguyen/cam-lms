# Findings

This document reports objective findings from the architecture audit. No
fixes have been applied — this is documentation only.

---

## 1. Unused Tables

### 1.1 Legacy Tables (No RLS, No Application Usage)

The following tables were created in the initial schema migration
(`000_create_base_schema.sql`) and were superseded by newer tables in later
migrations. They are **not referenced by any application code** and have
**no RLS policies**.

| Legacy Table | Superseded By |
|---|---|
| `assignmenttemplates` | `assignment_templates` |
| `assignmenttemplateitems` | `assignment_template_questions` |
| `assignmentdrafts` (legacy, has `original_set_id`) | `assignment_drafts` (has `template_id`, `class_id`, `owner_id`, `status`) |
| `assignmentdraftitems` | `assignment_draft_questions` |
| `randomrules` | `assignment_template_random_rules` |

**Risk:** These tables are accessible via the Supabase REST API with the anon
key. Anyone with the anon key can read, create, update, or delete rows in
these tables without any access control. While they contain no application
data currently, they could be used to store arbitrary data or could be a
confusion vector.

### 1.2 Duplicate Junction Table: studentclasses

The `studentclasses` table has the exact same purpose as `classstudents`
(student-to-class enrollment) with the same columns (`student_id`, `class_id`).
The application exclusively uses `classstudents` (which has RLS). The
`studentclasses` table has **no RLS** and is never referenced.

**Risk:** Same as legacy tables — accessible without access control via the
API.

### 1.3 Courses Module Tables (Not Yet Implemented)

The following tables exist but belong to the unimplemented Courses module:
`courses`, `coursesessions`, `classcourseapplications`, `generatedschedules`.
None have RLS. The Courses page displays "Coming Soon".

### 1.4 Unimplemented Module Tables

The following tables exist for future modules (Publishing, Student Workspace,
Grading) but are not yet used: `publishedassignments`, `studentassignmentitems`,
`studentsubmissions`, `grading`, `criterionscores`, `generalfeedback`,
`inlineannotations`, `rubrics`, `rubriccriteria`, `questionsnapshots`. None
have RLS.

---

## 2. Unused Columns

### 2.1 questions.category_id (Legacy)

- **Status:** Legacy / Candidate for removal
- **Always NULL.** The application uses the free-text `category` column instead.
- A FK constraint to `questioncategories` still exists, and an index
  (`idx_questions_category_id`) is maintained on this column.
- The `questioncategories` table itself is also unused.

### 2.2 questions.created_by (Legacy)

- **Status:** Legacy / Candidate for removal
- **Always NULL.** The application uses `owner_id` (UUID referencing
  `profiles.id`) instead.
- A FK constraint to `teachers` still exists, and an index
  (`idx_questions_created_by`) is maintained on this column.
- The `owner_id` column has a default of `auth.uid()` but is **nullable** and
  has **no FK constraint** to `profiles.id` — this is inconsistent with
  `assignment_templates.owner_id` and `assignment_drafts.owner_id`, which both
  have FK constraints.

### 2.3 questionsnapshots.image (Duplicate)

- **Status:** Candidate for removal
- Appears to be a duplicate of `questionsnapshots.image_url`. The table is
  unused, but this column has no clear separate purpose.

### 2.4 profiles.created_at

- **Status:** Optional
- Nullable with a default of `now()`. Not displayed in the UI. Not critical,
  but harmless.

### 2.5 Various created_at columns on junction tables

- `assignment_template_questions.created_at`, `assignment_draft_questions.created_at`,
  `assignment_template_random_rules.created_at` — all have `created_at` columns
  that are never read by the application. They are harmless (auto-populated) but
  add minor storage overhead.

---

## 3. Duplicated Responsibilities

### 3.1 classstudents vs. studentclasses

Two tables serve the same purpose (student-class enrollment). The application
uses `classstudents` (with RLS). `studentclasses` is unused and unprotected.

### 3.2 questions.category_id vs. questions.category

Two categorization systems coexist:
- `category_id` (FK to `questioncategories`) — the original design, unused
- `category` (free-text) — the current design, used by the application

The `questioncategories` table and its FK are dead weight.

### 3.3 questions.created_by vs. questions.owner_id

Two ownership systems coexist:
- `created_by` (FK to `teachers`) — the original design, unused
- `owner_id` (UUID, defaults to `auth.uid()`) — the current design

The `created_by` column, its FK, and its index are dead weight.

### 3.4 Legacy vs. Current Assignment Tables

Five legacy tables (`assignmenttemplates`, `assignmenttemplateitems`,
`assignmentdrafts`, `assignmentdraftitems`, `randomrules`) duplicate the
responsibilities of the current tables (`assignment_templates`,
`assignment_template_questions`, `assignment_drafts`,
`assignment_draft_questions`, `assignment_template_random_rules`).

---

## 4. Suspicious NULL Columns

### 4.1 questions.owner_id

- **Nullable:** Yes (in schema)
- **Actually NULL:** No — the DEFAULT `auth.uid()` and the RLS INSERT policy
  (`owner_id = auth.uid()`) ensure it is always populated.
- **Issue:** The column should be `NOT NULL` for consistency with
  `assignment_templates.owner_id` and `assignment_drafts.owner_id`, which are
  both `NOT NULL`. The nullable designation is a schema oversight.

### 4.2 questions.category_id

- **Always NULL.** This is a legacy column superseded by `category`. It is
  intentionally unused — the application was redesigned to use free-text
  categories instead of the `questioncategories` lookup table.

### 4.3 questions.created_by

- **Always NULL.** This is a legacy column superseded by `owner_id`. It is
  intentionally unused — the application was redesigned to use UUID-based
  ownership via `profiles.id` instead of the `teachers` bigint ID.

### 4.4 classstudents.student_id and classstudents.class_id

- **Nullable:** Yes (in schema)
- **Actually NULL:** No — the application always provides values.
- **Issue:** These should be `NOT NULL` for data integrity. A NULL
  enrollment record would be meaningless.

### 4.5 courses.created_by

- **Nullable:** Yes. The module is not implemented, so the column has never
  been populated. It is reserved for future use.

---

## 5. Missing Foreign Keys

### 5.1 questions.owner_id has no FK to profiles(id)

The `questions.owner_id` column (UUID, defaults to `auth.uid()`) does not have
a foreign key constraint to `profiles(id)`. This is inconsistent with:
- `assignment_templates.owner_id` → `profiles(id)` (FK exists)
- `assignment_drafts.owner_id` → `profiles(id)` (FK exists, added in migration 014)

The missing FK means:
- Referential integrity is not enforced — a question could have an `owner_id`
  pointing to a non-existent profile.
- PostgREST cannot resolve the `profiles!questions_owner_id_fkey` relationship
  for nested joins. The application code in `search_similar_questions` RPC
  joins `profiles` on `p.id = q.owner_id` manually, so this works, but the
  application cannot use the PostgREST nested join syntax for this relationship.

### 5.2 assignment_template_random_rules.question_type_id has no named FK

The column `assignment_template_random_rules.question_type_id` is described as
referencing `questiontypes.id` but the FK was not found in the constraints
query. The application assumes this relationship exists. If the FK is missing,
referential integrity is not enforced.

**Update:** On re-examination of the FK list, there is no FK from
`assignment_template_random_rules.question_type_id` to `questiontypes.id`. This
is a missing FK — a random rule could reference a non-existent question type.

---

## 6. Unnecessary Relationships

### 6.1 questions.category_id → questioncategories.id

This FK relationship exists but is never used. The `questioncategories` table
is unused, and `questions.category_id` is always NULL. The FK and the
`idx_questions_category_id` index add overhead for no benefit.

### 6.2 questions.created_by → teachers.id

This FK relationship exists but is never used. The `questions.created_by`
column is always NULL. The FK and the `idx_questions_created_by` index add
overhead for no benefit.

---

## 7. Possible Performance Problems

### 7.1 resolve_random_rule uses ORDER BY random()

The `resolve_random_rule` function uses `ORDER BY random() LIMIT 1` to select
a random matching question. This requires scanning all matching rows, computing
a random value for each, sorting, and picking the top one. On a large question
table (thousands of questions), this can be slow, especially with the
class-scoped subquery that checks `assignment_draft_questions` joined with
`assignment_drafts`.

### 7.2 can_current_user_access() and get_my_role() called per row

Every RLS policy calls `can_current_user_access()` and many also call
`get_my_role()`. These are SECURITY DEFINER functions that query `auth.users`
and `profiles` respectively. While PostgreSQL may inline STABLE functions,
`can_current_user_access()` is VOLATILE (not marked STABLE), so it may be
executed once per row. For queries returning many rows, this could be
expensive.

### 7.3 Indirect ownership checks in child tables

The RLS policies on `assignment_template_questions`,
`assignment_template_random_rules`, and `assignment_draft_questions` use
subqueries to check parent ownership:
```sql
EXISTS (SELECT 1 FROM assignment_templates t
       WHERE t.id = ... AND t.owner_id = auth.uid() ...)
```
These subqueries execute for every row. For batch operations (e.g., inserting
many template questions), this could be slow. However, the subqueries use
primary-key lookups which are fast.

### 7.4 search_similar_questions trigram search

The `search_similar_questions` function uses `q.content % p_prompt` which
leverages the GIN trigram index. This is efficient for moderate result sets
but can degrade with very large question tables. The `char_length(p_prompt) >= 10`
guard helps avoid expensive computation on short prompts.

### 7.5 No composite index on questions for random rule matching

The `resolve_random_rule` function queries `questions` with filters on
`type_id`, `response_type`, `status`, `category`, and `tags`. There are
individual indexes on each column but no composite index covering this query
pattern. For large tables, a composite index on `(type_id, response_type, status)`
could improve performance.

---

## 8. Architecture Inconsistencies

### 8.1 Inconsistent FK constraints on owner_id columns

| Table | owner_id FK to profiles(id) |
|---|---|
| `assignment_templates` | Yes |
| `assignment_drafts` | Yes (added in migration 014) |
| `questions` | **No** |

### 8.2 Inconsistent nullable constraints on owner_id

| Table | owner_id NOT NULL? |
|---|---|
| `assignment_templates` | Yes |
| `assignment_drafts` | Yes |
| `questions` | **No (nullable)** |

### 8.3 Inconsistent RLS coverage

Tables with RLS: `profiles`, `teachers`, `students`, `role_audit_log`,
`classes`, `teacherclasses`, `classstudents`, `questiontypes`, `questions`,
`assignment_templates`, `assignment_template_questions`,
`assignment_template_random_rules`, `assignment_drafts`,
`assignment_draft_questions`.

Tables without RLS: `studentclasses` (duplicate of `classstudents`),
`courses`, `coursesessions`, `classcourseapplications`, `generatedschedules`,
all 5 legacy tables, and all 10 unimplemented module tables.

**22 tables have no RLS.** While most are unused, they are still accessible
via the API.

### 8.4 Inconsistent naming conventions

- Current tables use `snake_case`: `assignment_templates`, `assignment_drafts`
- Legacy tables use `lowercase` (no underscores): `assignmenttemplates`,
  `assignmentdrafts`, `assignmentdraftitems`, `assignmenttemplateitems`
- Both naming conventions coexist in the same schema

### 8.5 Mixed identity models

The `questions` table has both `created_by` (bigint FK to `teachers.id`) and
`owner_id` (UUID, no FK). The application uses `owner_id` exclusively. The
`created_by` column and its FK are vestigial.

### 8.6 resolve_template_to_draft trusts p_owner_id from frontend

The `resolve_template_to_draft` RPC accepts `p_owner_id` as a parameter from
the frontend. It does not verify that `p_owner_id = auth.uid()`. A malicious
user could call this RPC with another user's UUID as `p_owner_id`, creating a
draft owned by someone else. The RLS INSERT policy on `assignment_drafts`
would reject this (it requires `owner_id = auth.uid()`), but since the RPC is
SECURITY DEFINER, it bypasses RLS — the INSERT succeeds with the provided
`p_owner_id`.

---

## 9. Technical Debt

### 9.1 Dead schema from initial migration

The initial migration (`000_create_base_schema.sql`) created 30+ tables for a
comprehensive school management system. The application was then redesigned
with new tables (migrations 008-014) for Question Bank, Templates, and Drafts.
The old tables were never dropped, leaving 5 legacy tables and several unused
lookup tables (`questioncategories`, `rubrics`, `rubriccriteria`,
`questionsnapshots`) in the schema.

### 9.2 No migration to clean up legacy columns

`questions.category_id` and `questions.created_by` should have been dropped
when the application switched to `category` and `owner_id`. Their FKs and
indexes remain, adding overhead.

### 9.3 No DELETE policy on profiles

The `profiles` table has no DELETE RLS policy. This means no user (including
admins) can delete a profile via the API. User deletion must be handled via
the `admin-user-management` edge function (which uses the service-role key to
call `auth.admin.deleteUser()`). This is intentional but could be confusing.

### 9.4 No UPDATE policy on teacherclasses

The `teacherclasses` table has no UPDATE RLS policy. Once a teacher-class link
is created, it cannot be modified — only deleted and re-created. This is likely
intentional (the link has no mutable columns), but it means the application
cannot update the link in place.

### 9.5 role_audit_log SELECT policy is not role-restricted

The `select_audit_log` RLS policy uses `can_current_user_access()` which only
checks ban status — it does not check the user's role. This means any
non-banned authenticated user (including students) can read the entire audit
log via the API. The application only displays the audit log on the admin
page, but the data is accessible to anyone via direct API calls.

### 9.6 No rate limiting on edge functions

Edge functions (`register-student`, `create-teacher`, `admin-user-management`)
have no rate limiting. The `register-student` function is publicly accessible
(verifyJWT=false), which could be abused for spam account creation.

### 9.7 Storage buckets have no size or MIME type limits

Both `avatars` and `question-images` buckets have no `file_size_limit` and no
`allowed_mime_types`. Users could upload arbitrarily large files or non-image
files to these buckets.

### 9.8 Orphaned storage files

When a user replaces an avatar or question image, the old file is not deleted
from storage. Over time, this accumulates orphaned files. There is no cleanup
mechanism.

### 9.9 No cascade delete behavior specified

Foreign keys on child tables (e.g., `assignment_template_questions.template_id`
→ `assignment_templates.id`) do not specify `ON DELETE CASCADE`. When a
template is deleted, the child rows are not automatically deleted — the
application must delete them first. The `assignment_drafts` →
`assignment_draft_questions` FK also lacks cascade, but the application relies
on cascade behavior when deleting drafts (it only deletes the draft and expects
the questions to be cascade-deleted). If the FK was created without CASCADE,
deleting a draft would fail due to the child rows.

**Update:** The application's `deleteDraft` function only calls
`DELETE FROM assignment_drafts WHERE id = ?`. If the FK to
`assignment_draft_questions` does not have `ON DELETE CASCADE`, this will fail
with a foreign key constraint violation. This needs verification.

---

## 10. Potential Future Problems

### 10.1 Random rule resolution with no matching questions

If a random rule's criteria are too restrictive (e.g., a specific type +
category + tags combination that no question matches), `resolve_random_rule`
returns NULL. The draft is still created, but with fewer questions than
expected. The application reports the count of unresolved rules, but the draft
is incomplete. There is no mechanism to re-resolve unresolved rules later.

### 10.2 Question deletion after draft creation

If a question referenced by a draft is deleted (hard delete), the
`assignment_draft_questions` rows will have dangling FK references. The FK
constraint will prevent deletion if `ON DELETE RESTRICT` (the default) is in
effect. The application's `deleteQuestion` function deletes the question
directly — if any draft references it, the delete will fail with a constraint
violation. The application does not check for draft references before
deleting.

### 10.3 Template modification after draft creation

Templates can be freely modified after drafts are created from them. The
draft's questions are already resolved (fixed IDs), so modifying the template
does not affect existing drafts. However, there is no audit trail linking a
draft's questions back to the template's state at creation time — if the
template is later changed or deleted, there is no way to know what the
template looked like when the draft was created.

### 10.4 No soft-delete for questions referenced by drafts

Questions can be archived (soft-delete) or hard-deleted. Archiving a question
does not affect existing drafts (they store fixed IDs). However, archived
questions will not match future random rule resolutions, which could cause
unresolved rules if the question pool shrinks. There is no warning when
archiving a question that is the only match for a random rule.

### 10.5 classstudents.student_id and class_id are nullable

If a bug or direct API call inserts a row with NULL `student_id` or
`class_id`, the enrollment record would be meaningless but would not be
rejected by the database. The RLS INSERT policy checks `student_id` against
the caller's profile, which would fail for NULL — but an admin insert bypasses
this check (the policy allows admin to insert any `student_id`).

### 10.6 No unique constraint on classstudents (student_id, class_id)

There is no unique constraint on the `(student_id, class_id)` pair in
`classstudents`. A student could be enrolled in the same class multiple times.
The application does not check for duplicates before inserting.

### 10.7 No unique constraint on teacherclasses (teacher_id, class_id)

Same issue as above — a teacher could be linked to the same class multiple
times. The application does not check for duplicates.

### 10.8 resolve_template_to_draft does not validate template ownership

The RPC does not check whether the caller owns the template or has the right
to create a draft. Any authenticated teacher can call it with any template ID.
The draft is created with `p_owner_id` from the frontend, and since the RPC is
SECURITY DEFINER, the RLS INSERT policy on `assignment_drafts` (which would
check `owner_id = auth.uid()`) is bypassed.
