# Database Schema

This document covers every table currently used by the implemented modules:
Authentication, User Management, Classes, Courses, Question Bank, Assignment
Templates, and Assignment Drafts.

Tables are grouped by owning module. Within each group, tables are listed in
dependency order (referenced tables first).

---

## Module: Authentication & User Management

### profiles

| Field | Value |
|---|---|
| **Purpose** | Central identity record for every authenticated user. Links to `auth.users` (Supabase Auth) by sharing the same UUID `id`. Stores role, display name, avatar, and optional links to `teachers` / `students` records. |
| **Primary key** | `id` (uuid) |
| **Foreign keys** | `teacher_id` → `teachers(id)`, `student_id` → `students(id)` |
| **Relationships** | One-to-one with `auth.users`. One-to-many with `questions` (as `owner_id`), `assignment_templates` (as `owner_id`), `assignment_drafts` (as `owner_id`). |
| **Indexes** | `profiles_pkey` (unique, `id`) |
| **RLS enabled** | Yes |
| **Owning module** | Authentication & User Management (shared by all modules) |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | uuid | NOT NULL | — | UUID matching `auth.users.id`. Set by edge functions or RPC during registration. |
| 2 | `role` | text | NOT NULL | — | One of `admin`, `teacher`, `student`. Enforced by CHECK constraint. |
| 3 | `teacher_id` | bigint | NULL | — | FK to `teachers.id`. Populated when role is or was `teacher`. |
| 4 | `student_id` | bigint | NULL | — | FK to `students.id`. Populated when role is or was `student`. |
| 5 | `created_at` | timestamptz | NULL | `now()` | Timestamp of profile creation. |
| 6 | `display_name` | text | NULL | — | User-chosen display name shown in UI. |
| 7 | `avatar_url` | text | NULL | — | Public URL of avatar image in the `avatars` storage bucket. |

**Check constraints:** `profiles_role_check` — `role IN ('admin', 'teacher', 'student')`

---

### teachers

| Field | Value |
|---|---|
| **Purpose** | Lightweight entity record for users with the `teacher` role. Referenced by `teacherclasses`, `courses`, and `questions`. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | None |
| **Relationships** | One-to-one with `profiles` (via `profiles.teacher_id`). One-to-many with `teacherclasses`, `courses`, `questions`. |
| **Indexes** | `teachers_pkey` (unique, `id`) |
| **RLS enabled** | Yes |
| **Owning module** | User Management |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('teachers_id_seq')` | Surrogate primary key. |
| 2 | `name` | text | NOT NULL | — | Teacher display name (denormalized from `profiles.display_name` at creation time). |

---

### students

| Field | Value |
|---|---|
| **Purpose** | Lightweight entity record for users with the `student` role. Referenced by `classstudents`, `studentclasses`, and `studentassignmentitems`. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | None |
| **Relationships** | One-to-one with `profiles` (via `profiles.student_id`). One-to-many with `classstudents`, `studentclasses`. |
| **Indexes** | `students_pkey` (unique, `id`) |
| **RLS enabled** | Yes |
| **Owning module** | User Management |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('students_id_seq')` | Surrogate primary key. |
| 2 | `name` | text | NOT NULL | — | Student display name (denormalized from `profiles.display_name` at creation time). |

---

### role_audit_log

| Field | Value |
|---|---|
| **Purpose** | Immutable audit trail of every role change performed by an administrator. Written exclusively by the `change_user_role` RPC function. |
| **Primary key** | `id` (uuid) |
| **Foreign keys** | None (stores UUIDs and emails as plain values, not FKs, to survive user deletion) |
| **Relationships** | Logical reference to `profiles` via `admin_id` and `target_id` (not enforced by FK). |
| **Indexes** | `role_audit_log_pkey` (unique, `id`) |
| **RLS enabled** | Yes (SELECT only for admins via `can_current_user_access()`) |
| **Owning module** | User Management |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | uuid | NOT NULL | `gen_random_uuid()` | Surrogate primary key. |
| 2 | `admin_id` | uuid | NOT NULL | — | UUID of the admin who performed the role change. |
| 3 | `admin_email` | text | NOT NULL | — | Email of the admin at time of change (denormalized). |
| 4 | `target_id` | uuid | NOT NULL | — | UUID of the user whose role was changed. |
| 5 | `target_email` | text | NOT NULL | — | Email of the target user (denormalized). |
| 6 | `previous_role` | text | NOT NULL | — | Role before the change. |
| 7 | `new_role` | text | NOT NULL | — | Role after the change. |
| 8 | `created_at` | timestamptz | NOT NULL | `now()` | Timestamp of the change. |

---

## Module: Classes

### classes

| Field | Value |
|---|---|
| **Purpose** | Top-level grouping entity. A class represents a cohort of students managed by one or more teachers. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | None |
| **Relationships** | One-to-many with `teacherclasses`, `classstudents`, `assignment_drafts` (via `class_id`). |
| **Indexes** | `classes_pkey` (unique, `id`) |
| **RLS enabled** | Yes |
| **Owning module** | Classes |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('classes_id_seq')` | Surrogate primary key. |
| 2 | `name` | text | NOT NULL | — | Display name of the class. |
| 3 | `class_code` | text | NULL | — | Optional short code for the class (intended for student join flow). |
| 4 | `archived_at` | timestamptz | NULL | — | Set to a timestamp when the class is archived; NULL when active. |

---

### teacherclasses

| Field | Value |
|---|---|
| **Purpose** | Junction table linking teachers to classes. A class can have multiple teachers; a teacher can have multiple classes. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `teacher_id` → `teachers(id)`, `class_id` → `classes(id)` |
| **Relationships** | Many-to-one with `teachers` and `classes`. |
| **Indexes** | `teacherclasses_pkey` (unique, `id`), `idx_teacherclasses_teacher_id`, `idx_teacherclasses_class_id` |
| **RLS enabled** | Yes |
| **Owning module** | Classes |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('teacherclasses_id_seq')` | Surrogate primary key. |
| 2 | `teacher_id` | bigint | NOT NULL | — | FK to `teachers.id`. |
| 3 | `class_id` | bigint | NOT NULL | — | FK to `classes.id`. |

---

### classstudents

| Field | Value |
|---|---|
| **Purpose** | Junction table linking students to classes (enrollment). A class can have multiple students; a student can enroll in multiple classes. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `student_id` → `students(id)`, `class_id` → `classes(id)` |
| **Relationships** | Many-to-one with `students` and `classes`. |
| **Indexes** | `classstudents_pkey` (unique, `id`), `idx_classstudents_student_id`, `idx_classstudents_class_id` |
| **RLS enabled** | Yes |
| **Owning module** | Classes |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('classstudents_id_seq')` | Surrogate primary key. |
| 2 | `student_id` | bigint | NULL | — | FK to `students.id`. |
| 3 | `class_id` | bigint | NULL | — | FK to `classes.id`. |

---

### studentclasses

| Field | Value |
|---|---|
| **Purpose** | Duplicate/alternative junction table for student-class enrollment. Appears to be a legacy or parallel structure to `classstudents`. **Not used by the application.** |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `student_id` → `students(id)`, `class_id` → `classes(id)` |
| **Relationships** | Many-to-one with `students` and `classes`. |
| **Indexes** | `studentclasses_pkey` (unique, `id`) |
| **RLS enabled** | No |
| **Owning module** | Classes (legacy) |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('studentclasses_id_seq')` | Surrogate primary key. |
| 2 | `student_id` | bigint | NOT NULL | — | FK to `students.id`. |
| 3 | `class_id` | bigint | NOT NULL | — | FK to `classes.id`. |

---

## Module: Courses

### courses

| Field | Value |
|---|---|
| **Purpose** | Course definitions. Courses are a planned feature (the Courses page shows "Coming Soon"). The table exists in the schema but is not actively used by the application. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `created_by` → `teachers(id)` |
| **Relationships** | One-to-many with `coursesessions`, `classcourseapplications`. |
| **Indexes** | `courses_pkey` (unique, `id`) |
| **RLS enabled** | No |
| **Owning module** | Courses (not yet implemented) |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('courses_id_seq')` | Surrogate primary key. |
| 2 | `name` | text | NOT NULL | — | Course name. |
| 3 | `description` | text | NULL | — | Course description. |
| 4 | `created_by` | bigint | NULL | — | FK to `teachers.id`. |

---

### coursesessions

| Field | Value |
|---|---|
| **Purpose** | Individual sessions within a course. Part of the unimplemented Courses module. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `course_id` → `courses(id)` |
| **Relationships** | Many-to-one with `courses`. One-to-many with `generatedschedules`. |
| **Indexes** | `coursesessions_pkey` (unique, `id`) |
| **RLS enabled** | No |
| **Owning module** | Courses (not yet implemented) |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('coursesessions_id_seq')` | Surrogate primary key. |
| 2 | `course_id` | bigint | NULL | — | FK to `courses.id`. |
| 3 | `title` | text | NOT NULL | — | Session title. |
| 4 | `session_number` | integer | NOT NULL | — | Ordering index for the session within its course. |
| 5 | `content` | text | NULL | — | Session content/material. |

---

### classcourseapplications

| Field | Value |
|---|---|
| **Purpose** | Links courses to classes with scheduling metadata. Part of the unimplemented Courses module. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `class_id` → `classes(id)`, `course_id` → `courses(id)` |
| **Relationships** | Many-to-one with `classes` and `courses`. |
| **Indexes** | `classcourseapplications_pkey` (unique, `id`) |
| **RLS enabled** | No |
| **Owning module** | Courses (not yet implemented) |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('classcourseapplications_id_seq')` | Surrogate primary key. |
| 2 | `class_id` | bigint | NULL | — | FK to `classes.id`. |
| 3 | `course_id` | bigint | NULL | — | FK to `courses.id`. |
| 4 | `start_date` | date | NOT NULL | — | Start date for the course application. |
| 5 | `writing_day` | text | NULL | — | Day-of-week for writing sessions. |
| 6 | `speaking_day` | text | NULL | — | Day-of-week for speaking sessions. |

---

### generatedschedules

| Field | Value |
|---|---|
| **Purpose** | Generated schedule entries for class sessions. Part of the unimplemented Courses module. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `class_id` → `classes(id)`, `session_id` → `coursesessions(id)` |
| **Relationships** | Many-to-one with `classes` and `coursesessions`. |
| **Indexes** | `generatedschedules_pkey` (unique, `id`) |
| **RLS enabled** | No |
| **Owning module** | Courses (not yet implemented) |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('generatedschedules_id_seq')` | Surrogate primary key. |
| 2 | `class_id` | bigint | NULL | — | FK to `classes.id`. |
| 3 | `session_id` | bigint | NULL | — | FK to `coursesessions.id`. |
| 4 | `scheduled_date` | date | NOT NULL | — | Date the session is scheduled for. |
| 5 | `status` | text | NULL | `'Scheduled'` | Status of the scheduled session. |

---

## Module: Question Bank

### questiontypes

| Field | Value |
|---|---|
| **Purpose** | Lookup table of question types (e.g., IELTS Writing Task 1, IELTS Speaking Part 2). Referenced by `questions`, `assignment_template_random_rules`, `questioncategories`, and `questionsnapshots`. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | None |
| **Relationships** | One-to-many with `questions`, `questioncategories`, `questionsnapshots`, `assignment_template_random_rules`. |
| **Indexes** | `questiontypes_pkey` (unique, `id`), `questiontypes_name_key` (unique, `name`) |
| **RLS enabled** | Yes (SELECT only) |
| **Owning module** | Question Bank (shared by Assignment Templates) |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('questiontypes_id_seq')` | Surrogate primary key. |
| 2 | `name` | text | NOT NULL | — | Unique name of the question type. |

---

### questioncategories

| Field | Value |
|---|---|
| **Purpose** | Categories for questions, scoped to a question type. Referenced by `questions.category_id` and `questionsnapshots`. **Not actively used by the application** — the app uses the free-text `questions.category` column instead. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `type_id` → `questiontypes(id)` |
| **Relationships** | Many-to-one with `questiontypes`. One-to-many with `questions` (via `category_id`), `questionsnapshots`. |
| **Indexes** | `questioncategories_pkey` (unique, `id`) |
| **RLS enabled** | No |
| **Owning module** | Question Bank (legacy) |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('questioncategories_id_seq')` | Surrogate primary key. |
| 2 | `name` | text | NOT NULL | — | Category name. |
| 3 | `type_id` | bigint | NOT NULL | — | FK to `questiontypes.id`. |

---

### questions

| Field | Value |
|---|---|
| **Purpose** | Core table of the Question Bank. Stores question content, metadata, and ownership. Questions are the atomic unit that templates and drafts reference. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `category_id` → `questioncategories(id)`, `type_id` → `questiontypes(id)`, `created_by` → `teachers(id)` |
| **Relationships** | Many-to-one with `questiontypes`, `questioncategories`, `teachers`. One-to-many with `assignment_template_questions`, `assignment_draft_questions`, `assignmenttemplateitems`, `assignmentdraftitems`, `studentassignmentitems`. |
| **Indexes** | `questions_pkey` (unique, `id`), `idx_questions_content_trgm` (GIN trigram on `content`), `idx_questions_owner_id`, `idx_questions_type_id`, `idx_questions_status`, `idx_questions_response_type`, `idx_questions_category` (on `category`), `idx_questions_category_id`, `idx_questions_tags` (GIN on `tags`), `idx_questions_created_by` |
| **RLS enabled** | Yes |
| **Owning module** | Question Bank (shared by Assignment Templates and Assignment Drafts) |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('questions_id_seq')` | Surrogate primary key. |
| 2 | `content` | text | NOT NULL | — | The question prompt text. |
| 3 | `category_id` | bigint | NULL | — | FK to `questioncategories.id`. **Not used by the application** — superseded by the free-text `category` column. |
| 4 | `type_id` | bigint | NOT NULL | — | FK to `questiontypes.id`. |
| 5 | `created_by` | bigint | NULL | — | FK to `teachers.id`. Legacy ownership column, superseded by `owner_id`. |
| 6 | `created_at` | timestamptz | NULL | `now()` | Timestamp of question creation. |
| 7 | `updated_at` | timestamptz | NULL | `now()` | Timestamp of last update. Maintained by trigger. |
| 8 | `description` | text | NULL | — | Optional description/instructions for the question. |
| 9 | `ielts_band` | text | NULL | — | Optional IELTS band label. |
| 10 | `tags` | text[] | NULL | `'{}'::text[]` | Array of tags for filtering and random rule matching. |
| 11 | `response_type` | text | NOT NULL | `'text'` | Either `text` or `audio`. Enforced by CHECK. |
| 12 | `image_url` | text | NULL | — | Public URL of an image attached to the question (stored in `question-images` bucket). |
| 13 | `owner_id` | uuid | NULL | `auth.uid()` | UUID of the teacher who owns this question. FK to `profiles.id` is not enforced (no constraint exists). |
| 14 | `status` | text | NOT NULL | `'active'` | Either `active` or `archived`. Enforced by CHECK. |
| 15 | `archived_at` | timestamptz | NULL | — | Set when the question is archived. |
| 16 | `custom_type_name` | text | NULL | — | Optional custom name when the question type doesn't fit standard types. |
| 17 | `custom_instructions` | text | NULL | — | Optional custom instructions for the question. |
| 18 | `category` | text | NULL | — | Free-text category label. Used by the application instead of `category_id`. |
| 19 | `category_secondary` | text | NULL | — | Optional secondary category label. |

**Check constraints:**
- `questions_response_type_check` — `response_type IN ('text', 'audio')`
- `questions_status_check` — `status IN ('active', 'archived')`

**Triggers:** `questions_set_updated_at` — BEFORE UPDATE, sets `updated_at = now()`

---

## Module: Assignment Templates

### assignment_templates

| Field | Value |
|---|---|
| **Purpose** | Reusable assignment definitions created by teachers. A template bundles a set of fixed questions and optional random question rules. Templates are the source from which assignment drafts are created. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `owner_id` → `profiles(id)` |
| **Relationships** | Many-to-one with `profiles`. One-to-many with `assignment_template_questions`, `assignment_template_random_rules`, `assignment_drafts` (via `template_id`). |
| **Indexes** | `assignment_templates_pkey` (unique, `id`), `idx_assignment_templates_owner_id`, `idx_assignment_templates_status` |
| **RLS enabled** | Yes |
| **Owning module** | Assignment Templates |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('assignment_templates_id_seq')` | Surrogate primary key. |
| 2 | `name` | text | NOT NULL | — | Template display name. |
| 3 | `description` | text | NULL | — | Optional description. |
| 4 | `owner_id` | uuid | NOT NULL | `auth.uid()` | UUID of the teacher who owns this template. |
| 5 | `status` | text | NOT NULL | `'active'` | Either `active` or `archived`. Enforced by CHECK. |
| 6 | `archived_at` | timestamptz | NULL | — | Set when the template is archived. |
| 7 | `created_at` | timestamptz | NOT NULL | `now()` | Timestamp of creation. |
| 8 | `updated_at` | timestamptz | NOT NULL | `now()` | Timestamp of last update. Maintained by trigger. |

**Check constraints:** `assignment_templates_status_check` — `status IN ('active', 'archived')`

**Triggers:** `assignment_templates_set_updated_at` — BEFORE UPDATE, sets `updated_at = now()`

---

### assignment_template_questions

| Field | Value |
|---|---|
| **Purpose** | Junction table linking fixed questions to templates. Each row represents a question explicitly selected for a template, with an ordering index. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `template_id` → `assignment_templates(id)`, `question_id` → `questions(id)` |
| **Relationships** | Many-to-one with `assignment_templates` and `questions`. |
| **Indexes** | `assignment_template_questions_pkey` (unique, `id`), `assignment_template_questions_template_id_question_id_key` (unique, `template_id` + `question_id`), `idx_atq_template_id`, `idx_atq_question_id` |
| **RLS enabled** | Yes |
| **Owning module** | Assignment Templates |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('assignment_template_questions_id_seq')` | Surrogate primary key. |
| 2 | `template_id` | bigint | NOT NULL | — | FK to `assignment_templates.id`. |
| 3 | `question_id` | bigint | NOT NULL | — | FK to `questions.id`. |
| 4 | `selection_order` | integer | NOT NULL | — | Ordering of this question within the template. |
| 5 | `created_at` | timestamptz | NOT NULL | `now()` | Timestamp of creation. |

---

### assignment_template_random_rules

| Field | Value |
|---|---|
| **Purpose** | Stores random question selection rules attached to a template. Each rule specifies criteria (question type, response type, category, tags) — a matching question is randomly selected at draft creation time. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `template_id` → `assignment_templates(id)` |
| **Relationships** | Many-to-one with `assignment_templates`. |
| **Indexes** | `assignment_template_random_rules_pkey` (unique, `id`), `idx_atrr_template_id` |
| **RLS enabled** | Yes |
| **Owning module** | Assignment Templates |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('assignment_template_random_rules_id_seq')` | Surrogate primary key. |
| 2 | `template_id` | bigint | NOT NULL | — | FK to `assignment_templates.id`. |
| 3 | `rule_order` | integer | NOT NULL | — | Ordering of this rule within the template. |
| 4 | `question_type_id` | bigint | NOT NULL | — | FK to `questiontypes.id` (constraint not explicitly named, but FK exists). |
| 5 | `response_type` | text | NOT NULL | — | Either `text` or `audio`. Enforced by CHECK. |
| 6 | `category` | text | NULL | — | Optional category filter for random selection. |
| 7 | `tags` | text[] | NULL | — | Optional tag filter for random selection. |
| 8 | `created_at` | timestamptz | NOT NULL | `now()` | Timestamp of creation. |

**Check constraints:** `atrr_response_type_check` — `response_type IN ('text', 'audio')`

---

## Module: Assignment Drafts

### assignment_drafts

| Field | Value |
|---|---|
| **Purpose** | Concrete assignment instances created from templates, assigned to a specific class. Contains fixed question IDs after random rule resolution. Drafts are the precursor to published assignments. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `template_id` → `assignment_templates(id)`, `class_id` → `classes(id)`, `owner_id` → `profiles(id)` |
| **Relationships** | Many-to-one with `assignment_templates`, `classes`, `profiles`. One-to-many with `assignment_draft_questions`. |
| **Indexes** | `assignment_drafts_pkey` (unique, `id`), `idx_assignment_drafts_owner_id`, `idx_assignment_drafts_template_id`, `idx_assignment_drafts_class_id` |
| **RLS enabled** | Yes |
| **Owning module** | Assignment Drafts |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('assignment_drafts_id_seq')` | Surrogate primary key. |
| 2 | `name` | text | NOT NULL | — | Draft display name. |
| 3 | `description` | text | NULL | — | Optional description. |
| 4 | `template_id` | bigint | NULL | — | FK to `assignment_templates.id`. NULL if draft was created without a template. |
| 5 | `class_id` | bigint | NULL | — | FK to `classes.id`. The class this draft is assigned to. |
| 6 | `owner_id` | uuid | NOT NULL | `auth.uid()` | UUID of the teacher who owns this draft. |
| 7 | `status` | text | NOT NULL | `'draft'` | Either `draft` or `published`. Enforced by CHECK. |
| 8 | `created_at` | timestamptz | NOT NULL | `now()` | Timestamp of creation. |
| 9 | `updated_at` | timestamptz | NOT NULL | `now()` | Timestamp of last update. Maintained by trigger. |

**Check constraints:** `assignment_drafts_status_check` — `status IN ('draft', 'published')`

**Triggers:** `assignment_drafts_set_updated_at` — BEFORE UPDATE, sets `updated_at = now()`

---

### assignment_draft_questions

| Field | Value |
|---|---|
| **Purpose** | Junction table linking resolved questions to drafts. Each row is a question (either fixed from the template or randomly resolved from a rule) with an ordering index. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `draft_id` → `assignment_drafts(id)`, `question_id` → `questions(id)` |
| **Relationships** | Many-to-one with `assignment_drafts` and `questions`. |
| **Indexes** | `assignment_draft_questions_pkey` (unique, `id`), `assignment_draft_questions_draft_id_question_id_key` (unique, `draft_id` + `question_id`), `idx_adq_draft_id`, `idx_adq_question_id` |
| **RLS enabled** | Yes |
| **Owning module** | Assignment Drafts |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('assignment_draft_questions_id_seq')` | Surrogate primary key. |
| 2 | `draft_id` | bigint | NOT NULL | — | FK to `assignment_drafts.id`. |
| 3 | `question_id` | bigint | NOT NULL | — | FK to `questions.id`. |
| 4 | `selection_order` | integer | NOT NULL | — | Ordering of this question within the draft. |
| 5 | `created_at` | timestamptz | NOT NULL | `now()` | Timestamp of creation. |

---

## Legacy Tables (Original Schema)

The following tables were created in the initial schema migration
(`000_create_base_schema.sql`) and appear to represent an earlier design that
was superseded by the current implementation. They are **not used by any
application code** and have **no RLS policies**.

### assignmenttemplates (legacy)

| Field | Value |
|---|---|
| **Purpose** | Original template table, superseded by `assignment_templates`. |
| **Primary key** | `id` (bigint, identity) |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('assignmenttemplates_id_seq')` | Surrogate primary key. |
| 2 | `name` | text | NOT NULL | — | Template name. |

---

### assignmenttemplateitems (legacy)

| Field | Value |
|---|---|
| **Purpose** | Original template-question junction, superseded by `assignment_template_questions`. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `set_id` → `assignmenttemplates(id)`, `question_id` → `questions(id)` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('assignmenttemplateitems_id_seq')` | Surrogate primary key. |
| 2 | `set_id` | bigint | NOT NULL | — | FK to `assignmenttemplates.id`. |
| 3 | `question_id` | bigint | NOT NULL | — | FK to `questions.id`. |

---

### assignmentdrafts (legacy)

| Field | Value |
|---|---|
| **Purpose** | Original draft table, superseded by `assignment_drafts`. Note: same table name as the current draft table but with different columns — this is the legacy version with `original_set_id` instead of `template_id`/`class_id`/`owner_id`/`status`. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `original_set_id` → `assignmenttemplates(id)` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('assignmentdrafts_id_seq')` | Surrogate primary key. |
| 2 | `name` | text | NOT NULL | — | Draft name. |
| 3 | `original_set_id` | bigint | NULL | — | FK to `assignmenttemplates.id`. |

---

### assignmentdraftitems (legacy)

| Field | Value |
|---|---|
| **Purpose** | Original draft-question junction, superseded by `assignment_draft_questions`. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `instance_id` → `assignmentdrafts(id)` (legacy), `question_id` → `questions(id)` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('assignmentdraftitems_id_seq')` | Surrogate primary key. |
| 2 | `instance_id` | bigint | NOT NULL | — | FK to legacy `assignmentdrafts.id`. |
| 3 | `question_id` | bigint | NOT NULL | — | FK to `questions.id`. |

---

### randomrules (legacy)

| Field | Value |
|---|---|
| **Purpose** | Original random rule table, superseded by `assignment_template_random_rules`. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `assignment_set_id` → `assignmentdrafts(id)` (legacy), `category_id` → `questioncategories(id)`, `question_type_id` → `questiontypes(id)` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval('randomrules_id_seq')` | Surrogate primary key. |
| 2 | `assignment_set_id` | bigint | NOT NULL | — | FK to legacy `assignmentdrafts.id`. |
| 3 | `category_id` | bigint | NOT NULL | — | FK to `questioncategories.id`. |
| 4 | `question_type_id` | bigint | NOT NULL | — | FK to `questiontypes.id`. |
| 5 | `quantity` | integer | NOT NULL | — | Number of random questions to select. |

---

## Unimplemented Module Tables

The following tables exist in the database but belong to modules that are not
yet implemented (Publishing, Student Workspace, Grading). They are listed here
for completeness because they have foreign keys pointing to implemented tables.

### publishedassignments

| Field | Value |
|---|---|
| **Purpose** | Published assignment instances assigned to classes. Referenced by `studentassignmentitems`. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `class_id` → `classes(id)`, `instance_id` → `assignmentdrafts(id)` |
| **Indexes** | `publishedassignments_pkey` (unique, `id`), `idx_publishedassignments_class_id` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval(...)` | Surrogate primary key. |
| 2 | `class_id` | bigint | NOT NULL | — | FK to `classes.id`. |
| 3 | `instance_id` | bigint | NOT NULL | — | FK to `assignment_drafts.id`. |
| 4 | `status` | text | NOT NULL | `'Draft'` | Publication status. |
| 5 | `published_at` | timestamptz | NULL | — | Timestamp of publication. |
| 6 | `archived_at` | timestamptz | NULL | — | Timestamp of archival. |

---

### studentassignmentitems

| Field | Value |
|---|---|
| **Purpose** | Individual assignment items assigned to students within a published assignment. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `assignment_id` → `publishedassignments(id)`, `question_id` → `questions(id)`, `student_id` → `students(id)`, `snapshot_id` → `questionsnapshots(id)` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval(...)` | Surrogate primary key. |
| 2 | `assignment_id` | bigint | NOT NULL | — | FK to `publishedassignments.id`. |
| 3 | `question_id` | bigint | NOT NULL | — | FK to `questions.id`. |
| 4 | `student_id` | bigint | NOT NULL | — | FK to `students.id`. |
| 5 | `snapshot_id` | bigint | NULL | — | FK to `questionsnapshots.id`. |
| 6 | `status` | text | NOT NULL | `'not started'` | Item status. |
| 7 | `start_time` | timestamptz | NULL | — | When the student started. |
| 8 | `end_time` | timestamptz | NULL | — | When the student finished. |
| 9 | `due_at` | timestamptz | NULL | — | Due date. |
| 10 | `available_from` | timestamptz | NULL | — | When the item becomes available. |
| 11 | `time_limit` | interval | NULL | — | Time limit for completion. |

---

### studentsubmissions

| Field | Value |
|---|---|
| **Purpose** | Student submission records for assignment items. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `assignment_item_id` → `studentassignmentitems(id)`, `student_id` → `students(id)` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval(...)` | Surrogate primary key. |
| 2 | `assignment_item_id` | bigint | NOT NULL | — | FK to `studentassignmentitems.id`. |
| 3 | `student_id` | bigint | NOT NULL | — | FK to `students.id`. |
| 4 | `content` | text | NULL | — | Submission content. |
| 5 | `file_path` | text | NULL | — | Path to submitted file. |
| 6 | `file_type` | text | NOT NULL | — | Type of submitted file. |
| 7 | `status` | text | NOT NULL | `'submitted'` | Submission status. |
| 8 | `submitted_at` | timestamptz | NULL | `now()` | Timestamp of submission. |

---

### grading

| Field | Value |
|---|---|
| **Purpose** | Grading records for student submissions. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `submission_id` → `studentsubmissions(id)`, `teacher_id` → `teachers(id)` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval(...)` | Surrogate primary key. |
| 2 | `submission_id` | bigint | NOT NULL | — | FK to `studentsubmissions.id`. |
| 3 | `teacher_id` | bigint | NOT NULL | — | FK to `teachers.id`. |
| 4 | `grading_status` | text | NOT NULL | `'pending'` | Status of grading. |
| 5 | `overall_band_score` | numeric | NULL | — | Overall band score. |
| 6 | `grading_timestamp` | timestamptz | NULL | `now()` | When grading was completed. |

---

### criterionscores

| Field | Value |
|---|---|
| **Purpose** | Individual criterion scores within a grading record. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `grading_id` → `grading(id)`, `criterion_id` → `rubriccriteria(id)` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval(...)` | Surrogate primary key. |
| 2 | `grading_id` | bigint | NOT NULL | — | FK to `grading.id`. |
| 3 | `criterion_id` | bigint | NULL | — | FK to `rubriccriteria.id`. |
| 4 | `score` | integer | NULL | — | Score for this criterion. |

---

### generalfeedback

| Field | Value |
|---|---|
| **Purpose** | General feedback for a grading record. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `grading_id` → `grading(id)` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval(...)` | Surrogate primary key. |
| 2 | `grading_id` | bigint | NOT NULL | — | FK to `grading.id`. |
| 3 | `strengths` | text | NULL | — | Strengths feedback. |
| 4 | `weaknesses` | text | NULL | — | Weaknesses feedback. |
| 5 | `overall_comments` | text | NULL | — | Overall comments. |
| 6 | `rich_text_feedback` | text | NULL | — | Rich text feedback. |
| 7 | `suggestions` | text | NULL | — | Suggestions. |

---

### inlineannotations

| Field | Value |
|---|---|
| **Purpose** | Inline annotations on student submissions. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `submission_id` → `studentsubmissions(id)` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval(...)` | Surrogate primary key. |
| 2 | `submission_id` | bigint | NOT NULL | — | FK to `studentsubmissions.id`. |
| 3 | `annotation_type` | text | NULL | — | Type of annotation. |
| 4 | `annotation_content` | text | NULL | — | Content of annotation. |
| 5 | `annotation_position` | integer | NULL | — | Position in the submission. |

---

### rubrics

| Field | Value |
|---|---|
| **Purpose** | Rubric definitions for grading. |
| **Primary key** | `id` (bigint, identity) |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval(...)` | Surrogate primary key. |
| 2 | `name` | text | NOT NULL | — | Rubric name. |

---

### rubriccriteria

| Field | Value |
|---|---|
| **Purpose** | Criteria within a rubric. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `rubric_id` → `rubrics(id)` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval(...)` | Surrogate primary key. |
| 2 | `rubric_id` | bigint | NOT NULL | — | FK to `rubrics.id`. |
| 3 | `name` | text | NOT NULL | — | Criterion name. |

---

### questionsnapshots

| Field | Value |
|---|---|
| **Purpose** | Immutable snapshots of questions at publication time. Referenced by `studentassignmentitems.snapshot_id`. |
| **Primary key** | `id` (bigint, identity) |
| **Foreign keys** | `question_category_id` → `questioncategories(id)`, `question_type_id` → `questiontypes(id)`, `rubric_id` → `rubrics.id` |
| **RLS enabled** | No |

| # | Column | Data type | Nullable | Default | Purpose |
|---|---|---|---|---|---|
| 1 | `id` | bigint | NOT NULL | `nextval(...)` | Surrogate primary key. |
| 2 | `question_category_id` | bigint | NULL | — | FK to `questioncategories.id`. |
| 3 | `question_type_id` | bigint | NULL | — | FK to `questiontypes.id`. |
| 4 | `rubric_id` | bigint | NULL | — | FK to `rubrics.id`. |
| 5 | `prompt` | text | NULL | — | Question prompt at snapshot time. |
| 6 | `instructions` | text | NULL | — | Instructions at snapshot time. |
| 7 | `response_type` | text | NULL | — | Response type at snapshot time. |
| 8 | `image_url` | text | NULL | — | Image URL at snapshot time. |
| 9 | `image` | text | NULL | — | Alternative image field (purpose unclear). |
| 10 | `timer` | interval | NULL | — | Timer for the question. |
| 11 | `version` | text | NULL | — | Version label. |
