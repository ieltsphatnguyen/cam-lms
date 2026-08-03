# 02 — Database Architecture

**Last Updated:** v0.8.2 (2026-08-03)

## Overview

The database is PostgreSQL hosted on Supabase. All tables have Row-Level Security (RLS) enabled. Data access is enforced through RLS policies and SECURITY DEFINER functions.

## Migration System

Migrations are stored in `supabase/migrations/` and applied via the Supabase MCP `apply_migration` tool. Migrations are timestamped and sequential. There are 40+ migrations covering schema creation, RLS policies, storage policies, and function definitions.

## Tables

### Authentication & User Management

#### `profiles`
- **Purpose:** Links Supabase Auth users to application roles and records.
- **Columns:** `id` (UUID, PK, references `auth.users`), `role` ('admin'|'teacher'|'student'), `teacher_id` (FK to teachers), `student_id` (FK to students), `display_name`, `avatar_url`, `created_at`
- **RLS:** Enabled. Users can read their own profile. Admins can read all profiles. Banned users cannot read their profile (enforced by ban RLS).
- **Owned by:** Authentication subsystem

#### `teachers`
- **Purpose:** Teacher records.
- **Columns:** `id` (serial, PK), `name` (text)
- **RLS:** Enabled. Teachers can read their own record. Admins can read all.
- **Owned by:** Authentication subsystem

#### `students`
- **Purpose:** Student records.
- **Columns:** `id` (serial, PK), `name` (text)
- **RLS:** Enabled. Students can read their own record. Teachers can read students in their classes. Admins can read all.
- **Owned by:** Authentication subsystem

#### `audit_log`
- **Purpose:** Audit trail for admin actions (ban, unban, role changes).
- **Columns:** `id`, `actor_profile_id`, `action`, `target_profile_id`, `details`, `created_at`
- **RLS:** Enabled. Only admins can read.
- **Owned by:** Authentication subsystem

### Class Management

#### `classes`
- **Purpose:** Class records.
- **Columns:** `id` (serial, PK), `name`, `class_code`, `archived_at`
- **RLS:** Enabled. Teachers see classes they teach. Students see classes they're enrolled in. Admins see all.
- **Owned by:** Teacher Dashboard subsystem

#### `teacherclasses`
- **Purpose:** Junction: teacher ↔ class.
- **Columns:** `id`, `teacher_id` (FK), `class_id` (FK)
- **RLS:** Enabled.
- **Owned by:** Teacher Dashboard subsystem

#### `classstudents`
- **Purpose:** Junction: student ↔ class (enrollment).
- **Columns:** `id`, `student_id` (FK), `class_id` (FK)
- **RLS:** Enabled. Unique constraint on (student_id, class_id).
- **Owned by:** Student Dashboard subsystem

### Question Bank

#### `questiontypes`
- **Purpose:** 7 built-in question types.
- **Columns:** `id` (serial, PK), `name` (text)
- **Records:** Writing Task 1 (1), Writing Task 2 (2), Speaking Part 1 (3), Speaking Part 2 (4), Speaking Part 3 (5), Extra Homework (6), Custom (7)
- **RLS:** Enabled. Readable by all authenticated users.
- **Owned by:** Question Bank subsystem

#### `questions`
- **Purpose:** Question content library.
- **Columns:** `id`, `content`, `description`, `ielts_band`, `category`, `category_secondary`, `tags` (text[]), `response_type` ('text'|'audio'), `image_url`, `owner_id` (FK to profiles), `type_id` (FK to questiontypes), `category_id`, `created_by`, `status` ('active'|'archived'), `archived_at`, `custom_type_name`, `custom_instructions`, `created_at`, `updated_at`
- **RLS:** Enabled. Owners can CRUD their own questions. All authenticated users can read active questions.
- **Owned by:** Question Bank subsystem

#### `question_categories`
- **Purpose:** Category lookup (if used).
- **RLS:** Enabled.
- **Owned by:** Question Bank subsystem

### Assignment Templates

#### `assignment_templates`
- **Purpose:** Reusable question collections.
- **Columns:** `id`, `name`, `description`, `owner_id` (FK to profiles), `status` ('active'|'archived'), `archived_at`, `created_at`, `updated_at`
- **RLS:** Enabled. Owners can CRUD their own templates. All authenticated users can read active templates.
- **Owned by:** Assignment Templates subsystem

#### `assignment_template_questions`
- **Purpose:** Junction: template ↔ questions with selection order.
- **Columns:** `id`, `template_id` (FK), `question_id` (FK), `selection_order` (int)
- **RLS:** Enabled.
- **Owned by:** Assignment Templates subsystem

#### `assignment_template_random_rules`
- **Purpose:** Random question selection rules per template.
- **Columns:** `id`, `template_id` (FK), `rule_order`, `question_type_id` (FK), `response_type`, `category`, `tags` (text[]), `created_at`
- **RLS:** Enabled.
- **Owned by:** Assignment Templates subsystem

#### `assignment_template_favorites`
- **Purpose:** User favorites for templates.
- **Columns:** `id`, `template_id` (FK), `user_id` (FK to profiles)
- **RLS:** Enabled. Unique on (template_id, user_id).
- **Owned by:** Assignment Templates subsystem

### Assignment Drafts

#### `assignment_drafts`
- **Purpose:** Working assignment documents.
- **Columns:** `id`, `name` (nullable), `description`, `template_id` (FK, nullable), `class_id` (FK, nullable), `owner_id` (FK to profiles), `status` ('draft'|'published'), `created_at`, `updated_at`
- **RLS:** Enabled. Owners can CRUD their own drafts.
- **Owned by:** Assignment Drafts subsystem

#### `assignment_draft_questions`
- **Purpose:** Junction: draft ↔ questions with scheduling metadata.
- **Columns:** `id`, `draft_id` (FK), `question_id` (FK), `selection_order`, `created_at`, `available_from`, `due_date`, `due_after_days`, `timed` (bool), `time_limit` (interval), `prep_time_seconds` (int), `recording_time_seconds` (int)
- **RLS:** Enabled.
- **Owned by:** Assignment Drafts subsystem

### Published Assignments

#### `published_assignments`
- **Purpose:** Immutable assignment snapshots published to classes.
- **Columns:** `id`, `draft_id` (FK), `class_id` (FK), `name`, `description`, `owner_id` (FK to profiles), `published_at`
- **RLS:** Enabled. Teachers see assignments in classes they teach. Students see assignments in classes they're enrolled in. Admins see all.
- **Owned by:** Published Assignments subsystem

#### `published_assignment_items`
- **Purpose:** Immutable item snapshots within published assignments.
- **Columns:** `id`, `published_assignment_id` (FK), `question_id`, `content`, `type_id`, `type_name`, `response_type`, `image_url`, `custom_type_name`, `custom_instructions`, `category`, `category_secondary`, `tags`, `ielts_band`, `description`, `selection_order`, `available_from`, `due_date`, `due_after_days`, `timed`, `time_limit` (interval), `prep_time_seconds`, `recording_time_seconds`
- **RLS:** Enabled. Same access as published_assignments.
- **Owned by:** Published Assignments subsystem

### Student Attempts

#### `student_attempts`
- **Purpose:** Student responses to published items.
- **Columns:** `id`, `published_assignment_item_id` (FK), `student_profile_id` (FK to profiles), `status` ('in_progress'|'submitted'|'auto_submitted'), `started_at`, `submitted_at`, `time_limit_seconds`, `response_type` ('text'|'audio'), `written_response`, `audio_path`, `word_count`, `created_at`, `feedback`, `transcript`, `feedback_published` (bool)
- **RLS:** Enabled. Students can read/insert their own attempts. Teachers can read attempts for items in their classes. One attempt per item enforced.
- **Owned by:** Student Attempts subsystem

### Annotation Engine

#### `annotations`
- **Purpose:** Text highlights with criterion assignments.
- **Columns:** `id`, `attempt_id` (FK), `criterion_id` (FK, nullable), `criterion_name` (nullable), `start_offset` (int), `end_offset` (int), `selected_text`, `highlight_color` ('purple'|'yellow'|'green'|'cyan'), `has_text_comment` (bool), `has_audio_comment` (bool), `format_bold`, `format_italic`, `format_underline`, `format_strikethrough`, `text_color`, `created_at`, `updated_at`
- **RLS:** Enabled. Teachers who can grade the attempt can CRUD annotations.
- **Owned by:** Annotation Engine subsystem

#### `annotation_comments`
- **Purpose:** Text or audio comments attached to annotations.
- **Columns:** `id`, `annotation_id` (FK), `type` ('text'|'audio'), `content` (nullable), `audio_path` (nullable), `created_at`
- **RLS:** Enabled. Same access as annotations.
- **Owned by:** Annotation Engine subsystem

#### `rubric_criteria`
- **Purpose:** Grading criteria per question type.
- **Columns:** `id`, `question_type_id` (FK), `name`, `display_order`
- **RLS:** Enabled. Readable by all authenticated users.
- **Owned by:** Annotation Engine subsystem

### Grading

#### `grading`
- **Purpose:** Grading records linking attempts to graders.
- **Columns:** `id`, `submission_id` (FK to student_attempts), `grading_status`, `grader_id` (FK to profiles), `created_at`, `updated_at`
- **RLS:** Enabled. Teachers can read/insert grading records for their classes.
- **Owned by:** Grading subsystem

## Entity Relationships

```
profiles ─┬─< teachers
          ├─< students
          └─< assignment_templates (owner)
              └─< assignment_template_questions ─> questions
              └─< assignment_template_random_rules
              └─< assignment_template_favorites

classes ─┬─< teacherclasses ─> teachers
         └─< classstudents ─> students

assignment_drafts ─< assignment_draft_questions ─> questions
                  └─> classes
                  └─> assignment_templates

published_assignments ─< published_assignment_items
                      └─> classes

student_attempts ─> published_assignment_items
                 └─< annotations ─< annotation_comments
                                └─> rubric_criteria

grading ─> student_attempts
```

## Storage Buckets

| Bucket | Purpose | Access |
|--------|---------|--------|
| `question-images` | Question images, student audio recordings | Public read; authenticated write (owner-scoped) |
| `annotation-audio` | Teacher audio comments | Authenticated write; signed URL read |
| `avatars` | User profile pictures | Authenticated write; public read |

## Known Limitations

1. No database-level cascade deletes — deletions are handled in application code.
2. `published_assignment_items` denormalizes question data (content, type_name, etc.) for immutability.
3. `student_attempts` enforces one attempt per item via a unique constraint.
4. The `grading` table tracks grading status but the annotation engine manages the actual feedback content.
