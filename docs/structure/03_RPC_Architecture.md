# 03 — RPC Architecture

**Last Updated:** v0.8.2 (2026-08-03)

## Overview

The application uses two types of server-side functions:

1. **PostgreSQL RPCs** — called via `supabase.rpc()` from the browser. These are SECURITY DEFINER functions that bypass RLS for privileged operations.
2. **Edge Functions** — Deno-based functions called via HTTP. Used for user creation (admin, teacher, student) which requires the Supabase service role key.

## PostgreSQL RPCs

### Question Bank

#### `search_similar_questions(p_prompt text, p_threshold real, p_exclude_id bigint)`
- **Returns:** TABLE(id, title, content, type_name, teaching_category, response_type, owner_display_name, sim)
- **Purpose:** Finds similar questions using pg_trigram similarity search.
- **Security:** SECURITY DEFINER. Reads active questions.
- **Called from:** `src/lib/questions.ts` → `searchSimilarQuestions()`

### Assignment Templates

#### `check_duplicate_template(p_question_ids bigint[])`
- **Returns:** TABLE(id, name)
- **Purpose:** Detects if a template with the exact same question set already exists.
- **Security:** SECURITY DEFINER.
- **Called from:** `src/lib/templates.ts` → `checkDuplicateTemplate()`

#### `resolve_template_to_draft(p_template_id, p_class_id, p_draft_name, p_draft_description)`
- **Returns:** TABLE(draft_id, unresolved_rules)
- **Purpose:** Resolves a template (including random rules) into a new draft.
- **Security:** SECURITY DEFINER. Verifies ownership.
- **Called from:** `src/lib/templates.ts` → `resolveTemplateToDraft()`

#### `resolve_random_rule(p_question_type_id, p_response_type, p_category, p_tags, p_used_question_ids, p_class_id)`
- **Returns:** bigint (question_id) or NULL
- **Purpose:** Resolves a single random rule to a question ID, excluding already-used questions.
- **Security:** SECURITY DEFINER.
- **Called from:** `src/lib/templates.ts` → `resolveRandomRule()`

### Assignment Publishing

#### `publish_draft(p_draft_id)`
- **Returns:** bigint (published_assignment_id)
- **Purpose:** Creates a published assignment + items from a draft. Copies all question data into the immutable published_assignment_items table.
- **Security:** SECURITY DEFINER. Verifies draft ownership.
- **Called from:** `src/lib/templates.ts` → `publishDraft()`

#### `unpublish_draft(p_published_id)`
- **Returns:** bigint (draft_id)
- **Purpose:** Removes a published assignment and its items. Returns the draft to 'draft' status.
- **Security:** SECURITY DEFINER. Verifies ownership.
- **Called from:** `src/lib/templates.ts` → `unpublishDraft()`

### Student Attempts

#### `start_attempt(p_published_item_id)`
- **Returns:** TABLE(attempt_id, started_at, time_limit_seconds, response_type, status, already_submitted, submitted_at, item)
- **Purpose:** Creates or resumes an attempt for a published item. Enforces one attempt per item. Returns question content.
- **Security:** SECURITY DEFINER. Verifies student enrollment.
- **Called from:** `src/lib/attempts.ts` → `startAttempt()`

#### `submit_attempt(p_attempt_id, p_written_response, p_audio_path, p_word_count, p_status)`
- **Returns:** bigint (attempt_id)
- **Purpose:** Submits a student's response (written or audio). Updates status to 'submitted' or 'auto_submitted'.
- **Security:** SECURITY DEFINER. Verifies attempt ownership.
- **Called from:** `src/lib/attempts.ts` → `submitAttempt()`

### Annotation Engine

#### `get_rubric_criteria(p_question_type_id)`
- **Returns:** TABLE(id, name, display_order)
- **Purpose:** Fetches rubric criteria for a question type.
- **Security:** SECURITY DEFINER.
- **Called from:** `src/lib/annotations.ts` → `fetchRubricCriteria()`

#### `get_attempt_annotations(p_attempt_id)`
- **Returns:** JSON array of annotations with nested comments
- **Purpose:** Fetches all annotations and their comments for an attempt.
- **Security:** SECURITY DEFINER. Verifies the caller can grade the attempt.
- **Called from:** `src/lib/annotations.ts` → `fetchAnnotations()`

#### `save_annotation(p_mode, p_attempt_id, p_annotation_id, p_criterion_id, p_criterion_name, p_start_offset, p_end_offset, p_selected_text, p_highlight_color, p_format_bold, p_format_italic, p_format_underline, p_format_strikethrough, p_text_color)`
- **Returns:** bigint (annotation_id)
- **Purpose:** Creates or updates an annotation. Mode is 'create' or 'update'.
- **Security:** SECURITY DEFINER. Verifies the caller can annotate the attempt.
- **Called from:** `src/lib/annotations.ts` → `createAnnotation()` / `updateAnnotation()`

#### `delete_annotation(p_annotation_id)`
- **Returns:** void
- **Purpose:** Deletes an annotation and its comments (cascade).
- **Security:** SECURITY DEFINER. Verifies ownership.
- **Called from:** `src/lib/annotations.ts` → `deleteAnnotation()`

#### `move_annotation(p_annotation_id, p_criterion_id, p_highlight_color)`
- **Returns:** void
- **Purpose:** Moves an annotation to a different criterion (changes highlight color).
- **Security:** SECURITY DEFINER. Verifies ownership.
- **Called from:** `src/lib/annotations.ts` → `moveAnnotation()`

#### `save_annotation_comment(p_annotation_id, p_type, p_content, p_audio_path, p_comment_id)`
- **Returns:** bigint (comment_id)
- **Purpose:** Creates or updates a text/audio comment on an annotation.
- **Security:** SECURITY DEFINER. Verifies ownership.
- **Called from:** `src/lib/annotations.ts` → `saveTextComment()` / `saveAudioComment()`

#### `delete_annotation_comment(p_comment_id)`
- **Returns:** void
- **Purpose:** Deletes an annotation comment.
- **Security:** SECURITY DEFINER. Verifies ownership.
- **Called from:** `src/lib/annotations.ts` → `deleteComment()`

### Feedback & Transcript

#### `save_feedback(p_attempt_id, p_feedback)`
- **Returns:** void
- **Purpose:** Saves teacher feedback text on an attempt.
- **Security:** SECURITY DEFINER. Verifies the caller can grade the attempt.
- **Called from:** `src/lib/annotations.ts` → `saveFeedback()`

#### `save_transcript(p_attempt_id, p_transcript)`
- **Returns:** void
- **Purpose:** Saves teacher transcript for a speaking attempt.
- **Security:** SECURITY DEFINER. Verifies the caller can grade the attempt.
- **Called from:** `src/lib/annotations.ts` → `saveTranscript()`

#### `publish_feedback(p_attempt_id)`
- **Returns:** void
- **Purpose:** Marks feedback as published (visible to student). Resolves teacher from grader record.
- **Security:** SECURITY DEFINER. Verifies the caller can grade the attempt.
- **Called from:** `src/lib/annotations.ts` → `publishFeedback()`

#### `unpublish_feedback(p_attempt_id)`
- **Returns:** void
- **Purpose:** Unpublishes feedback (hides from student).
- **Security:** SECURITY DEFINER. Verifies the caller can grade the attempt.
- **Called from:** `src/lib/annotations.ts` → `unpublishFeedback()`

#### `get_student_feedback(p_attempt_id)`
- **Returns:** TABLE(feedback, transcript, feedback_published)
- **Purpose:** Student retrieves their feedback. Only returns if feedback_published is true.
- **Security:** SECURITY DEFINER. Verifies the caller owns the attempt.
- **Called from:** `src/lib/annotations.ts` → `fetchStudentFeedback()`

#### `get_assignment_status(p_published_assignment_id, p_student_profile_id)`
- **Returns:** TABLE(item_id, attempt_status, is_submitted, is_graded)
- **Purpose:** Computes per-item status for a student's assignment.
- **Security:** SECURITY DEFINER.
- **Called from:** `src/lib/annotations.ts` → `fetchAssignmentStatus()`

### Helper Functions

#### `get_student_name(p_student_id)`
- **Returns:** text
- **Purpose:** Resolves student ID to name.
- **Security:** SECURITY DEFINER.

#### `get_profile_to_student_mapping(p_profile_ids uuid[])`
- **Returns:** TABLE(profile_id, student_id, student_name)
- **Purpose:** Maps profile UUIDs to student IDs and names. Used by grading to resolve attempt owners.
- **Security:** SECURITY DEFINER.

#### `get_profile_display_names(p_profile_ids uuid[])`
- **Returns:** TABLE(profile_id, display_name)
- **Purpose:** Resolves profile UUIDs to display names. Used to show assignment owner names.
- **Security:** SECURITY DEFINER.

## Edge Functions

Edge Functions are Deno-based HTTP functions deployed via the Supabase MCP `deploy_edge_function` tool. They use the service role key for privileged operations.

### `setup-admin`
- **Path:** `supabase/functions/setup-admin/index.ts`
- **Purpose:** Creates the initial admin account. Called during system setup.
- **JWT Verification:** Disabled (public).

### `create-teacher`
- **Path:** `supabase/functions/create-teacher/index.ts`
- **Purpose:** Creates a new teacher account (auth user + profile + teacher record). Called by admin.
- **JWT Verification:** Enabled (requires admin auth).

### `register-student`
- **Path:** `supabase/functions/register-student/index.ts`
- **Purpose:** Registers a new student account (auth user + profile + student record). Called by students self-registering.
- **JWT Verification:** Disabled (public registration).

### `admin-user-management`
- **Path:** `supabase/functions/admin-user-management/index.ts`
- **Purpose:** Admin operations: ban, unban, change role, delete user. Writes to audit_log.
- **JWT Verification:** Enabled (requires admin auth).

## RPC Error Handling

All RPC calls in the frontend use `src/lib/rpc-errors.ts` → `reportRpcError()` for consistent error reporting. The function extracts the error message from Supabase error objects and logs it with context.

## Known Limitations

1. All RPCs use SECURITY DEFINER — they run with database owner privileges. Access control is enforced inside each function body, not by RLS.
2. Edge Functions are the only server-side code that runs outside the database. They are used exclusively for user creation/management.
3. No RPC caching — every call hits the database.
4. The `save_annotation` RPC handles both create and update modes via a `p_mode` parameter.
