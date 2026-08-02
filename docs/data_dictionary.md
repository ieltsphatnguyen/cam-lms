# Data Dictionary

This document lists every column in every table within the scope of this audit,
classified by usage status.

**Status definitions:**

| Status | Meaning |
|---|---|
| **Required** | The column is actively used by the application and is essential for the module to function. |
| **Optional** | The column is actively used but may be NULL; the application handles the NULL case. |
| **Legacy** | The column exists from an earlier schema design and is no longer used by the application. It has not been removed. |
| **Unused** | The column is not referenced by any application code. It may be reserved for future use or was forgotten. |
| **Candidate for removal** | The column is unused, has no FK constraint, no index, and no application reference. It can be safely dropped. |

---

## profiles

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| profiles | `id` | UUID matching auth.users.id; primary key | Auth, User Mgmt, Question Bank, Templates, Drafts | Yes | Yes (edge functions / RPC) | Required |
| profiles | `role` | User role: admin, teacher, or student | Auth, User Mgmt, all modules (via get_my_role) | Yes | Yes (change_user_role RPC, register-student EF) | Required |
| profiles | `teacher_id` | FK to teachers.id; set when role is/was teacher | User Mgmt, Classes | Yes | Yes (change_user_role RPC, create-teacher EF) | Required |
| profiles | `student_id` | FK to students.id; set when role is/was student | User Mgmt, Classes | Yes | Yes (register_student RPC, register-student EF) | Required |
| profiles | `created_at` | Timestamp of profile creation | None directly | No | No (default only) | Optional |
| profiles | `display_name` | User display name shown in UI | Auth, User Mgmt, Question Bank, Templates, Drafts | Yes | Yes (update_own_profile RPC) | Required |
| profiles | `avatar_url` | Public URL of avatar in storage | Auth, Profile page | Yes | Yes (update_own_profile RPC) | Optional |

---

## teachers

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| teachers | `id` | Surrogate primary key | Classes, Courses, Questions (legacy) | Yes | Yes (change_user_role, create-teacher EF) | Required |
| teachers | `name` | Teacher display name (denormalized) | Admin Teachers page | Yes | Yes (change_user_role, create-teacher EF) | Required |

---

## students

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| students | `id` | Surrogate primary key | Classes | Yes | Yes (register_student RPC, register-student EF) | Required |
| students | `name` | Student display name (denormalized) | None directly in app | No | Yes (register_student RPC) | Required |

---

## role_audit_log

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| role_audit_log | `id` | Surrogate primary key (UUID) | Admin Users page | Yes | No (auto) | Required |
| role_audit_log | `admin_id` | UUID of admin who changed role | Admin Users page | No | Yes (change_user_role RPC) | Required |
| role_audit_log | `admin_email` | Email of admin (denormalized) | Admin Users page | Yes | Yes (change_user_role RPC) | Required |
| role_audit_log | `target_id` | UUID of user whose role changed | None displayed | No | Yes (change_user_role RPC) | Required |
| role_audit_log | `target_email` | Email of target (denormalized) | Admin Users page | Yes | Yes (change_user_role RPC) | Required |
| role_audit_log | `previous_role` | Role before change | Admin Users page | Yes | Yes (change_user_role RPC) | Required |
| role_audit_log | `new_role` | Role after change | Admin Users page | Yes | Yes (change_user_role RPC) | Required |
| role_audit_log | `created_at` | Timestamp of change | Admin Users page | Yes | No (auto) | Required |

---

## classes

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| classes | `id` | Surrogate primary key | Classes, Drafts | Yes | Yes (TeacherClassesPage) | Required |
| classes | `name` | Class display name | Classes, Drafts | Yes | Yes (TeacherClassesPage) | Required |
| classes | `class_code` | Optional short code for class | Classes, Student Classes | Yes | Yes (TeacherClassesPage) | Optional |
| classes | `archived_at` | Archive timestamp (NULL = active) | Classes, Drafts | Yes | Yes (TeacherClassesPage) | Required |

---

## teacherclasses

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| teacherclasses | `id` | Surrogate primary key | None directly | No | Yes (TeacherClassesPage) | Required |
| teacherclasses | `teacher_id` | FK to teachers.id | Classes (RLS policies) | Yes | Yes (TeacherClassesPage) | Required |
| teacherclasses | `class_id` | FK to classes.id | Classes (RLS policies) | Yes | Yes (TeacherClassesPage) | Required |

---

## classstudents

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| classstudents | `id` | Surrogate primary key | Student Classes page | Yes | No | Required |
| classstudents | `student_id` | FK to students.id | Classes, Student Classes | Yes | Yes (StudentClassesPage via RLS) | Required |
| classstudents | `class_id` | FK to classes.id | Classes, Student Classes | Yes | Yes (StudentClassesPage via RLS) | Required |

---

## studentclasses

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| studentclasses | `id` | Surrogate primary key | None | No | No | **Legacy** — duplicate of `classstudents`. Not referenced by any application code. |
| studentclasses | `student_id` | FK to students.id | None | No | No | **Legacy** — duplicate of `classstudents.student_id`. |
| studentclasses | `class_id` | FK to classes.id | None | No | No | **Legacy** — duplicate of `classstudents.class_id`. |

---

## courses

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| courses | `id` | Surrogate primary key | None (Courses page is "Coming Soon") | No | No | **Unused** — table exists but module is not implemented. |
| courses | `name` | Course name | None | No | No | **Unused** — module not implemented. |
| courses | `description` | Course description | None | No | No | **Unused** — module not implemented. |
| courses | `created_by` | FK to teachers.id | None | No | No | **Unused** — module not implemented. |

---

## coursesessions

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| coursesessions | `id` | Surrogate primary key | None | No | No | **Unused** — module not implemented. |
| coursesessions | `course_id` | FK to courses.id | None | No | No | **Unused** — module not implemented. |
| coursesessions | `title` | Session title | None | No | No | **Unused** — module not implemented. |
| coursesessions | `session_number` | Session ordering | None | No | No | **Unused** — module not implemented. |
| coursesessions | `content` | Session content | None | No | No | **Unused** — module not implemented. |

---

## classcourseapplications

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| classcourseapplications | `id` | Surrogate primary key | None | No | No | **Unused** — module not implemented. |
| classcourseapplications | `class_id` | FK to classes.id | None | No | No | **Unused** — module not implemented. |
| classcourseapplications | `course_id` | FK to courses.id | None | No | No | **Unused** — module not implemented. |
| classcourseapplications | `start_date` | Start date | None | No | No | **Unused** — module not implemented. |
| classcourseapplications | `writing_day` | Writing session day | None | No | No | **Unused** — module not implemented. |
| classcourseapplications | `speaking_day` | Speaking session day | None | No | No | **Unused** — module not implemented. |

---

## generatedschedules

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| generatedschedules | `id` | Surrogate primary key | None | No | No | **Unused** — module not implemented. |
| generatedschedules | `class_id` | FK to classes.id | None | No | No | **Unused** — module not implemented. |
| generatedschedules | `session_id` | FK to coursesessions.id | None | No | No | **Unused** — module not implemented. |
| generatedschedules | `scheduled_date` | Scheduled date | None | No | No | **Unused** — module not implemented. |
| generatedschedules | `status` | Schedule status | None | No | No | **Unused** — module not implemented. |

---

## questiontypes

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| questiontypes | `id` | Surrogate primary key | Question Bank, Templates, Drafts | Yes | No | Required |
| questiontypes | `name` | Unique question type name | Question Bank, Templates | Yes | No | Required |

---

## questioncategories

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| questioncategories | `id` | Surrogate primary key | None (legacy) | No | No | **Legacy** — superseded by `questions.category` free-text column. Not referenced by application code. |
| questioncategories | `name` | Category name | None | No | No | **Legacy** — superseded by `questions.category`. |
| questioncategories | `type_id` | FK to questiontypes.id | None | No | No | **Legacy** — superseded by `questions.category`. |

---

## questions

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| questions | `id` | Surrogate primary key | Question Bank, Templates, Drafts | Yes | No | Required |
| questions | `content` | Question prompt text | Question Bank, Templates, Drafts | Yes | Yes | Required |
| questions | `category_id` | FK to questioncategories.id | None | No | No | **Legacy** — superseded by `category`. The application never reads or writes this column. Always NULL. |
| questions | `type_id` | FK to questiontypes.id | Question Bank, Templates, Drafts | Yes | Yes | Required |
| questions | `created_by` | FK to teachers.id (legacy ownership) | None | No | No | **Legacy** — superseded by `owner_id`. The application never reads or writes this column. Always NULL. |
| questions | `created_at` | Timestamp of creation | Question Bank (ordering) | Yes | No (auto) | Optional |
| questions | `updated_at` | Timestamp of last update (trigger-maintained) | Question Bank (ordering) | Yes | No (auto) | Required |
| questions | `description` | Optional description/instructions | Question Bank | Yes | Yes | Optional |
| questions | `ielts_band` | Optional IELTS band label | Question Bank | Yes | Yes | Optional |
| questions | `tags` | Array of tags for filtering | Question Bank, Templates (random rules) | Yes | Yes | Optional |
| questions | `response_type` | text or audio | Question Bank, Templates, Drafts | Yes | Yes | Required |
| questions | `image_url` | Public URL of attached image | Question Bank | Yes | Yes | Optional |
| questions | `owner_id` | UUID of owning teacher (defaults to auth.uid()) | Question Bank (RLS), Templates, Drafts | Yes | Yes | Required |
| questions | `status` | active or archived | Question Bank, Templates, Drafts | Yes | Yes | Required |
| questions | `archived_at` | Archive timestamp | Question Bank | Yes | Yes | Optional |
| questions | `custom_type_name` | Custom type name override | Question Bank | Yes | Yes | Optional |
| questions | `custom_instructions` | Custom instructions override | Question Bank | Yes | Yes | Optional |
| questions | `category` | Free-text category label | Question Bank, Templates (random rules) | Yes | Yes | Optional |
| questions | `category_secondary` | Secondary category label | Question Bank | Yes | Yes | Optional |

---

## assignment_templates

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| assignment_templates | `id` | Surrogate primary key | Templates, Drafts | Yes | No | Required |
| assignment_templates | `name` | Template display name | Templates, Drafts | Yes | Yes | Required |
| assignment_templates | `description` | Optional description | Templates, Drafts | Yes | Yes | Optional |
| assignment_templates | `owner_id` | UUID of owning teacher | Templates (RLS), Drafts | Yes | Yes | Required |
| assignment_templates | `status` | active or archived | Templates, Drafts | Yes | Yes | Required |
| assignment_templates | `archived_at` | Archive timestamp | Templates | Yes | Yes | Optional |
| assignment_templates | `created_at` | Timestamp of creation | None displayed | No | No (auto) | Optional |
| assignment_templates | `updated_at` | Timestamp of last update (trigger) | Templates (ordering) | Yes | No (auto) | Required |

---

## assignment_template_questions

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| assignment_template_questions | `id` | Surrogate primary key | None directly | No | Yes | Required |
| assignment_template_questions | `template_id` | FK to assignment_templates.id | Templates, Drafts | Yes | Yes | Required |
| assignment_template_questions | `question_id` | FK to questions.id | Templates, Drafts | Yes | Yes | Required |
| assignment_template_questions | `selection_order` | Question ordering within template | Templates, Drafts | Yes | Yes | Required |
| assignment_template_questions | `created_at` | Timestamp of creation | None | No | No (auto) | Optional |

---

## assignment_template_random_rules

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| assignment_template_random_rules | `id` | Surrogate primary key | Drafts (resolve_random_rule) | Yes | No | Required |
| assignment_template_random_rules | `template_id` | FK to assignment_templates.id | Templates, Drafts | Yes | Yes | Required |
| assignment_template_random_rules | `rule_order` | Rule ordering within template | Templates, Drafts | Yes | Yes | Required |
| assignment_template_random_rules | `question_type_id` | FK to questiontypes.id | Templates, Drafts | Yes | Yes | Required |
| assignment_template_random_rules | `response_type` | text or audio (CHECK) | Templates, Drafts | Yes | Yes | Required |
| assignment_template_random_rules | `category` | Optional category filter | Templates, Drafts | Yes | Yes | Optional |
| assignment_template_random_rules | `tags` | Optional tag filter (array) | Templates, Drafts | Yes | Yes | Optional |
| assignment_template_random_rules | `created_at` | Timestamp of creation | None | No | No (auto) | Optional |

---

## assignment_drafts

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| assignment_drafts | `id` | Surrogate primary key | Drafts | Yes | No | Required |
| assignment_drafts | `name` | Draft display name | Drafts | Yes | Yes (RPC) | Required |
| assignment_drafts | `description` | Optional description | Drafts | Yes | Yes (RPC) | Optional |
| assignment_drafts | `template_id` | FK to assignment_templates.id | Drafts | Yes | Yes (RPC) | Optional |
| assignment_drafts | `class_id` | FK to classes.id | Drafts | Yes | Yes (RPC) | Optional |
| assignment_drafts | `owner_id` | UUID of owning teacher | Drafts (RLS) | Yes | Yes (RPC, default) | Required |
| assignment_drafts | `status` | draft or published (CHECK) | Drafts | Yes | Yes (RPC, default) | Required |
| assignment_drafts | `created_at` | Timestamp of creation | None displayed | No | No (auto) | Optional |
| assignment_drafts | `updated_at` | Timestamp of last update (trigger) | Drafts (ordering) | Yes | No (auto) | Required |

---

## assignment_draft_questions

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| assignment_draft_questions | `id` | Surrogate primary key | None directly | No | Yes (RPC) | Required |
| assignment_draft_questions | `draft_id` | FK to assignment_drafts.id | Drafts | Yes | Yes (RPC) | Required |
| assignment_draft_questions | `question_id` | FK to questions.id | Drafts | Yes | Yes (RPC) | Required |
| assignment_draft_questions | `selection_order` | Question ordering within draft | Drafts | Yes | Yes (RPC) | Required |
| assignment_draft_questions | `created_at` | Timestamp of creation | None | No | No (auto) | Optional |

---

## Legacy Tables

### assignmenttemplates (legacy)

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| assignmenttemplates | `id` | Surrogate primary key | None | No | No | **Legacy** — superseded by `assignment_templates`. |
| assignmenttemplates | `name` | Template name | None | No | No | **Legacy** — superseded by `assignment_templates`. |

### assignmenttemplateitems (legacy)

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| assignmenttemplateitems | `id` | Surrogate primary key | None | No | No | **Legacy** — superseded by `assignment_template_questions`. |
| assignmenttemplateitems | `set_id` | FK to assignmenttemplates.id | None | No | No | **Legacy**. |
| assignmenttemplateitems | `question_id` | FK to questions.id | None | No | No | **Legacy**. |

### assignmentdrafts (legacy)

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| assignmentdrafts | `id` | Surrogate primary key | None | No | No | **Legacy** — superseded by `assignment_drafts`. |
| assignmentdrafts | `name` | Draft name | None | No | No | **Legacy**. |
| assignmentdrafts | `original_set_id` | FK to assignmenttemplates.id | None | No | No | **Legacy**. |

### assignmentdraftitems (legacy)

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| assignmentdraftitems | `id` | Surrogate primary key | None | No | No | **Legacy** — superseded by `assignment_draft_questions`. |
| assignmentdraftitems | `instance_id` | FK to legacy assignmentdrafts.id | None | No | No | **Legacy**. |
| assignmentdraftitems | `question_id` | FK to questions.id | None | No | No | **Legacy**. |

### randomrules (legacy)

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| randomrules | `id` | Surrogate primary key | None | No | No | **Legacy** — superseded by `assignment_template_random_rules`. |
| randomrules | `assignment_set_id` | FK to legacy assignmentdrafts.id | None | No | No | **Legacy**. |
| randomrules | `category_id` | FK to questioncategories.id | None | No | No | **Legacy**. |
| randomrules | `question_type_id` | FK to questiontypes.id | None | No | No | **Legacy**. |
| randomrules | `quantity` | Number of questions to select | None | No | No | **Legacy**. |

---

## Unimplemented Module Tables

### publishedassignments

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| publishedassignments | `id` | Surrogate primary key | None | No | No | **Unused** — Publishing module not implemented. |
| publishedassignments | `class_id` | FK to classes.id | None | No | No | **Unused**. |
| publishedassignments | `instance_id` | FK to assignment_drafts.id | None | No | No | **Unused**. |
| publishedassignments | `status` | Publication status | None | No | No | **Unused**. |
| publishedassignments | `published_at` | Publication timestamp | None | No | No | **Unused**. |
| publishedassignments | `archived_at` | Archive timestamp | None | No | No | **Unused**. |

### studentassignmentitems

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| studentassignmentitems | `id` | Surrogate primary key | None | No | No | **Unused** — Student Workspace not implemented. |
| studentassignmentitems | `assignment_id` | FK to publishedassignments.id | None | No | No | **Unused**. |
| studentassignmentitems | `question_id` | FK to questions.id | None | No | No | **Unused**. |
| studentassignmentitems | `student_id` | FK to students.id | None | No | No | **Unused**. |
| studentassignmentitems | `snapshot_id` | FK to questionsnapshots.id | None | No | No | **Unused**. |
| studentassignmentitems | `status` | Item status | None | No | No | **Unused**. |
| studentassignmentitems | `start_time` | Start timestamp | None | No | No | **Unused**. |
| studentassignmentitems | `end_time` | End timestamp | None | No | No | **Unused**. |
| studentassignmentitems | `due_at` | Due date | None | No | No | **Unused**. |
| studentassignmentitems | `available_from` | Available from date | None | No | No | **Unused**. |
| studentassignmentitems | `time_limit` | Time limit | None | No | No | **Unused**. |

### studentsubmissions

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| studentsubmissions | `id` | Surrogate primary key | None | No | No | **Unused** — Grading not implemented. |
| studentsubmissions | `assignment_item_id` | FK to studentassignmentitems.id | None | No | No | **Unused**. |
| studentsubmissions | `student_id` | FK to students.id | None | No | No | **Unused**. |
| studentsubmissions | `content` | Submission content | None | No | No | **Unused**. |
| studentsubmissions | `file_path` | File path | None | No | No | **Unused**. |
| studentsubmissions | `file_type` | File type | None | No | No | **Unused**. |
| studentsubmissions | `status` | Submission status | None | No | No | **Unused**. |
| studentsubmissions | `submitted_at` | Submission timestamp | None | No | No | **Unused**. |

### grading

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| grading | `id` | Surrogate primary key | None | No | No | **Unused** — Grading not implemented. |
| grading | `submission_id` | FK to studentsubmissions.id | None | No | No | **Unused**. |
| grading | `teacher_id` | FK to teachers.id | None | No | No | **Unused**. |
| grading | `grading_status` | Grading status | None | No | No | **Unused**. |
| grading | `overall_band_score` | Overall band score | None | No | No | **Unused**. |
| grading | `grading_timestamp` | Grading timestamp | None | No | No | **Unused**. |

### criterionscores

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| criterionscores | `id` | Surrogate primary key | None | No | No | **Unused**. |
| criterionscores | `grading_id` | FK to grading.id | None | No | No | **Unused**. |
| criterionscores | `criterion_id` | FK to rubriccriteria.id | None | No | No | **Unused**. |
| criterionscores | `score` | Criterion score | None | No | No | **Unused**. |

### generalfeedback

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| generalfeedback | `id` | Surrogate primary key | None | No | No | **Unused**. |
| generalfeedback | `grading_id` | FK to grading.id | None | No | No | **Unused**. |
| generalfeedback | `strengths` | Strengths feedback | None | No | No | **Unused**. |
| generalfeedback | `weaknesses` | Weaknesses feedback | None | No | No | **Unused**. |
| generalfeedback | `overall_comments` | Overall comments | None | No | No | **Unused**. |
| generalfeedback | `rich_text_feedback` | Rich text feedback | None | No | No | **Unused**. |
| generalfeedback | `suggestions` | Suggestions | None | No | No | **Unused**. |

### inlineannotations

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| inlineannotations | `id` | Surrogate primary key | None | No | No | **Unused**. |
| inlineannotations | `submission_id` | FK to studentsubmissions.id | None | No | No | **Unused**. |
| inlineannotations | `annotation_type` | Annotation type | None | No | No | **Unused**. |
| inlineannotations | `annotation_content` | Annotation content | None | No | No | **Unused**. |
| inlineannotations | `annotation_position` | Position in submission | None | No | No | **Unused**. |

### rubrics

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| rubrics | `id` | Surrogate primary key | None | No | No | **Unused**. |
| rubrics | `name` | Rubric name | None | No | No | **Unused**. |

### rubriccriteria

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| rubriccriteria | `id` | Surrogate primary key | None | No | No | **Unused**. |
| rubriccriteria | `rubric_id` | FK to rubrics.id | None | No | No | **Unused**. |
| rubriccriteria | `name` | Criterion name | None | No | No | **Unused**. |

### questionsnapshots

| Table | Column | Purpose | Used by | Read | Write | Status |
|---|---|---|---|---|---|---|
| questionsnapshots | `id` | Surrogate primary key | None | No | No | **Unused** — Publishing not implemented. |
| questionsnapshots | `question_category_id` | FK to questioncategories.id | None | No | No | **Unused**. |
| questionsnapshots | `question_type_id` | FK to questiontypes.id | None | No | No | **Unused**. |
| questionsnapshots | `rubric_id` | FK to rubrics.id | None | No | No | **Unused**. |
| questionsnapshots | `prompt` | Question prompt at snapshot time | None | No | No | **Unused**. |
| questionsnapshots | `instructions` | Instructions at snapshot time | None | No | No | **Unused**. |
| questionsnapshots | `response_type` | Response type at snapshot time | None | No | No | **Unused**. |
| questionsnapshots | `image_url` | Image URL at snapshot time | None | No | No | **Unused**. |
| questionsnapshots | `image` | Alternative image field | None | No | No | **Unused** — purpose unclear, may be a duplicate of `image_url`. |
| questionsnapshots | `timer` | Timer for the question | None | No | No | **Unused**. |
| questionsnapshots | `version` | Version label | None | No | No | **Unused**. |

---

## Suspicious NULL Columns

The following columns are nullable and warrant explanation:

| Table | Column | Explanation |
|---|---|---|
| questions | `category_id` | **Always NULL.** This is a legacy column from the original schema design that used `questioncategories` for categorization. The application was redesigned to use the free-text `category` column instead. The FK to `questioncategories` still exists but is never populated. It is a candidate for removal. |
| questions | `created_by` | **Always NULL.** This is a legacy ownership column from the original schema. The application was redesigned to use `owner_id` (UUID referencing `profiles.id`) instead. The FK to `teachers` still exists but is never populated. It is a candidate for removal. |
| questions | `owner_id` | Nullable in schema but **always populated** due to the `DEFAULT auth.uid()` and the RLS INSERT policy requiring `owner_id = auth.uid()`. The nullable designation is a schema oversight — it should be NOT NULL. |
| assignment_drafts | `template_id` | **Intentionally nullable.** A draft can be created without a template (though the current application always uses a template via `resolve_template_to_draft` RPC). |
| assignment_drafts | `class_id` | **Intentionally nullable.** A draft can be created without assigning it to a class. |
| classstudents | `student_id` | Nullable in schema but the application always provides a value. The FK constraint exists. |
| classstudents | `class_id` | Nullable in schema but the application always provides a value. The FK constraint exists. |
| questionsnapshots | `image` | **Always NULL.** This appears to be a duplicate of `image_url` from the original schema. It is never populated and has no clear separate purpose. It is a candidate for removal. |
