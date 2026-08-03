# RPC Functions

This document lists every PostgreSQL function (RPC) in the public schema that
is used by or relevant to the implemented modules.

---

## Application-Callable Functions

These functions are called directly by the application via
`supabase.rpc('function_name', { params })`.

---

### can_current_user_access()

| Field | Value |
|---|---|
| **Inputs** | None |
| **Outputs** | `boolean` — `true` if the current user is not banned |
| **Language** | SQL |
| **Security** | SECURITY DEFINER |
| **Search path** | `public` |
| **Purpose** | Ban enforcement. Checks whether `auth.users.banned_until` is NULL or in the past. Called by every RLS policy on every RLS-enabled table. |
| **Called by** | RLS policies on all RLS-enabled tables (not called directly by the application) |

**Definition:**
```sql
SELECT EXISTS (
  SELECT 1
  FROM auth.users
  WHERE id = auth.uid()
  AND (banned_until IS NULL OR banned_until <= now())
);
```

**Notes:** This function is the gatekeeper for all RLS policies. If it returns
`false`, the user is denied access to all data. It runs on every row access,
so performance is critical — it does a simple primary-key lookup on
`auth.users`.

---

### get_my_role()

| Field | Value |
|---|---|
| **Inputs** | None |
| **Outputs** | `text` — the current user's role (`admin`, `teacher`, or `student`), or NULL |
| **Language** | SQL |
| **Security** | SECURITY DEFINER, STABLE |
| **Search path** | `public` |
| **Purpose** | Role lookup. Used by RLS policies to check the caller's role for authorization decisions (e.g., admin override, teacher-only inserts). |
| **Called by** | RLS policies on `profiles`, `questions`, `assignment_templates`, `assignment_drafts`, `classes`, `teacherclasses`, `classstudents`, `students`, `teachers`, `role_audit_log`, and child tables |

**Definition:**
```sql
SELECT role FROM profiles WHERE id = auth.uid();
```

**Notes:** Called by many RLS policies. Since it is STABLE, PostgreSQL can
cache the result within a single statement. However, it is called multiple
times per query in policies that check both `owner_id = auth.uid()` and
`get_my_role() = 'admin'`.

---

### change_user_role(p_target_id uuid, p_new_role text)

| Field | Value |
|---|---|
| **Inputs** | `p_target_id` — UUID of the user whose role to change; `p_new_role` — new role (`admin`, `teacher`, or `student`) |
| **Outputs** | `void` |
| **Language** | PL/pgSQL |
| **Security** | SECURITY DEFINER |
| **Search path** | `public` |
| **Purpose** | Admin-only role change with safety checks. Creates teacher/student entity records if needed, updates the profile, and writes an audit log entry. |
| **Called by** | `admin-user-management` Edge Function (called from `AdminUsersPage.tsx`) |

**Logic:**
1. Verify caller is admin (raises exception if not)
2. Validate new role is one of `student`, `teacher`, `admin`
3. Prevent self-role-change
4. Prevent demoting the last admin
5. If promoting to teacher and no `teacher_id` exists: INSERT into `teachers`, get new ID
6. If promoting to student and no `student_id` exists: INSERT into `students`, get new ID
7. UPDATE `profiles` SET role, teacher_id/student_id
8. INSERT into `role_audit_log`

**Notes:** This function bypasses RLS (SECURITY DEFINER) to modify `profiles`
and insert into `teachers`/`students`/`role_audit_log`. The authorization check
is performed inside the function body, not by RLS.

---

### register_student(p_user_id uuid, p_name text)

| Field | Value |
|---|---|
| **Inputs** | `p_user_id` — UUID of the newly created auth.users record; `p_name` — student display name |
| **Outputs** | `void` |
| **Language** | PL/pgSQL |
| **Security** | SECURITY DEFINER |
| **Search path** | `public` |
| **Purpose** | Creates a `students` record and a `profiles` record for a newly registered student. Called after `auth.admin.createUser()` in the `register-student` edge function. |
| **Called by** | `register-student` Edge Function (called from `RegisterPage.tsx`) |

**Logic:**
1. INSERT INTO `students` (name) → returns student_id
2. INSERT INTO `profiles` (id, role='student', student_id) with the provided UUID

**Notes:** This function bypasses RLS to create the profile. The RLS INSERT
policy on `profiles` only allows `role = 'student'` with `auth.uid() = id`,
which would also work — but the edge function calls this RPC instead.

---

### update_own_profile(p_display_name text, p_avatar_url text)

| Field | Value |
|---|---|
| **Inputs** | `p_display_name` — new display name; `p_avatar_url` — new avatar URL |
| **Outputs** | `void` |
| **Language** | SQL |
| **Security** | SECURITY DEFINER |
| **Search path** | `public` |
| **Purpose** | Allows a user to update their own `display_name` and `avatar_url`. No other columns can be modified through this function. |
| **Called by** | `ProfilePage.tsx` (via `supabase.rpc('update_own_profile', ...)`) |

**Definition:**
```sql
UPDATE profiles
SET display_name = p_display_name,
    avatar_url = p_avatar_url
WHERE id = auth.uid();
```

**Notes:** This function restricts the update to only `display_name` and
`avatar_url`, even though the RLS UPDATE policy on `profiles` allows updating
any column. This is a defense-in-depth measure — even if a user tried to
update `role` directly via the Supabase client, the RLS policy would allow it
(the UPDATE policy only checks `auth.uid() = id`), but the application only
calls this RPC.

---

### check_duplicate_template(p_question_ids bigint[])

| Field | Value |
|---|---|
| **Inputs** | `p_question_ids` — sorted array of question IDs |
| **Outputs** | `TABLE(id bigint, name text)` — the first matching template, or empty |
| **Language** | SQL |
| **Security** | SECURITY DEFINER |
| **Search path** | `public` |
| **Purpose** | Checks whether an active template already exists with the exact same set of fixed questions. Used to warn teachers before creating a duplicate template. |
| **Called by** | `templates.ts` (called from `TeacherAssignmentTemplatesPage.tsx`) |

**Definition:**
```sql
SELECT t.id, t.name
FROM assignment_templates t
JOIN assignment_template_questions atq ON atq.template_id = t.id
WHERE t.status = 'active'
GROUP BY t.id, t.name
HAVING array_agg(atq.question_id ORDER BY atq.question_id) = p_question_ids
LIMIT 1;
```

**Notes:** Only compares fixed questions — random rules are not considered in
the duplicate check. The comparison uses `array_agg` ordered, so the input
array must be sorted.

---

### search_similar_questions(p_prompt text, p_threshold real, p_exclude_id bigint)

| Field | Value |
|---|---|
| **Inputs** | `p_prompt` — text to search for; `p_threshold` — minimum similarity score (default 0.3); `p_exclude_id` — question ID to exclude (default NULL) |
| **Outputs** | `TABLE(id bigint, content text, type_name text, category text, response_type text, owner_display_name text, sim real)` |
| **Language** | SQL |
| **Security** | SECURITY DEFINER |
| **Search path** | `public` |
| **Purpose** | Fuzzy text search for similar questions using PostgreSQL trigram similarity. Used to help teachers avoid creating duplicate questions. |
| **Called by** | `questions.ts` (called from `SimilarQuestionsDialog` in `TeacherQuestionLibraryPage.tsx`) |

**Definition:**
```sql
SELECT
  q.id, q.content, qt.name AS type_name,
  q.category, q.response_type,
  COALESCE(p.display_name, 'Unknown') AS owner_display_name,
  similarity(q.content, p_prompt) AS sim
FROM questions q
JOIN questiontypes qt ON qt.id = q.type_id
LEFT JOIN profiles p ON p.id = q.owner_id
WHERE q.status = 'active'
  AND char_length(p_prompt) >= 10
  AND q.content % p_prompt
  AND similarity(q.content, p_prompt) >= p_threshold
  AND (p_exclude_id IS NULL OR q.id <> p_exclude_id)
ORDER BY sim DESC
LIMIT 5;
```

**Notes:** Requires the `pg_trgm` extension (enabled). Uses the GIN trigram
index `idx_questions_content_trgm` on `questions.content`. The `char_length`
check prevents expensive similarity computation on very short prompts. Bypasses
RLS to read all active questions regardless of ownership.

---

### resolve_template_to_draft(p_template_id bigint, p_class_id bigint, p_draft_name text, p_draft_description text, p_owner_id uuid)

| Field | Value |
|---|---|
| **Inputs** | `p_template_id` — source template; `p_class_id` — target class; `p_draft_name` — draft name; `p_draft_description` — draft description; `p_owner_id` — draft owner UUID |
| **Outputs** | `json` — `{ "draft_id": bigint, "unresolved_rules": integer }` |
| **Language** | PL/pgSQL |
| **Security** | SECURITY DEFINER |
| **Search path** | `public` |
| **Purpose** | Creates an assignment draft from a template. Copies fixed questions and resolves random rules to concrete question IDs in a single transaction. |
| **Called by** | `templates.ts` (called from `TeacherAssignmentsPage.tsx`) |

**Logic:**
1. INSERT INTO `assignment_drafts` (name, description, template_id, class_id, owner_id, status='draft') → get draft_id
2. Copy fixed questions: for each row in `assignment_template_questions` ordered by `selection_order`:
   - INSERT INTO `assignment_draft_questions` (draft_id, question_id, selection_order)
   - Track question_id in `v_used_ids` array
3. Resolve random rules: for each row in `assignment_template_random_rules` ordered by `rule_order`:
   - Read rule criteria (question_type_id, response_type, category, tags)
   - Call `resolve_random_rule()` to find a matching question
   - If found: INSERT INTO `assignment_draft_questions` and track ID
   - If not found: increment `v_unresolved` counter
4. Return JSON with draft_id and unresolved count

**Notes:** This is the most complex RPC in the system. It bypasses RLS to
insert into `assignment_drafts` and `assignment_draft_questions`. The
`p_owner_id` parameter is passed from the frontend (the application sends
`auth.uid()` as the owner). The function does not verify that the caller
matches `p_owner_id` — it trusts the frontend.

---

### resolve_random_rule(p_question_type_id bigint, p_response_type text, p_category text, p_tags text[], p_used_question_ids bigint[], p_class_id bigint)

| Field | Value |
|---|---|
| **Inputs** | `p_question_type_id`, `p_response_type`, `p_category`, `p_tags`, `p_used_question_ids` — IDs already selected, `p_class_id` — class for deduplication |
| **Outputs** | `bigint` — a question ID, or NULL if no match found |
| **Language** | PL/pgSQL |
| **Security** | SECURITY DEFINER |
| **Search path** | `public` |
| **Purpose** | Finds a random matching question for a rule. Uses two-priority search: first avoids questions already used for the same class, then falls back to any unused matching question. |
| **Called by** | `resolve_template_to_draft()` RPC (internal call, not called directly by the application) |

**Logic:**
1. **Priority 1 (class-scoped):** If `p_class_id` is not NULL:
   - SELECT a random `questions.id` where:
     - `type_id = p_question_type_id`
     - `response_type = p_response_type`
     - `status = 'active'`
     - `category` matches (if `p_category` is not NULL)
     - `tags` overlap (if `p_tags` is not NULL and not empty)
     - NOT in `p_used_question_ids`
     - NOT already used in any `assignment_draft_questions` for the same `class_id`
   - ORDER BY random() LIMIT 1
2. **Priority 2 (fallback):** If Priority 1 found nothing (or no class):
   - Same criteria but without the class-scoped deduplication
   - ORDER BY random() LIMIT 1
3. Return the question ID (or NULL)

**Notes:** This function is called internally by `resolve_template_to_draft`
and is not exposed to the application. It bypasses RLS to read all questions.
The `ORDER BY random()` can be slow on large question tables — it scans all
matching rows and picks one at random.

---

## Trigger Functions

These functions are used as trigger procedures and are not called directly.

---

### questions_set_updated_at()

| Field | Value |
|---|---|
| **Inputs** | None (trigger) |
| **Outputs** | `trigger` |
| **Language** | PL/pgSQL |
| **Security** | Not SECURITY DEFINER |
| **Purpose** | Sets `NEW.updated_at = now()` before any UPDATE on `questions`. |
| **Trigger** | `questions_set_updated_at` BEFORE UPDATE ON `questions` FOR EACH ROW |

---

### assignment_templates_set_updated_at()

| Field | Value |
|---|---|
| **Inputs** | None (trigger) |
| **Outputs** | `trigger` |
| **Language** | PL/pgSQL |
| **Security** | Not SECURITY DEFINER |
| **Purpose** | Sets `NEW.updated_at = now()` before any UPDATE on `assignment_templates`. |
| **Trigger** | `assignment_templates_set_updated_at` BEFORE UPDATE ON `assignment_templates` FOR EACH ROW |

---

### assignment_drafts_set_updated_at()

| Field | Value |
|---|---|
| **Inputs** | None (trigger) |
| **Outputs** | `trigger` |
| **Language** | PL/pgSQL |
| **Security** | Not SECURITY DEFINER |
| **Purpose** | Sets `NEW.updated_at = now()` before any UPDATE on `assignment_drafts`. |
| **Trigger** | `assignment_drafts_set_updated_at` BEFORE UPDATE ON `assignment_drafts` FOR EACH ROW |

---

## Internal/Extension Functions

The following functions exist in the public schema but are part of the
`pg_trgm` extension and are not application RPCs:

- `gin_extract_query_trgm`
- `gin_extract_value_trgm`
- `gin_trgm_consistent`
- `gin_trgm_triconsistent`
- `gtrgm_in`
- `gtrgm_out`
- `set_limit` (deprecated trigram function)
- `show_limit` (deprecated trigram function)
- `show_trgm`
- `similarity`
- `similarity_op`

These are not documented here as they are PostgreSQL extension internals.
