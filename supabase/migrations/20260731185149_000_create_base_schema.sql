/*
# 000 — Base schema for Class Assignment Management

## Summary
Creates all core business tables for the Class Assignment Management system
based on the finalized database schema documentation. This migration establishes
the table structure and foreign key relationships that the subsequent migrations
(001, 002, 003) build upon for authentication and row-level security.

## New Tables (28 total)
### People
- `teachers` — Teacher records (id, name)
- `students` — Student records (id, name)

### Classes & Enrollment
- `classes` — Class records (id, name, class_code)
- `teacherclasses` — Links teachers to classes (many-to-many)
- `studentclasses` — Legacy student-class link (not canonical; classstudents is canonical)
- `classstudents` — Canonical student enrollment in classes

### Questions
- `questiontypes` — Types of questions (id, name)
- `questioncategories` — Categories of questions (id, name, type_id)
- `questions` — Question bank entries (id, content, category_id, type_id, created_by, timestamps)

### Assignments
- `assignmenttemplates` — Reusable assignment templates (id, name)
- `assignmenttemplateitems` — Questions within a template (set_id, question_id)
- `assignmentdrafts` — Draft assignments derived from templates (id, name, original_set_id)
- `assignmentdraftitems` — Questions within a draft (instance_id, question_id)
- `randomrules` — Random question selection rules per draft (category, type, quantity)
- `publishedassignments` — Published assignments for a class (class_id, instance_id, status, dates)

### Student Assignments & Submissions
- `studentassignmentitems` — Per-student assignment items with scheduling fields
- `studentsubmissions` — Student submissions for assignment items

### Question Snapshots
- `questionsnapshots` — Frozen copies of questions at publish time

### Grading
- `rubrics` — Grading rubrics (id, name)
- `rubriccriteria` — Criteria within a rubric (rubric_id, name)
- `grading` — Grading records per submission (submission_id, teacher_id, status, score)
- `generalfeedback` — General feedback per grading record
- `inlineannotations` — Inline annotations on submissions
- `criterionscores` — Scores per criterion per grading record

### Courses & Scheduling
- `courses` — Course definitions (id, name, description, created_by)
- `coursesessions` — Sessions within a course (course_id, title, session_number, content)
- `classcourseapplications` — Links classes to courses with schedule (start_date, days)
- `generatedschedules` — Generated schedule entries per class/session

## Foreign Keys
All foreign key relationships match the finalized schema documentation.
See docs/database/foreign_keys_*.csv for the complete FK reference.

## Security
RLS is NOT enabled in this base migration. Migration 002 enables RLS on the
five core tables (teachers, students, classes, classstudents, teacherclasses).
Future migrations will handle RLS on the remaining tables.

## Notes
1. `classstudents` is the canonical enrollment table. `studentclasses` exists in
   the schema but is not used by the application.
2. All `id` columns use `bigserial` (auto-incrementing bigint) to match the
   bigint type in the schema documentation while supporting auto-generated IDs.
3. Tables are created in dependency order so all FK references resolve.
*/

-- ─────────────────────────────────────────────────────────────
-- Level 0: No foreign key dependencies
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
  id   bigserial PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id   bigserial PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL,
  class_code text
);

CREATE TABLE IF NOT EXISTS questiontypes (
  id   bigserial PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS rubrics (
  id   bigserial PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS assignmenttemplates (
  id   bigserial PRIMARY KEY,
  name text NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- Level 1: Depend on Level 0 tables
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacherclasses (
  id         bigserial PRIMARY KEY,
  teacher_id bigint NOT NULL REFERENCES teachers(id),
  class_id   bigint NOT NULL REFERENCES classes(id)
);

CREATE TABLE IF NOT EXISTS studentclasses (
  id         bigserial PRIMARY KEY,
  student_id bigint NOT NULL REFERENCES students(id),
  class_id   bigint NOT NULL REFERENCES classes(id)
);

CREATE TABLE IF NOT EXISTS classstudents (
  id         bigserial PRIMARY KEY,
  student_id bigint REFERENCES students(id),
  class_id   bigint REFERENCES classes(id)
);

CREATE TABLE IF NOT EXISTS questioncategories (
  id      bigserial PRIMARY KEY,
  name    text NOT NULL,
  type_id bigint NOT NULL REFERENCES questiontypes(id)
);

CREATE TABLE IF NOT EXISTS rubriccriteria (
  id       bigserial PRIMARY KEY,
  rubric_id bigint NOT NULL REFERENCES rubrics(id),
  name     text NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  description text,
  created_by   bigint REFERENCES teachers(id)
);

-- ─────────────────────────────────────────────────────────────
-- Level 2: Depend on Level 1 tables
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
  id          bigserial PRIMARY KEY,
  content     text NOT NULL,
  category_id bigint NOT NULL REFERENCES questioncategories(id),
  type_id     bigint NOT NULL REFERENCES questiontypes(id),
  created_by   bigint REFERENCES teachers(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coursesessions (
  id             bigserial PRIMARY KEY,
  course_id      bigint REFERENCES courses(id),
  title          text NOT NULL,
  session_number integer NOT NULL,
  content        text
);

-- ─────────────────────────────────────────────────────────────
-- Level 3: Depend on Level 2 tables
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questionsnapshots (
  id                   bigserial PRIMARY KEY,
  question_category_id bigint REFERENCES questioncategories(id),
  question_type_id     bigint REFERENCES questiontypes(id),
  rubric_id            bigint REFERENCES rubrics(id),
  prompt               text,
  instructions         text,
  response_type        text,
  image_url            text,
  image                text,
  timer                interval,
  version              text
);

CREATE TABLE IF NOT EXISTS assignmenttemplateitems (
  id          bigserial PRIMARY KEY,
  set_id      bigint NOT NULL REFERENCES assignmenttemplates(id),
  question_id bigint NOT NULL REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS assignmentdrafts (
  id               bigserial PRIMARY KEY,
  name             text NOT NULL,
  original_set_id  bigint REFERENCES assignmenttemplates(id)
);

CREATE TABLE IF NOT EXISTS classcourseapplications (
  id           bigserial PRIMARY KEY,
  class_id     bigint REFERENCES classes(id),
  course_id    bigint REFERENCES courses(id),
  start_date   date NOT NULL,
  writing_day  text,
  speaking_day text
);

-- ─────────────────────────────────────────────────────────────
-- Level 4: Depend on Level 3 tables
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignmentdraftitems (
  id          bigserial PRIMARY KEY,
  instance_id bigint NOT NULL REFERENCES assignmentdrafts(id),
  question_id bigint NOT NULL REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS randomrules (
  id                  bigserial PRIMARY KEY,
  assignment_set_id  bigint NOT NULL REFERENCES assignmentdrafts(id),
  category_id        bigint NOT NULL REFERENCES questioncategories(id),
  question_type_id   bigint NOT NULL REFERENCES questiontypes(id),
  quantity           integer NOT NULL
);

CREATE TABLE IF NOT EXISTS publishedassignments (
  id           bigserial PRIMARY KEY,
  class_id     bigint NOT NULL REFERENCES classes(id),
  instance_id  bigint NOT NULL REFERENCES assignmentdrafts(id),
  status       text NOT NULL DEFAULT 'Draft',
  published_at timestamptz,
  archived_at  timestamptz
);

CREATE TABLE IF NOT EXISTS generatedschedules (
  id             bigserial PRIMARY KEY,
  class_id       bigint REFERENCES classes(id),
  session_id     bigint REFERENCES coursesessions(id),
  scheduled_date date NOT NULL,
  status         text DEFAULT 'Scheduled'
);

-- ─────────────────────────────────────────────────────────────
-- Level 5: Depend on Level 4 tables
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studentassignmentitems (
  id             bigserial PRIMARY KEY,
  assignment_id  bigint NOT NULL REFERENCES publishedassignments(id),
  question_id    bigint NOT NULL REFERENCES questions(id),
  student_id     bigint NOT NULL REFERENCES students(id),
  snapshot_id    bigint REFERENCES questionsnapshots(id),
  status         text NOT NULL DEFAULT 'not started',
  start_time     timestamptz,
  end_time       timestamptz,
  due_at         timestamptz,
  available_from timestamptz,
  time_limit     interval
);

-- ─────────────────────────────────────────────────────────────
-- Level 6: Depend on Level 5 tables
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studentsubmissions (
  id                bigserial PRIMARY KEY,
  assignment_item_id bigint NOT NULL REFERENCES studentassignmentitems(id),
  student_id        bigint NOT NULL REFERENCES students(id),
  content           text,
  file_path         text,
  file_type         text NOT NULL,
  status            text NOT NULL DEFAULT 'submitted',
  submitted_at      timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Level 7: Depend on Level 6 tables
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grading (
  id                  bigserial PRIMARY KEY,
  submission_id       bigint NOT NULL REFERENCES studentsubmissions(id),
  teacher_id         bigint NOT NULL REFERENCES teachers(id),
  grading_status     text NOT NULL DEFAULT 'pending',
  overall_band_score numeric,
  grading_timestamp   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inlineannotations (
  id                 bigserial PRIMARY KEY,
  submission_id      bigint NOT NULL REFERENCES studentsubmissions(id),
  annotation_type    text,
  annotation_content text,
  annotation_position integer
);

-- ─────────────────────────────────────────────────────────────
-- Level 8: Depend on Level 7 tables
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generalfeedback (
  id                 bigserial PRIMARY KEY,
  grading_id         bigint NOT NULL REFERENCES grading(id),
  strengths          text,
  weaknesses         text,
  overall_comments   text,
  rich_text_feedback text,
  suggestions        text
);

CREATE TABLE IF NOT EXISTS criterionscores (
  id           bigserial PRIMARY KEY,
  grading_id   bigint NOT NULL REFERENCES grading(id),
  criterion_id bigint REFERENCES rubriccriteria(id),
  score        integer
);

-- ─────────────────────────────────────────────────────────────
-- Indexes for frequently queried columns
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_teacherclasses_teacher_id ON teacherclasses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacherclasses_class_id   ON teacherclasses(class_id);
CREATE INDEX IF NOT EXISTS idx_classstudents_student_id  ON classstudents(student_id);
CREATE INDEX IF NOT EXISTS idx_classstudents_class_id    ON classstudents(class_id);
CREATE INDEX IF NOT EXISTS idx_questions_category_id     ON questions(category_id);
CREATE INDEX IF NOT EXISTS idx_questions_type_id         ON questions(type_id);
CREATE INDEX IF NOT EXISTS idx_questions_created_by      ON questions(created_by);
CREATE INDEX IF NOT EXISTS idx_publishedassignments_class_id ON publishedassignments(class_id);