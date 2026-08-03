# CAM Database Architecture Report

> **Scope:** This document describes the current database architecture of the
> Class Assignment Management (CAM) system as of 2026-08-02.
> It is documentation only — no migrations, no fixes, no cleanup suggestions.

---

## 1. Overview

| Metric | Value |
|---|---|
| Database | Supabase (PostgreSQL 15, hosted) |
| Schema | `public` (application) + `storage` (file storage) |
| Tables (public) | 37 |
| RPC functions (user-defined) | 11 |
| Views | 0 |
| Triggers | 3 |
| Storage buckets | 2 |
| Enums (user-defined) | 0 application enums (platform enums only) |

### Tables by RLS status

| RLS Enabled | Tables |
|---|---|
| Yes | `assignment_draft_questions`, `assignment_drafts`, `assignment_template_favorites`, `assignment_template_questions`, `assignment_template_random_rules`, `assignment_templates`, `classes`, `classstudents`, `profiles`, `published_assignment_items`, `published_assignments`, `questions`, `questiontypes`, `role_audit_log`, `students`, `teacherclasses`, `teachers` |
| No | `assignmentdraftitems`, `assignmentdrafts`, `assignmenttemplateitems`, `assignmenttemplates`, `classcourseapplications`, `courses`, `coursesessions`, `criterionscores`, `generalfeedback`, `generatedschedules`, `grading`, `inlineannotations`, `publishedassignments`, `questioncategories`, `questionsnapshots`, `randomrules`, `rubriccriteria`, `rubrics`, `studentassignmentitems`, `studentclasses`, `studentsubmissions` |

---

## 2. Entity Relationship Diagram (Text)

```
profiles (auth user)
├── teachers (1:1 via profiles.teacher_id)
├── students (1:1 via profiles.student_id)
├── questions (1:N via questions.owner_id)
├── assignment_templates (1:N via assignment_templates.owner_id)
├── assignment_drafts (1:N via assignment_drafts.owner_id)
└── published_assignments (1:N via published_assignments.owner_id)

questiontypes
├── questions (1:N via questions.type_id)
├── questioncategories (1:N via questioncategories.type_id)
├── assignment_template_random_rules (1:N via .question_type_id)
├── questionsnapshots (1:N via .question_type_id)
└── randomrules (1:N via .question_type_id)

questioncategories
├── questions (1:N via questions.category_id)
├── questionsnapshots (1:N via .question_category_id)
└── randomrules (1:N via .category_id)

questions
├── assignment_draft_questions (1:N via .question_id)
├── assignment_template_questions (1:N via .question_id)
├── assignmentdraftitems (1:N via .question_id)
├── assignmenttemplateitems (1:N via .question_id)
├── studentassignmentitems (1:N via .question_id)
└── published_assignment_items (1:N via .question_id)

classes
├── teacherclasses (1:N via .class_id)
├── classstudents (1:N via .class_id)
├── studentclasses (1:N via .class_id)
├── assignment_drafts (1:N via .class_id)
├── published_assignments (1:N via .class_id)
├── publishedassignments (1:N via .class_id)
├── generatedschedules (1:N via .class_id)
└── classcourseapplications (1:N via .class_id)

teachers
├── teacherclasses (1:N via .teacher_id)
├── courses (1:N via .created_by)
├── questions (1:N via .created_by)
├── grading (1:N via .teacher_id)
└── profiles (1:1 via .teacher_id)

students
├── classstudents (1:N via .student_id)
├── studentclasses (1:N via .student_id)
├── studentassignmentitems (1:N via .student_id)
├── studentsubmissions (1:N via .student_id)
└── profiles (1:1 via .student_id)

assignment_templates
├── assignment_template_questions (1:N via .template_id)
├── assignment_template_random_rules (1:N via .template_id)
├── assignment_template_favorites (1:N via .template_id)
└── assignment_drafts (1:N via .template_id)

assignment_drafts
├── assignment_draft_questions (1:N via .draft_id)
├── published_assignments (1:1 via .draft_id)
└── randomrules (1:N via .assignment_set_id)

published_assignments
└── published_assignment_items (1:N via .published_assignment_id)

courses
├── coursesessions (1:N via .course_id)
└── classcourseapplications (1:N via .course_id)

coursesessions
└── generatedschedules (1:N via .session_id)

grading
├── criterionscores (1:N via .grading_id)
└── generalfeedback (1:1 via .grading_id)

rubrics
└── rubriccriteria (1:N via .rubric_id)

studentassignmentitems
└── studentsubmissions (1:N via .assignment_item_id)

studentsubmissions
├── inlineannotations (1:N via .submission_id)
└── grading (1:N via .submission_id)

publishedassignments (legacy)
└── studentassignmentitems (1:N via .assignment_id)

assignmentdrafts (legacy)
├── assignmentdraftitems (1:N via .instance_id)
└── publishedassignments (1:N via .instance_id)

assignmenttemplates (legacy)
├── assignmenttemplateitems (1:N via .set_id)
└── assignmentdrafts (1:N via .original_set_id)
```

---

## 3. Tables

### 3.1 `assignment_draft_questions`

| Property | Value |
|---|---|
| Purpose | Links individual questions into an assignment draft with per-item scheduling and timing metadata. |
| RLS Enabled | Yes |
| Row Count | 4 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | identity | Yes |
| draft_id | bigint | NO | — | |
| question_id | bigint | NO | — | |
| selection_order | integer | NO | — | |
| created_at | timestamptz | NO | now() | |
| available_from | timestamptz | YES | — | |
| due_date | timestamptz | YES | — | |
| due_after_days | integer | YES | — | |
| timed | boolean | NO | false | |
| time_limit | interval | YES | — | |

**Relationships**

- References: `assignment_drafts` (via `draft_id`), `questions` (via `question_id`)
- Referenced by: none

**Used by:** `src/lib/templates.ts` (draft question CRUD), `src/pages/teacher/TeacherAssignmentsPage.tsx`

---

### 3.2 `assignment_drafts`

| Property | Value |
|---|---|
| Purpose | Working draft of an assignment before publishing to a class. |
| RLS Enabled | Yes |
| Row Count | 2 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | identity | Yes |
| name | text | YES | — | |
| description | text | YES | — | |
| template_id | bigint | YES | — | |
| class_id | bigint | YES | — | |
| owner_id | uuid | NO | auth.uid() | |
| status | text | NO | 'draft' | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Relationships**

- References: `assignment_templates` (via `template_id`), `profiles` (via `owner_id`), `classes` (via `class_id`)
- Referenced by: `assignment_draft_questions`, `published_assignments`

**Used by:** `src/lib/templates.ts`, `src/pages/teacher/TeacherAssignmentsPage.tsx`

---

### 3.3 `assignment_template_favorites`

| Property | Value |
|---|---|
| Purpose | Per-user bookmark/favorite of an assignment template. |
| RLS Enabled | Yes |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | identity | Yes |
| template_id | bigint | NO | — | |
| user_id | uuid | NO | auth.uid() | |
| created_at | timestamptz | NO | now() | |

**Relationships**

- References: `assignment_templates` (via `template_id`)
- Referenced by: none

**Used by:** `src/lib/templates.ts`, `src/components/templates/PresetBrowser.tsx`

---

### 3.4 `assignment_template_questions`

| Property | Value |
|---|---|
| Purpose | Links questions into an assignment template in a fixed order. |
| RLS Enabled | Yes |
| Row Count | 7 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | identity | Yes |
| template_id | bigint | NO | — | |
| question_id | bigint | NO | — | |
| selection_order | integer | NO | — | |
| created_at | timestamptz | NO | now() | |

**Relationships**

- References: `assignment_templates` (via `template_id`), `questions` (via `question_id`)
- Referenced by: none

**Used by:** `src/lib/templates.ts`

---

### 3.5 `assignment_template_random_rules`

| Property | Value |
|---|---|
| Purpose | Random question selection rules attached to a template (pick N questions by type/category/tags). |
| RLS Enabled | Yes |
| Row Count | 1 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | identity | Yes |
| template_id | bigint | NO | — | |
| rule_order | integer | NO | — | |
| question_type_id | bigint | NO | — | |
| response_type | text | NO | — | |
| category | text | YES | — | |
| tags | text[] | YES | — | |
| created_at | timestamptz | NO | now() | |

**Relationships**

- References: `assignment_templates` (via `template_id`)
- Referenced by: none

**Used by:** `src/lib/templates.ts`

---

### 3.6 `assignment_templates`

| Property | Value |
|---|---|
| Purpose | Reusable assignment template that can be resolved into a draft. |
| RLS Enabled | Yes |
| Row Count | 4 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | identity | Yes |
| name | text | NO | — | |
| description | text | YES | — | |
| owner_id | uuid | NO | auth.uid() | |
| status | text | NO | 'active' | |
| archived_at | timestamptz | YES | — | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Relationships**

- References: `profiles` (via `owner_id`)
- Referenced by: `assignment_template_questions`, `assignment_template_random_rules`, `assignment_template_favorites`, `assignment_drafts`

**Used by:** `src/lib/templates.ts`, `src/components/templates/PresetBrowser.tsx`, `src/pages/teacher/TeacherAssignmentTemplatesPage.tsx`

---

### 3.7 `assignmentdraftitems` (legacy)

| Property | Value |
|---|---|
| Purpose | Legacy link table between draft instances and questions. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| instance_id | bigint | NO | — | |
| question_id | bigint | NO | — | |

**Relationships**

- References: `assignmentdrafts` (via `instance_id`), `questions` (via `question_id`)
- Referenced by: none

**Used by:** none (no source-code references found)

---

### 3.8 `assignmentdrafts` (legacy)

| Property | Value |
|---|---|
| Purpose | Legacy assignment draft table. Superseded by `assignment_drafts`. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| name | text | NO | — | |
| original_set_id | bigint | YES | — | |

**Relationships**

- References: `assignmenttemplates` (via `original_set_id`)
- Referenced by: `assignmentdraftitems`, `publishedassignments`

**Used by:** none (no source-code references found)

---

### 3.9 `assignmenttemplateitems` (legacy)

| Property | Value |
|---|---|
| Purpose | Legacy link table between templates and questions. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| set_id | bigint | NO | — | |
| question_id | bigint | NO | — | |

**Relationships**

- References: `assignmenttemplates` (via `set_id`), `questions` (via `question_id`)
- Referenced by: none

**Used by:** none (no source-code references found)

---

### 3.10 `assignmenttemplates` (legacy)

| Property | Value |
|---|---|
| Purpose | Legacy assignment template table. Superseded by `assignment_templates`. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| name | text | NO | — | |

**Relationships**

- References: none
- Referenced by: `assignmenttemplateitems`, `assignmentdrafts`

**Used by:** none (no source-code references found)

---

### 3.11 `classcourseapplications`

| Property | Value |
|---|---|
| Purpose | Associates a class with a course and scheduling preferences. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| class_id | bigint | YES | — | |
| course_id | bigint | YES | — | |
| start_date | date | NO | — | |
| writing_day | text | YES | — | |
| speaking_day | text | YES | — | |

**Relationships**

- References: `classes` (via `class_id`), `courses` (via `course_id`)
- Referenced by: none

**Used by:** none (no source-code references found)

---

### 3.12 `classes`

| Property | Value |
|---|---|
| Purpose | A class (group of students under a teacher). |
| RLS Enabled | Yes |
| Row Count | 2 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| name | text | NO | — | |
| class_code | text | YES | — | |
| archived_at | timestamptz | YES | — | |

**Relationships**

- References: none
- Referenced by: `teacherclasses`, `classstudents`, `studentclasses`, `assignment_drafts`, `published_assignments`, `publishedassignments`, `generatedschedules`, `classcourseapplications`

**Used by:** `src/pages/teacher/TeacherClassesPage.tsx`, `src/pages/teacher/TeacherDashboard.tsx`, `src/pages/student/JoinClassModal.tsx`, `src/pages/admin/AdminDashboard.tsx`, `src/lib/templates.ts`

---

### 3.13 `classstudents`

| Property | Value |
|---|---|
| Purpose | Enrolls a student in a class (active system). |
| RLS Enabled | Yes |
| Row Count | 2 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| student_id | bigint | YES | — | |
| class_id | bigint | YES | — | |

**Relationships**

- References: `students` (via `student_id`), `classes` (via `class_id`)
- Referenced by: none

**Used by:** `src/pages/student/JoinClassModal.tsx`, `src/pages/student/StudentClassesPage.tsx`, `src/pages/student/StudentDashboard.tsx`, `src/pages/teacher/TeacherClassesPage.tsx`, `src/pages/teacher/TeacherDashboard.tsx`, `src/lib/templates.ts`

---

### 3.14 `courses`

| Property | Value |
|---|---|
| Purpose | A course (curriculum) created by a teacher. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| name | text | NO | — | |
| description | text | YES | — | |
| created_by | bigint | YES | — | |

**Relationships**

- References: `teachers` (via `created_by`)
- Referenced by: `coursesessions`, `classcourseapplications`

**Used by:** `src/pages/teacher/TeacherCoursesPage.tsx` (page exists; no direct table queries found in source)

---

### 3.15 `coursesessions`

| Property | Value |
|---|---|
| Purpose | Individual sessions within a course. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| course_id | bigint | YES | — | |
| title | text | NO | — | |
| session_number | integer | NO | — | |
| content | text | YES | — | |

**Relationships**

- References: `courses` (via `course_id`)
- Referenced by: `generatedschedules`

**Used by:** none (no source-code references found)

---

### 3.16 `criterionscores`

| Property | Value |
|---|---|
| Purpose | Score for an individual rubric criterion within a grading record. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| grading_id | bigint | NO | — | |
| criterion_id | bigint | YES | — | |
| score | integer | YES | — | |

**Relationships**

- References: `grading` (via `grading_id`), `rubriccriteria` (via `criterion_id`)
- Referenced by: none

**Used by:** none (no source-code references found)

---

### 3.17 `generalfeedback`

| Property | Value |
|---|---|
| Purpose | Overall written feedback for a graded submission. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| grading_id | bigint | NO | — | |
| strengths | text | YES | — | |
| weaknesses | text | YES | — | |
| overall_comments | text | YES | — | |
| rich_text_feedback | text | YES | — | |
| suggestions | text | YES | — | |

**Relationships**

- References: `grading` (via `grading_id`)
- Referenced by: none

**Used by:** none (no source-code references found)

---

### 3.18 `generatedschedules`

| Property | Value |
|---|---|
| Purpose | Generated schedule entries linking a class to a course session on a date. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| class_id | bigint | YES | — | |
| session_id | bigint | YES | — | |
| scheduled_date | date | NO | — | |
| status | text | YES | 'Scheduled' | |

**Relationships**

- References: `classes` (via `class_id`), `coursesessions` (via `session_id`)
- Referenced by: none

**Used by:** none (no source-code references found)

---

### 3.19 `grading`

| Property | Value |
|---|---|
| Purpose | Grading record for a student submission by a teacher. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| submission_id | bigint | NO | — | |
| teacher_id | bigint | NO | — | |
| grading_status | text | NO | 'pending' | |
| overall_band_score | numeric | YES | — | |
| grading_timestamp | timestamptz | YES | now() | |

**Relationships**

- References: `studentsubmissions` (via `submission_id`), `teachers` (via `teacher_id`)
- Referenced by: `criterionscores`, `generalfeedback`

**Used by:** `src/pages/teacher/TeacherGradingPage.tsx` (page exists; no direct table queries found in source)

---

### 3.20 `inlineannotations`

| Property | Value |
|---|---|
| Purpose | Inline annotation within a student submission. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| submission_id | bigint | NO | — | |
| annotation_type | text | YES | — | |
| annotation_content | text | YES | — | |
| annotation_position | integer | YES | — | |

**Relationships**

- References: `studentsubmissions` (via `submission_id`)
- Referenced by: none

**Used by:** none (no source-code references found)

---

### 3.21 `profiles`

| Property | Value |
|---|---|
| Purpose | Application-level user profile linked to Supabase auth. Stores role and display info. |
| RLS Enabled | Yes |
| Row Count | 6 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | uuid | NO | — | Yes |
| role | text | NO | — | |
| teacher_id | bigint | YES | — | |
| student_id | bigint | YES | — | |
| created_at | timestamptz | YES | now() | |
| display_name | text | YES | — | |
| avatar_url | text | YES | — | |

**Relationships**

- References: `teachers` (via `teacher_id`), `students` (via `student_id`)
- Referenced by: `questions`, `assignment_templates`, `assignment_drafts`, `published_assignments`, `role_audit_log`

**Used by:** `src/contexts/AuthContext.tsx`, `src/pages/admin/AdminAuthPage.tsx`, `src/pages/admin/AdminUsersPage.tsx`, `src/pages/shared/ProfilePage.tsx`, `src/lib/questions.ts`, `src/lib/templates.ts`, `supabase/functions/admin-user-management/index.ts`, `supabase/functions/create-teacher/index.ts`

---

### 3.22 `published_assignment_items`

| Property | Value |
|---|---|
| Purpose | Snapshot of each question as published in a published assignment. |
| RLS Enabled | Yes |
| Row Count | 4 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | identity | Yes |
| published_assignment_id | bigint | NO | — | |
| question_id | bigint | NO | — | |
| content | text | NO | — | |
| type_id | bigint | NO | — | |
| type_name | text | NO | — | |
| response_type | text | NO | 'text' | |
| image_url | text | YES | — | |
| custom_type_name | text | YES | — | |
| custom_instructions | text | YES | — | |
| category | text | YES | — | |
| category_secondary | text | YES | — | |
| tags | text[] | YES | '{}' | |
| ielts_band | text | YES | — | |
| description | text | YES | — | |
| selection_order | integer | NO | — | |
| available_from | timestamptz | YES | — | |
| due_date | timestamptz | YES | — | |
| due_after_days | integer | YES | — | |
| timed | boolean | NO | false | |
| time_limit | interval | YES | — | |

**Relationships**

- References: `published_assignments` (via `published_assignment_id`), `questions` (via `question_id`)
- Referenced by: none

**Used by:** `src/lib/templates.ts`

---

### 3.23 `published_assignments`

| Property | Value |
|---|---|
| Purpose | A published assignment visible to students in a class. |
| RLS Enabled | Yes |
| Row Count | 2 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | identity | Yes |
| draft_id | bigint | NO | — | |
| class_id | bigint | NO | — | |
| name | text | NO | — | |
| description | text | YES | — | |
| owner_id | uuid | NO | auth.uid() | |
| published_at | timestamptz | NO | now() | |

**Relationships**

- References: `assignment_drafts` (via `draft_id`), `classes` (via `class_id`)
- Referenced by: `published_assignment_items`

**Used by:** `src/lib/templates.ts`, `src/pages/student/StudentAssignmentsPage.tsx`

---

### 3.24 `publishedassignments` (legacy)

| Property | Value |
|---|---|
| Purpose | Legacy published assignment table. Superseded by `published_assignments`. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| class_id | bigint | NO | — | |
| instance_id | bigint | NO | — | |
| status | text | NO | 'Draft' | |
| published_at | timestamptz | YES | — | |
| archived_at | timestamptz | YES | — | |

**Relationships**

- References: `classes` (via `class_id`), `assignmentdrafts` (via `instance_id`)
- Referenced by: `studentassignmentitems`

**Used by:** none (no source-code references found)

---

### 3.25 `questioncategories`

| Property | Value |
|---|---|
| Purpose | Categories grouped under a question type. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| name | text | NO | — | |
| type_id | bigint | NO | — | |

**Relationships**

- References: `questiontypes` (via `type_id`)
- Referenced by: `questions`, `questionsnapshots`, `randomrules`

**Used by:** none (no source-code references found)

---

### 3.26 `questions`

| Property | Value |
|---|---|
| Purpose | The Question Bank — individual questions with type, tags, category, and ownership. |
| RLS Enabled | Yes |
| Row Count | 7 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| content | text | NO | — | |
| category_id | bigint | YES | — | |
| type_id | bigint | NO | — | |
| created_by | bigint | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |
| description | text | YES | — | |
| ielts_band | text | YES | — | |
| tags | text[] | YES | '{}' | |
| response_type | text | NO | 'text' | |
| image_url | text | YES | — | |
| owner_id | uuid | NO | auth.uid() | |
| status | text | NO | 'active' | |
| archived_at | timestamptz | YES | — | |
| custom_type_name | text | YES | — | |
| custom_instructions | text | YES | — | |
| category | text | YES | — | |
| category_secondary | text | YES | — | |

**Relationships**

- References: `questiontypes` (via `type_id`), `questioncategories` (via `category_id`), `teachers` (via `created_by`), `profiles` (via `owner_id`)
- Referenced by: `assignment_draft_questions`, `assignment_template_questions`, `assignmentdraftitems`, `assignmenttemplateitems`, `studentassignmentitems`, `published_assignment_items`

**Used by:** `src/lib/questions.ts`, `src/lib/templates.ts`, `src/pages/teacher/TeacherQuestionLibraryPage.tsx`, `src/components/questions/QuestionForm.tsx`, `src/components/questions/QuestionPreview.tsx`, `src/components/questions/SimilarQuestionsDialog.tsx`

---

### 3.27 `questionsnapshots`

| Property | Value |
|---|---|
| Purpose | Snapshot of a question at a point in time (for student assignment items). |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| question_category_id | bigint | YES | — | |
| question_type_id | bigint | YES | — | |
| rubric_id | bigint | YES | — | |
| prompt | text | YES | — | |
| instructions | text | YES | — | |
| response_type | text | YES | — | |
| image_url | text | YES | — | |
| image | text | YES | — | |
| timer | interval | YES | — | |
| version | text | YES | — | |

**Relationships**

- References: `questioncategories` (via `question_category_id`), `questiontypes` (via `question_type_id`), `rubrics` (via `rubric_id`)
- Referenced by: `studentassignmentitems`

**Used by:** none (no source-code references found)

---

### 3.28 `questiontypes`

| Property | Value |
|---|---|
| Purpose | Lookup table of question types (e.g., Writing Task 1, Speaking Part 2). |
| RLS Enabled | Yes |
| Row Count | 7 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| name | text | NO | — | |

**Relationships**

- References: none
- Referenced by: `questions`, `questioncategories`, `assignment_template_random_rules`, `questionsnapshots`, `randomrules`

**Used by:** `src/lib/questions.ts`

---

### 3.29 `randomrules` (legacy)

| Property | Value |
|---|---|
| Purpose | Legacy random question rules linked to `assignmentdrafts`. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| assignment_set_id | bigint | NO | — | |
| category_id | bigint | NO | — | |
| question_type_id | bigint | NO | — | |
| quantity | integer | NO | — | |

**Relationships**

- References: `assignmentdrafts` (via `assignment_set_id`), `questioncategories` (via `category_id`), `questiontypes` (via `question_type_id`)
- Referenced by: none

**Used by:** none (no source-code references found)

---

### 3.30 `role_audit_log`

| Property | Value |
|---|---|
| Purpose | Audit trail of role changes performed by admins. |
| RLS Enabled | Yes |
| Row Count | 1 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Yes |
| admin_id | uuid | NO | — | |
| admin_email | text | NO | — | |
| target_id | uuid | NO | — | |
| target_email | text | NO | — | |
| previous_role | text | NO | — | |
| new_role | text | NO | — | |
| created_at | timestamptz | NO | now() | |

**Relationships**

- References: none (stores UUIDs and emails directly, no FK constraints)
- Referenced by: none

**Used by:** `src/pages/admin/AdminUsersPage.tsx`, `supabase/functions/admin-user-management/index.ts`

---

### 3.31 `rubriccriteria`

| Property | Value |
|---|---|
| Purpose | Individual criteria within a rubric. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| rubric_id | bigint | NO | — | |
| name | text | NO | — | |

**Relationships**

- References: `rubrics` (via `rubric_id`)
- Referenced by: `criterionscores`

**Used by:** none (no source-code references found)

---

### 3.32 `rubrics`

| Property | Value |
|---|---|
| Purpose | Grading rubric definition. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| name | text | NO | — | |

**Relationships**

- References: none
- Referenced by: `rubriccriteria`, `questionsnapshots`

**Used by:** none (no source-code references found)

---

### 3.33 `studentassignmentitems`

| Property | Value |
|---|---|
| Purpose | Individual question assigned to a student within a published assignment (legacy). |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| assignment_id | bigint | NO | — | |
| question_id | bigint | NO | — | |
| student_id | bigint | NO | — | |
| snapshot_id | bigint | YES | — | |
| status | text | NO | 'not started' | |
| start_time | timestamptz | YES | — | |
| end_time | timestamptz | YES | — | |
| due_at | timestamptz | YES | — | |
| available_from | timestamptz | YES | — | |
| time_limit | interval | YES | — | |

**Relationships**

- References: `publishedassignments` (via `assignment_id`), `questions` (via `question_id`), `students` (via `student_id`), `questionsnapshots` (via `snapshot_id`)
- Referenced by: `studentsubmissions`

**Used by:** none (no source-code references found)

---

### 3.34 `studentclasses`

| Property | Value |
|---|---|
| Purpose | Legacy student-class enrollment. Superseded by `classstudents`. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| student_id | bigint | NO | — | |
| class_id | bigint | NO | — | |

**Relationships**

- References: `students` (via `student_id`), `classes` (via `class_id`)
- Referenced by: none

**Used by:** none (no source-code references found)

---

### 3.35 `students`

| Property | Value |
|---|---|
| Purpose | Student entity linked 1:1 with a profile. |
| RLS Enabled | Yes |
| Row Count | 2 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| name | text | NO | — | |

**Relationships**

- References: none
- Referenced by: `classstudents`, `studentclasses`, `studentassignmentitems`, `studentsubmissions`, `profiles`

**Used by:** `src/pages/admin/AdminDashboard.tsx`

---

### 3.36 `studentsubmissions`

| Property | Value |
|---|---|
| Purpose | A student's submission for an assignment item. |
| RLS Enabled | No |
| Row Count | 0 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| assignment_item_id | bigint | NO | — | |
| student_id | bigint | NO | — | |
| content | text | YES | — | |
| file_path | text | YES | — | |
| file_type | text | NO | — | |
| status | text | NO | 'submitted' | |
| submitted_at | timestamptz | YES | now() | |

**Relationships**

- References: `studentassignmentitems` (via `assignment_item_id`), `students` (via `student_id`)
- Referenced by: `inlineannotations`, `grading`

**Used by:** none (no source-code references found)

---

### 3.37 `teacherclasses`

| Property | Value |
|---|---|
| Purpose | Associates a teacher with a class (ownership/teaching). |
| RLS Enabled | Yes |
| Row Count | 2 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| teacher_id | bigint | NO | — | |
| class_id | bigint | NO | — | |

**Relationships**

- References: `teachers` (via `teacher_id`), `classes` (via `class_id`)
- Referenced by: none

**Used by:** `src/pages/teacher/TeacherClassesPage.tsx`, `src/pages/teacher/TeacherDashboard.tsx`

---

### 3.38 `teachers`

| Property | Value |
|---|---|
| Purpose | Teacher entity linked 1:1 with a profile. |
| RLS Enabled | Yes |
| Row Count | 3 |

**Columns**

| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| id | bigint | NO | nextval(...) | Yes |
| name | text | NO | — | |

**Relationships**

- References: none
- Referenced by: `teacherclasses`, `courses`, `questions`, `grading`, `profiles`

**Used by:** `src/pages/admin/AdminDashboard.tsx`, `src/pages/admin/AdminTeachersPage.tsx`, `supabase/functions/create-teacher/index.ts`

---

## 4. RPC Functions

### 4.1 `can_current_user_access`

| Property | Value |
|---|---|
| Purpose | Global RLS helper — returns true if the current user is not banned and can access the system. Used in nearly all RLS policy `USING`/`WITH CHECK` clauses. |
| Parameters | none |
| Return | `boolean` |
| Callers | Invoked by RLS policies on: `assignment_draft_questions`, `assignment_drafts`, `assignment_template_questions`, `assignment_template_random_rules`, `assignment_templates`, `classes`, `classstudents`, `profiles`, `questions`, `questiontypes`, `role_audit_log`, `students`, `teacherclasses`, `teachers` |

---

### 4.2 `change_user_role`

| Property | Value |
|---|---|
| Purpose | Changes a user's role (admin-only). Logs the change to `role_audit_log`. |
| Parameters | `p_target_id uuid`, `p_new_role text` |
| Return | `void` |
| Callers | `supabase/functions/admin-user-management/index.ts` |

---

### 4.3 `check_duplicate_template`

| Property | Value |
|---|---|
| Purpose | Checks whether a template with the exact same set of question IDs already exists. |
| Parameters | `p_question_ids bigint[]` |
| Return | `TABLE(id bigint, name text)` |
| Callers | `src/lib/templates.ts` |

---

### 4.4 `get_my_role`

| Property | Value |
|---|---|
| Purpose | Returns the role of the current authenticated user from `profiles`. |
| Parameters | none |
| Return | `text` |
| Callers | Invoked by RLS policies on: `assignment_draft_questions`, `assignment_drafts`, `assignment_template_questions`, `assignment_template_random_rules`, `assignment_templates`, `classes`, `classstudents`, `published_assignment_items`, `published_assignments`, `questions`, `role_audit_log`, `students`, `teacherclasses`, `teachers` |

---

### 4.5 `publish_draft`

| Property | Value |
|---|---|
| Purpose | Publishes an assignment draft: creates a `published_assignments` row and snapshots each draft question into `published_assignment_items`. Returns the new published assignment ID. |
| Parameters | `p_draft_id bigint` |
| Return | `bigint` |
| Callers | `src/lib/templates.ts` |

---

### 4.6 `register_student`

| Property | Value |
|---|---|
| Purpose | Creates a `students` row and a `profiles` row for a newly registered student. |
| Parameters | `p_user_id uuid`, `p_name text` |
| Return | `void` |
| Callers | `supabase/functions/register-student/index.ts` |

---

### 4.7 `resolve_random_rule`

| Property | Value |
|---|---|
| Purpose | Resolves a random question selection rule into a concrete question ID, respecting type/category/tags and excluding already-used questions. |
| Parameters | `p_question_type_id bigint`, `p_response_type text`, `p_category text`, `p_tags text[]`, `p_used_question_ids bigint[]`, `p_class_id bigint` |
| Return | `bigint` (question ID) |
| Callers | `src/lib/templates.ts` |

---

### 4.8 `resolve_template_to_draft`

| Property | Value |
|---|---|
| Purpose | Resolves an assignment template into a draft: creates an `assignment_drafts` row, copies template questions into `assignment_draft_questions`, and resolves random rules. Returns JSON with draft ID and resolved question IDs. |
| Parameters | `p_template_id bigint`, `p_class_id bigint`, `p_draft_name text`, `p_draft_description text` |
| Return | `json` |
| Callers | `src/lib/templates.ts` |

---

### 4.9 `search_similar_questions`

| Property | Value |
|---|---|
| Purpose | Searches for questions similar to a given prompt using trigram similarity. Returns matching questions with a similarity score. |
| Parameters | `p_prompt text`, `p_threshold real DEFAULT 0.3`, `p_exclude_id bigint DEFAULT NULL` |
| Return | `TABLE(id bigint, content text, type_name text, category text, response_type text, owner_display_name text, sim real)` |
| Callers | `src/lib/questions.ts`, `src/components/questions/SimilarQuestionsDialog.tsx` |

---

### 4.10 `unpublish_draft`

| Property | Value |
|---|---|
| Purpose | Unpublishes a published assignment: deletes its `published_assignment_items` and `published_assignments` rows. Returns the original draft ID. |
| Parameters | `p_published_id bigint` |
| Return | `bigint` |
| Callers | `src/lib/templates.ts` |

---

### 4.11 `update_own_profile`

| Property | Value |
|---|---|
| Purpose | Updates the current user's display name and avatar URL. |
| Parameters | `p_display_name text`, `p_avatar_url text` |
| Return | `void` |
| Callers | `src/pages/shared/ProfilePage.tsx` |

---

### Trigger functions (not called directly by app code)

| Function | Purpose |
|---|---|
| `assignment_drafts_set_updated_at` | Trigger function — sets `updated_at` to `now()` on UPDATE. |
| `assignment_templates_set_updated_at` | Trigger function — sets `updated_at` to `now()` on UPDATE. |
| `questions_set_updated_at` | Trigger function — sets `updated_at` to `now()` on UPDATE. |

### Extension support functions (pg_trgm)

The following functions are provided by the `pg_trgm` extension and are not
application-defined. They are listed here for completeness:

`gin_extract_query_trgm`, `gin_extract_value_trgm`, `gin_trgm_consistent`,
`gin_trgm_triconsistent`, `gtrgm_compress`, `gtrgm_consistent`,
`gtrgm_decompress`, `gtrgm_distance`, `gtrgm_in`, `gtrgm_options`,
`gtrgm_out`, `gtrgm_penalty`, `gtrgm_picksplit`, `gtrgm_same`, `gtrgm_union`,
`set_limit`, `show_limit`, `show_trgm`, `similarity`, `similarity_dist`,
`similarity_op`, `strict_word_similarity`,
`strict_word_similarity_commutator_op`, `strict_word_similarity_dist_commutator_op`,
`strict_word_similarity_dist_op`, `strict_word_similarity_op`,
`word_similarity`, `word_similarity_commutator_op`,
`word_similarity_dist_commutator_op`, `word_similarity_dist_op`,
`word_similarity_op`

---

## 5. Views

There are no views in the `public` schema.

---

## 6. Triggers

| Table | Event | Trigger Name | Function Called | Purpose |
|---|---|---|---|---|
| `assignment_drafts` | UPDATE | `assignment_drafts_set_updated_at` | `assignment_drafts_set_updated_at()` | Auto-updates `updated_at` column on row update. |
| `assignment_templates` | UPDATE | `assignment_templates_set_updated_at` | `assignment_templates_set_updated_at()` | Auto-updates `updated_at` column on row update. |
| `questions` | UPDATE | `questions_set_updated_at` | `questions_set_updated_at()` | Auto-updates `updated_at` column on row update. |

---

## 7. RLS Policies

### 7.1 `assignment_draft_questions`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_adq` | authenticated | `can_current_user_access()` |
| INSERT | `insert_adq` | authenticated | WITH CHECK: draft owner is current user OR admin, AND `can_current_user_access()` |
| UPDATE | `update_adq` | authenticated | USING + WITH CHECK: draft owner is current user OR admin, AND `can_current_user_access()` |
| DELETE | `delete_adq` | authenticated | USING: draft owner is current user OR admin, AND `can_current_user_access()` |

### 7.2 `assignment_drafts`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_assignment_drafts` | authenticated | `can_current_user_access()` |
| INSERT | `insert_assignment_drafts` | authenticated | WITH CHECK: role is teacher or admin, owner is current user, AND `can_current_user_access()` |
| UPDATE | `update_assignment_drafts` | authenticated | USING + WITH CHECK: owner is current user OR admin, AND `can_current_user_access()` |
| DELETE | `delete_assignment_drafts` | authenticated | USING: owner is current user OR admin, AND `can_current_user_access()` |

### 7.3 `assignment_template_favorites`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_own_favorites` | authenticated | `auth.uid() = user_id` |
| INSERT | `insert_own_favorites` | authenticated | WITH CHECK: `auth.uid() = user_id` |
| UPDATE | `update_own_favorites` | authenticated | USING + WITH CHECK: `auth.uid() = user_id` |
| DELETE | `delete_own_favorites` | authenticated | USING: `auth.uid() = user_id` |

### 7.4 `assignment_template_questions`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_atq` | authenticated | `can_current_user_access()` |
| INSERT | `insert_atq` | authenticated | WITH CHECK: template owner is current user OR admin, AND `can_current_user_access()` |
| UPDATE | `update_atq` | authenticated | USING + WITH CHECK: template owner is current user OR admin, AND `can_current_user_access()` |
| DELETE | `delete_atq` | authenticated | USING: template owner is current user OR admin, AND `can_current_user_access()` |

### 7.5 `assignment_template_random_rules`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_atrr` | authenticated | `can_current_user_access()` |
| INSERT | `insert_atrr` | authenticated | WITH CHECK: template owner is current user OR admin, AND `can_current_user_access()` |
| UPDATE | `update_atrr` | authenticated | USING + WITH CHECK: template owner is current user OR admin, AND `can_current_user_access()` |
| DELETE | `delete_atrr` | authenticated | USING: template owner is current user OR admin, AND `can_current_user_access()` |

### 7.6 `assignment_templates`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_assignment_templates` | authenticated | `can_current_user_access()` |
| INSERT | `insert_assignment_templates` | authenticated | WITH CHECK: role is teacher or admin, owner is current user, AND `can_current_user_access()` |
| UPDATE | `update_assignment_templates` | authenticated | USING + WITH CHECK: owner is current user OR admin, AND `can_current_user_access()` |
| DELETE | `delete_assignment_templates` | authenticated | USING: admin only, AND `can_current_user_access()` |

### 7.7 `classes`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_classes` | authenticated | `can_current_user_access()` |
| INSERT | `insert_classes` | authenticated | WITH CHECK: role is teacher or admin, AND `can_current_user_access()` |
| UPDATE | `update_classes` | authenticated | USING + WITH CHECK: admin OR (teacher who owns the class via `teacherclasses`), AND `can_current_user_access()` |
| DELETE | — | — | No delete policy (deletes are denied by default) |

### 7.8 `classstudents`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_classstudents` | authenticated | student is current user OR role is admin/teacher, AND `can_current_user_access()` |
| INSERT | `insert_classstudents` | authenticated | WITH CHECK: student is current user OR role is admin/teacher, AND `can_current_user_access()` |
| UPDATE | — | — | No update policy |
| DELETE | `delete_classstudents` | authenticated | USING: student is current user OR role is admin/teacher, AND `can_current_user_access()` |

### 7.9 `profiles`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_own_profile` | authenticated | `auth.uid() = id` OR admin, AND `can_current_user_access()` |
| INSERT | `insert_student_profile` | authenticated | WITH CHECK: `auth.uid() = id`, role is 'student', AND `can_current_user_access()` |
| UPDATE | `update_own_profile` | authenticated | USING + WITH CHECK: `auth.uid() = id`, AND `can_current_user_access()` |
| DELETE | — | — | No delete policy |

### 7.10 `published_assignment_items`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_published_items` | authenticated | published assignment owner is current user OR admin OR student is enrolled in the assignment's class |
| INSERT | `insert_published_items` | authenticated | WITH CHECK: published assignment owner is current user |
| UPDATE | `update_published_items` | authenticated | USING + WITH CHECK: published assignment owner is current user |
| DELETE | `delete_published_items` | authenticated | USING: published assignment owner is current user |

### 7.11 `published_assignments`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_published` | authenticated | owner is current user OR admin OR student is enrolled in the class |
| INSERT | `insert_published` | authenticated | WITH CHECK: `owner_id = auth.uid()` |
| UPDATE | `update_published` | authenticated | USING + WITH CHECK: `owner_id = auth.uid()` |
| DELETE | `delete_published` | authenticated | USING: `owner_id = auth.uid()` |

### 7.12 `questions`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_questions` | authenticated | `can_current_user_access()` |
| INSERT | `insert_questions` | authenticated | WITH CHECK: role is teacher or admin, owner is current user, AND `can_current_user_access()` |
| UPDATE | `update_questions` | authenticated | USING + WITH CHECK: owner is current user OR admin, AND `can_current_user_access()` |
| DELETE | `delete_questions` | authenticated | USING: owner is current user OR admin, AND `can_current_user_access()` |

### 7.13 `questiontypes`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_questiontypes` | authenticated | `can_current_user_access()` |
| INSERT | — | — | No insert policy |
| UPDATE | — | — | No update policy |
| DELETE | — | — | No delete policy |

### 7.14 `role_audit_log`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_audit_log` | authenticated | admin only, AND `can_current_user_access()` |
| INSERT | — | — | No insert policy (inserts happen via `change_user_role` RPC with SECURITY DEFINER) |
| UPDATE | — | — | No update policy |
| DELETE | — | — | No delete policy |

### 7.15 `students`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_students` | authenticated | student is current user OR role is admin/teacher, AND `can_current_user_access()` |
| INSERT | — | — | No insert policy (inserts happen via `register_student` RPC) |
| UPDATE | `update_own_student` | authenticated | USING + WITH CHECK: student is current user OR admin, AND `can_current_user_access()` |
| DELETE | — | — | No delete policy |

### 7.16 `teacherclasses`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_teacherclasses` | authenticated | teacher is current user OR admin, AND `can_current_user_access()` |
| INSERT | `insert_teacherclasses` | authenticated | WITH CHECK: admin OR (teacher and teacher_id matches current user's profile), AND `can_current_user_access()` |
| UPDATE | — | — | No update policy |
| DELETE | `delete_teacherclasses` | authenticated | USING: admin OR (teacher and teacher_id matches current user's profile), AND `can_current_user_access()` |

### 7.17 `teachers`

| Command | Policy | Who | Condition |
|---|---|---|---|
| SELECT | `select_teachers` | authenticated | teacher is current user OR role is admin/teacher, AND `can_current_user_access()` |
| INSERT | — | — | No insert policy (inserts happen via `create-teacher` edge function) |
| UPDATE | `update_own_teacher` | authenticated | USING + WITH CHECK: teacher is current user OR admin, AND `can_current_user_access()` |
| DELETE | — | — | No delete policy |

### Tables without RLS

The following tables have RLS disabled. All access is governed by Postgres
grants only (anon and authenticated roles have full CRUD on most):

`assignmentdraftitems`, `assignmentdrafts`, `assignmenttemplateitems`,
`assignmenttemplates`, `classcourseapplications`, `courses`,
`coursesessions`, `criterionscores`, `generalfeedback`, `generatedschedules`,
`grading`, `inlineannotations`, `publishedassignments`, `questioncategories`,
`questionsnapshots`, `randomrules`, `rubriccriteria`, `rubrics`,
`studentassignmentitems`, `studentclasses`, `studentsubmissions`

---

## 8. Storage Buckets

### 8.1 `avatars`

| Property | Value |
|---|---|
| Bucket ID | `avatars` |
| Public | Yes |
| File size limit | None |
| Allowed MIME types | None |
| Purpose | Stores user profile avatar images. |
| Upload sources | `src/pages/shared/ProfilePage.tsx` (user uploads avatar from profile page) |
| Consumers | `src/pages/shared/ProfilePage.tsx` (displays avatar), `src/components/layout/Sidebar.tsx` (sidebar avatar), `src/contexts/AuthContext.tsx` (loads avatar URL into auth context) |

### 8.2 `question-images`

| Property | Value |
|---|---|
| Bucket ID | `question-images` |
| Public | Yes |
| File size limit | None |
| Allowed MIME types | None |
| Purpose | Stores images attached to questions in the Question Bank. |
| Upload sources | `src/components/questions/QuestionForm.tsx` (teacher uploads image when creating/editing a question) |
| Consumers | `src/components/questions/QuestionPreview.tsx` (renders question image), `src/pages/teacher/TeacherQuestionLibraryPage.tsx` (displays image in question list) |

---

## 9. Enums

There are no application-defined enums in the `public` schema. The database
uses `text` columns with default values for status/role fields (e.g.,
`status text DEFAULT 'draft'`, `role text`, `grading_status text DEFAULT
'pending'`).

The following enums exist but are platform-level (Supabase/auth internals):

| Enum | Values |
|---|---|
| `aal_level` | aal1, aal2, aal3 |
| `action` | INSERT, UPDATE, DELETE, TRUNCATE, ERROR |
| `buckettype` | STANDARD, ANALYTICS, VECTOR |
| `code_challenge_method` | s256, plain |
| `equality_op` | eq, neq, lt, lte, gt, gte, in, like, ilike, is, match, imatch, isdistinct |
| `factor_status` | unverified, verified |
| `factor_type` | totp, webauthn, phone |
| `oauth_authorization_status` | pending, approved, denied, expired |
| `oauth_client_type` | public, confidential |
| `oauth_registration_type` | dynamic, manual |
| `oauth_response_type` | code |
| `one_time_token_type` | confirmation_token, reauthentication_token, recovery_token, email_change_token_new, email_change_token_current, phone_change_token |

---

## 10. Indexes

| Table | Index | Type | Purpose |
|---|---|---|---|
| assignment_draft_questions | `assignment_draft_questions_pkey` | unique btree (id) | Primary key. |
| assignment_draft_questions | `assignment_draft_questions_draft_id_question_id_key` | unique btree (draft_id, question_id) | Prevents duplicate questions in the same draft. |
| assignment_draft_questions | `idx_adq_draft_id` | btree (draft_id) | Fast lookup of all questions in a draft. |
| assignment_draft_questions | `idx_adq_question_id` | btree (question_id) | Reverse lookup: which drafts use a given question. |
| assignment_drafts | `assignment_drafts_pkey` | unique btree (id) | Primary key. |
| assignment_drafts | `idx_assignment_drafts_class_id` | btree (class_id) | Filter drafts by class. |
| assignment_drafts | `idx_assignment_drafts_owner_id` | btree (owner_id) | Filter drafts by owner. |
| assignment_drafts | `idx_assignment_drafts_template_id` | btree (template_id) | Find drafts created from a template. |
| assignment_template_favorites | `assignment_template_favorites_pkey` | unique btree (id) | Primary key. |
| assignment_template_favorites | `uniq_template_user_favorite` | unique btree (template_id, user_id) | Prevents a user from favoriting the same template twice. |
| assignment_template_favorites | `idx_favorites_user` | btree (user_id) | Look up a user's favorites. |
| assignment_template_questions | `assignment_template_questions_pkey` | unique btree (id) | Primary key. |
| assignment_template_questions | `assignment_template_questions_template_id_question_id_key` | unique btree (template_id, question_id) | Prevents duplicate questions in the same template. |
| assignment_template_questions | `idx_atq_template_id` | btree (template_id) | Fast lookup of questions in a template. |
| assignment_template_questions | `idx_atq_question_id` | btree (question_id) | Reverse lookup. |
| assignment_template_random_rules | `assignment_template_random_rules_pkey` | unique btree (id) | Primary key. |
| assignment_template_random_rules | `idx_atrr_template_id` | btree (template_id) | Find rules for a template. |
| assignment_templates | `assignment_templates_pkey` | unique btree (id) | Primary key. |
| assignment_templates | `idx_assignment_templates_owner_id` | btree (owner_id) | Filter templates by owner. |
| assignment_templates | `idx_assignment_templates_status` | btree (status) | Filter templates by status (active/archived). |
| assignmentdraftitems | `assignmentdraftitems_pkey` | unique btree (id) | Primary key (legacy). |
| assignmentdrafts | `assignmentdrafts_pkey` | unique btree (id) | Primary key (legacy). |
| assignmenttemplateitems | `assignmenttemplateitems_pkey` | unique btree (id) | Primary key (legacy). |
| assignmenttemplates | `assignmenttemplates_pkey` | unique btree (id) | Primary key (legacy). |
| classcourseapplications | `classcourseapplications_pkey` | unique btree (id) | Primary key. |
| classes | `classes_pkey` | unique btree (id) | Primary key. |
| classstudents | `classstudents_pkey` | unique btree (id) | Primary key. |
| classstudents | `classstudents_student_id_class_id_key` | unique btree (student_id, class_id) | Prevents duplicate enrollment. |
| classstudents | `idx_classstudents_class_id` | btree (class_id) | Find all students in a class. |
| classstudents | `idx_classstudents_student_id` | btree (student_id) | Find all classes for a student. |
| courses | `courses_pkey` | unique btree (id) | Primary key. |
| coursesessions | `coursesessions_pkey` | unique btree (id) | Primary key. |
| criterionscores | `criterionscores_pkey` | unique btree (id) | Primary key. |
| generalfeedback | `generalfeedback_pkey` | unique btree (id) | Primary key. |
| generatedschedules | `generatedschedules_pkey` | unique btree (id) | Primary key. |
| grading | `grading_pkey` | unique btree (id) | Primary key. |
| inlineannotations | `inlineannotations_pkey` | unique btree (id) | Primary key. |
| profiles | `profiles_pkey` | unique btree (id) | Primary key. |
| published_assignment_items | `published_assignment_items_pkey` | unique btree (id) | Primary key. |
| published_assignment_items | `published_assignment_items_pub_id_idx` | btree (published_assignment_id) | Find all items in a published assignment. |
| published_assignments | `published_assignments_pkey` | unique btree (id) | Primary key. |
| published_assignments | `published_assignments_draft_id_unique` | unique btree (draft_id) | Ensures one draft is published at most once. |
| published_assignments | `published_assignments_class_id_idx` | btree (class_id) | Filter published assignments by class. |
| publishedassignments | `publishedassignments_pkey` | unique btree (id) | Primary key (legacy). |
| publishedassignments | `idx_publishedassignments_class_id` | btree (class_id) | Filter by class (legacy). |
| questioncategories | `questioncategories_pkey` | unique btree (id) | Primary key. |
| questions | `questions_pkey` | unique btree (id) | Primary key. |
| questions | `idx_questions_type_id` | btree (type_id) | Filter questions by type. |
| questions | `idx_questions_category_id` | btree (category_id) | Filter questions by category. |
| questions | `idx_questions_category` | btree (category) | Filter by free-text category field. |
| questions | `idx_questions_owner_id` | btree (owner_id) | Filter questions by owner. |
| questions | `idx_questions_created_by` | btree (created_by) | Filter by legacy created_by teacher. |
| questions | `idx_questions_response_type` | btree (response_type) | Filter by response type. |
| questions | `idx_questions_status` | btree (status) | Filter by status (active/archived). |
| questions | `idx_questions_content_trgm` | GIN (content gin_trgm_ops) | Trigram index for fuzzy/similarity search on question content. |
| questions | `idx_questions_tags` | GIN (tags) | Array containment queries on tags. |
| questionsnapshots | `questionsnapshots_pkey` | unique btree (id) | Primary key. |
| questiontypes | `questiontypes_pkey` | unique btree (id) | Primary key. |
| questiontypes | `questiontypes_name_key` | unique btree (name) | Ensures question type names are unique. |
| randomrules | `randomrules_pkey` | unique btree (id) | Primary key (legacy). |
| role_audit_log | `role_audit_log_pkey` | unique btree (id) | Primary key. |
| rubriccriteria | `rubriccriteria_pkey` | unique btree (id) | Primary key. |
| rubrics | `rubrics_pkey` | unique btree (id) | Primary key. |
| studentassignmentitems | `studentassignmentitems_pkey` | unique btree (id) | Primary key. |
| studentclasses | `studentclasses_pkey` | unique btree (id) | Primary key (legacy). |
| students | `students_pkey` | unique btree (id) | Primary key. |
| studentsubmissions | `studentsubmissions_pkey` | unique btree (id) | Primary key. |
| teacherclasses | `teacherclasses_pkey` | unique btree (id) | Primary key. |
| teacherclasses | `teacherclasses_teacher_id_class_id_key` | unique btree (teacher_id, class_id) | Prevents duplicate teacher-class assignments. |
| teacherclasses | `idx_teacherclasses_teacher_id` | btree (teacher_id) | Find classes for a teacher. |
| teacherclasses | `idx_teacherclasses_class_id` | btree (class_id) | Find teachers for a class. |
| teachers | `teachers_pkey` | unique btree (id) | Primary key. |

---

## 11. Current Naming Convention

### Table naming

| Convention | Examples |
|---|---|
| Active tables use `snake_case` with underscores | `assignment_drafts`, `assignment_templates`, `published_assignments`, `question_types` (written as `questiontypes`) |
| Some active tables omit underscores (compound words) | `questiontypes`, `classstudents`, `teacherclasses`, `questioncategories`, `questionsnapshots`, `studentclasses` |
| Legacy tables use no underscores (all lowercase concatenated) | `assignmentdrafts`, `assignmentdraftitems`, `assignmenttemplates`, `assignmenttemplateitems`, `publishedassignments` |
| Join tables use the two entity names concatenated | `teacherclasses`, `classstudents`, `studentclasses` |

### Column naming

| Convention | Examples |
|---|---|
| All columns use `snake_case` | `created_at`, `owner_id`, `question_id`, `published_at` |
| Foreign key columns use `_id` suffix | `teacher_id`, `student_id`, `class_id`, `template_id`, `draft_id`, `type_id`, `category_id` |
| Timestamp columns use `_at` suffix | `created_at`, `updated_at`, `published_at`, `archived_at`, `submitted_at` |
| Status columns are `text` (not enum) | `status`, `grading_status`, `response_type` |
| Boolean columns use `is`/`timed` style | `timed` |

### RPC naming

| Convention | Examples |
|---|---|
| All RPCs use `snake_case` | `publish_draft`, `resolve_template_to_draft`, `search_similar_questions` |
| Action RPCs use verb_noun pattern | `publish_draft`, `unpublish_draft`, `register_student`, `update_own_profile`, `change_user_role` |
| Query RPCs use descriptive verb pattern | `search_similar_questions`, `check_duplicate_template`, `resolve_random_rule` |
| Helper RPCs use noun/descriptive pattern | `get_my_role`, `can_current_user_access` |
| All parameters use `p_` prefix | `p_draft_id`, `p_template_id`, `p_question_ids`, `p_new_role` |

---

## 12. Dependencies (Page → Component → Table → RPC)

```
LoginPage
└── AuthContext
    └── profiles
        └── (none)

RegisterPage
└── AuthContext
    └── profiles
        └── register_student() [via register-student edge function]

AdminAuthPage
└── profiles

AdminDashboard
└── teachers, students, classes (count queries)

AdminTeachersPage
└── teachers
    └── create-teacher [edge function]

AdminUsersPage
└── profiles
    ├── role_audit_log
    └── change_user_role() [via admin-user-management edge function]

ProfilePage
└── profiles
    └── update_own_profile()

TeacherDashboard
└── teacherclasses → classes → classstudents

TeacherClassesPage
└── classes
    ├── teacherclasses
    └── classstudents

TeacherQuestionLibraryPage
└── questions
    ├── questiontypes
    └── search_similar_questions()

TeacherAssignmentTemplatesPage
└── assignment_templates
    ├── assignment_template_questions → questions
    ├── assignment_template_random_rules
    ├── assignment_template_favorites
    └── check_duplicate_template()

TeacherAssignmentsPage
└── assignment_drafts
    ├── assignment_draft_questions → questions
    ├── classes
    ├── resolve_template_to_draft()
    ├── resolve_random_rule()
    ├── publish_draft()
    └── unpublish_draft()

StudentDashboard
└── classstudents → classes

StudentClassesPage
└── classstudents → classes

StudentAssignmentsPage
└── published_assignments
    └── published_assignment_items

JoinClassModal
└── classes
    └── classstudents

QuestionForm
└── questions
    └── question-images (storage bucket)

QuestionPreview
└── questions

SimilarQuestionsDialog
└── search_similar_questions()

PresetBrowser
└── assignment_templates
    ├── assignment_template_questions
    ├── assignment_template_favorites
    └── assignment_template_random_rules

TemplateForm
└── assignment_templates
    └── assignment_template_questions

TemplatePreview
└── assignment_templates
    └── assignment_template_questions

DuplicateTemplateDialog
└── check_duplicate_template()
```

---

## 13. Known Legacy Structures

The database contains a set of legacy tables that appear to be from an earlier
schema version. They have RLS disabled, zero rows, and no references in the
application source code. They are documented here for reference only.

| Legacy Table | Active Replacement | Notes |
|---|---|---|
| `assignmentdrafts` | `assignment_drafts` | Legacy draft table. Has `original_set_id` FK to `assignmenttemplates`. No source-code usage. |
| `assignmentdraftitems` | `assignment_draft_questions` | Legacy draft-question link. References `assignmentdrafts`. No source-code usage. |
| `assignmenttemplates` | `assignment_templates` | Legacy template table. Only has `id` and `name`. No source-code usage. |
| `assignmenttemplateitems` | `assignment_template_questions` | Legacy template-question link. References `assignmenttemplates`. No source-code usage. |
| `publishedassignments` | `published_assignments` | Legacy published assignment table. References `assignmentdrafts`. Referenced by `studentassignmentitems`. No source-code usage. |
| `studentclasses` | `classstudents` | Legacy student-class enrollment. Same structure as `classstudents` but with `NOT NULL` on FKs. No source-code usage. |
| `randomrules` | `assignment_template_random_rules` | Legacy random rule table. References `assignmentdrafts`. No source-code usage. |

### Additional legacy/unused structures

| Structure | Notes |
|---|---|
| `questions.created_by` | References `teachers.id`. The active system uses `owner_id` (references `profiles.id`) for ownership. `created_by` is indexed but not used in application code. |
| `questions.category_id` | References `questioncategories.id`. The active system uses the free-text `category` and `category_secondary` columns instead. The `questioncategories` table has zero rows. |
| `questioncategories` | Lookup table for categories. Zero rows. Referenced by `questions.category_id`, `questionsnapshots`, `randomrules`. Not used in application code. |
| `questionsnapshots` | Question snapshot table. Zero rows. Referenced by `studentassignmentitems.snapshot_id`. Not used in application code. |
| `rubrics` / `rubriccriteria` | Grading rubric tables. Zero rows. Not used in application code. |
| `criterionscores` | Rubric criterion scores. Zero rows. Not used in application code. |
| `generalfeedback` | General feedback for grading. Zero rows. Not used in application code. |
| `inlineannotations` | Inline annotations for submissions. Zero rows. Not used in application code. |
| `studentsubmissions` | Student submissions. Zero rows. Not used in application code. |
| `studentassignmentitems` | Student assignment items (legacy). Zero rows. References `publishedassignments`. Not used in application code. |
| `courses` / `coursesessions` / `classcourseapplications` / `generatedschedules` | Course scheduling tables. All zero rows. `TeacherCoursesPage` exists but no direct table queries were found in source. |

---

## 14. Appendix

### A. Alphabetical Table List

| # | Table | RLS | Rows |
|---|---|---|---|
| 1 | assignment_draft_questions | Yes | 4 |
| 2 | assignment_drafts | Yes | 2 |
| 3 | assignment_template_favorites | Yes | 0 |
| 4 | assignment_template_questions | Yes | 7 |
| 5 | assignment_template_random_rules | Yes | 1 |
| 6 | assignment_templates | Yes | 4 |
| 7 | assignmentdraftitems | No | 0 |
| 8 | assignmentdrafts | No | 0 |
| 9 | assignmenttemplateitems | No | 0 |
| 10 | assignmenttemplates | No | 0 |
| 11 | classcourseapplications | No | 0 |
| 12 | classes | Yes | 2 |
| 13 | classstudents | Yes | 2 |
| 14 | courses | No | 0 |
| 15 | coursesessions | No | 0 |
| 16 | criterionscores | No | 0 |
| 17 | generalfeedback | No | 0 |
| 18 | generatedschedules | No | 0 |
| 19 | grading | No | 0 |
| 20 | inlineannotations | No | 0 |
| 21 | profiles | Yes | 6 |
| 22 | published_assignment_items | Yes | 4 |
| 23 | published_assignments | Yes | 2 |
| 24 | publishedassignments | No | 0 |
| 25 | questioncategories | No | 0 |
| 26 | questions | Yes | 7 |
| 27 | questionsnapshots | No | 0 |
| 28 | questiontypes | Yes | 7 |
| 29 | randomrules | No | 0 |
| 30 | role_audit_log | Yes | 1 |
| 31 | rubriccriteria | No | 0 |
| 32 | rubrics | No | 0 |
| 33 | studentassignmentitems | No | 0 |
| 34 | studentclasses | No | 0 |
| 35 | students | Yes | 2 |
| 36 | studentsubmissions | No | 0 |
| 37 | teacherclasses | Yes | 2 |
| 38 | teachers | Yes | 3 |

### B. Alphabetical RPC List

| # | RPC | Return |
|---|---|---|
| 1 | can_current_user_access | boolean |
| 2 | change_user_role | void |
| 3 | check_duplicate_template | TABLE(id, name) |
| 4 | get_my_role | text |
| 5 | publish_draft | bigint |
| 6 | register_student | void |
| 7 | resolve_random_rule | bigint |
| 8 | resolve_template_to_draft | json |
| 9 | search_similar_questions | TABLE(...) |
| 10 | unpublish_draft | bigint |
| 11 | update_own_profile | void |

### C. Views

None.

### D. Triggers

| # | Table | Trigger | Function |
|---|---|---|---|
| 1 | assignment_drafts | assignment_drafts_set_updated_at | assignment_drafts_set_updated_at() |
| 2 | assignment_templates | assignment_templates_set_updated_at | assignment_templates_set_updated_at() |
| 3 | questions | questions_set_updated_at | questions_set_updated_at() |
