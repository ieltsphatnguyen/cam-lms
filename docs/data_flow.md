# Data Flow

This document traces the complete data flow through every implemented module,
from question creation to draft creation.

---

## Flow 1: Student Registration

```
Student visits registration page
        │
        ▼
Student enters name, email, password
        │
        ▼
RegisterPage.tsx calls register-student Edge Function
        │
        ├── EF calls supabase.auth.admin.createUser()
        │   (creates auth.users record with service-role key)
        │
        ├── EF calls register_student RPC
        │   ├── INSERT INTO students (name) → returns student_id
        │   └── INSERT INTO profiles (id, role='student', student_id)
        │       (uses the new auth.users UUID as id)
        │
        ▼
Profile created. Student can now log in.
```

**Tables written:** `auth.users`, `students`, `profiles`
**Enforcement:** Edge Function (service-role), RPC (SECURITY DEFINER)

---

## Flow 2: Admin Creates Teacher

```
Admin navigates to Admin → Teachers page
        │
        ▼
Admin enters name, email, password
        │
        ▼
AdminTeachersPage.tsx calls create-teacher Edge Function
        │
        ├── EF calls supabase.auth.admin.createUser()
        │   (creates auth.users record)
        │
        ├── EF INSERT INTO teachers (name) → returns teacher_id
        │
        ├── EF INSERT INTO profiles (id, role='teacher', teacher_id)
        │
        ▼
Teacher profile created. Teacher can now log in.
```

**Tables written:** `auth.users`, `teachers`, `profiles`
**Enforcement:** Edge Function (service-role, verifyJWT=true)

---

## Flow 3: Admin Changes User Role

```
Admin navigates to Admin → Users page
        │
        ▼
Admin selects a user and chooses a new role
        │
        ▼
AdminUsersPage.tsx calls admin-user-management Edge Function
with action=change_role, new_role
        │
        ▼
EF calls change_user_role RPC
        │
        ├── Verifies caller is admin
        ├── Validates new role
        ├── Prevents self-role-change
        ├── Prevents zero-admin scenario
        ├── If promoting to teacher: INSERT INTO teachers (if no teacher_id)
        ├── If promoting to student: INSERT INTO students (if no student_id)
        ├── UPDATE profiles SET role, teacher_id/student_id
        └── INSERT INTO role_audit_log (admin_id, target_id, prev_role, new_role)
        │
        ▼
Role changed. Audit log entry written.
```

**Tables written:** `teachers` (conditionally), `students` (conditionally), `profiles`, `role_audit_log`
**Enforcement:** Edge Function (service-role) → RPC (SECURITY DEFINER)

---

## Flow 4: Teacher Creates a Class

```
Teacher navigates to Classes page
        │
        ▼
Teacher enters class name and optional class code
        │
        ▼
TeacherClassesPage.tsx:
        │
        ├── Looks up teacher_id from profiles (via auth context)
        ├── INSERT INTO classes (name, class_code) → returns class.id
        ├── INSERT INTO teacherclasses (teacher_id, class_id)
        │
        ▼
Class created and linked to teacher.
```

**Tables written:** `classes`, `teacherclasses`
**Enforcement:** RLS (`insert_classes`, `insert_teacherclasses`)

---

## Flow 5: Student Joins a Class

```
Student navigates to Classes page
        │
        ▼
StudentClassesPage.tsx queries classstudents
        │
        ▼
Student clicks "Leave" (or in future: "Join")
        │
        ▼
DELETE FROM classstudents WHERE id = enrollment_id
        │
        ▼
Enrollment removed.
```

**Note:** The current application only implements the "Leave" (unenroll) flow.
The "Join" flow is not yet implemented in the student UI — enrollment appears
to be managed by teachers/admins via direct inserts.

**Tables written:** `classstudents` (DELETE)
**Enforcement:** RLS (`delete_classstudents`)

---

## Flow 6: Teacher Creates a Question

```
Teacher navigates to Question Bank
        │
        ▼
Teacher clicks "New Question"
        │
        ▼
Teacher fills form:
  - content (required)
  - type_id (required, from questiontypes)
  - response_type (text or audio)
  - category (free text)
  - category_secondary (optional)
  - tags (comma-separated)
  - description (optional)
  - ielts_band (optional)
  - custom_type_name (optional)
  - custom_instructions (optional)
  - image (optional file upload)
        │
        ▼
If image attached:
        │
        ├── Upload to storage bucket "question-images"
        │   path: {userId}/{timestamp}.{ext}
        ├── Get public URL
        └── Set image_url = public URL
        │
        ▼
QuestionForm calls createQuestion() in questions.ts
        │
        ├── INSERT INTO questions (
        │     content, type_id, description, ielts_band,
        │     category, category_secondary, tags,
        │     response_type, image_url,
        │     custom_type_name, custom_instructions,
        │     status='active'
        │   )
        │   (owner_id defaults to auth.uid())
        │
        ▼
Question stored in Question Bank.
```

**Tables written:** `questions`
**Storage:** `question-images` bucket
**Enforcement:** RLS (`insert_questions`)

---

## Flow 7: Teacher Searches for Similar Questions

```
Teacher types in the similar-question search field
        │
        ▼
questions.ts calls search_similar_questions RPC
        │
        ├── RPC (SECURITY DEFINER) queries:
        │   SELECT q.id, q.content, qt.name, q.category,
        │          q.response_type, p.display_name,
        │          similarity(q.content, p_prompt) AS sim
        │   FROM questions q
        │   JOIN questiontypes qt ON qt.id = q.type_id
        │   LEFT JOIN profiles p ON p.id = q.owner_id
        │   WHERE q.status = 'active'
        │     AND char_length(p_prompt) >= 10
        │     AND q.content % p_prompt
        │     AND similarity(q.content, p_prompt) >= p_threshold
        │     AND (p_exclude_id IS NULL OR q.id <> p_exclude_id)
        │   ORDER BY sim DESC LIMIT 5
        │
        ▼
SimilarQuestionsDialog displays matching questions.
```

**Tables read:** `questions`, `questiontypes`, `profiles`
**Enforcement:** RPC (SECURITY DEFINER, bypasses RLS to read all active questions)

---

## Flow 8: Teacher Creates an Assignment Template

```
Teacher navigates to Assignment Templates page
        │
        ▼
Teacher clicks "New Template"
        │
        ▼
TemplateForm opens. Teacher:
  - Enters template name (required)
  - Enters description (optional)
  - Selects fixed questions from Question Bank
  - Optionally adds Random Question Rules
        │
        ▼
For each Random Rule:
  - Select question type (required)
  - Select response type (text or audio)
  - Optionally select category filter
  - Optionally enter tag filters
        │
        ▼
Before saving, teacher can check for duplicates:
        │
        ├── templates.ts calls check_duplicate_template RPC
        │   SELECT t.id, t.name
        │   FROM assignment_templates t
        │   JOIN assignment_template_questions atq ON atq.template_id = t.id
        │   WHERE t.status = 'active'
        │   GROUP BY t.id, t.name
        │   HAVING array_agg(atq.question_id ORDER BY atq.question_id) = p_question_ids
        │   LIMIT 1
        │
        ▼
Teacher saves template:
        │
        ├── templates.ts calls createTemplate()
        │   ├── INSERT INTO assignment_templates (name, description, status='active')
        │   │   → returns template.id
        │   ├── INSERT INTO assignment_template_questions
        │   │   (template_id, question_id, selection_order) for each question
        │   └── setTemplateRandomRules()
        │       ├── DELETE FROM assignment_template_random_rules WHERE template_id = ?
        │       └── INSERT INTO assignment_template_random_rules
        │           (template_id, rule_order, question_type_id,
        │            response_type, category, tags) for each rule
        │
        ▼
Template created with fixed questions and random rules.
```

**Tables written:** `assignment_templates`, `assignment_template_questions`, `assignment_template_random_rules`
**Enforcement:** RLS (`insert_assignment_templates`, `insert_atq`, `insert_atrr`)

---

## Flow 9: Teacher Creates an Assignment Draft from a Template

```
Teacher navigates to Assignments page
        │
        ▼
Teacher clicks "Create Draft from Template"
        │
        ▼
Teacher selects:
  - A template (from assignment_templates)
  - A class (from classes where teacher is linked)
  - A draft name
  - A draft description (optional)
        │
        ▼
TeacherAssignmentsPage.tsx calls resolveTemplateToDraft() in templates.ts
        │
        ▼
templates.ts calls resolve_template_to_draft RPC
        │
        ├── RPC (SECURITY DEFINER) executes:
        │
        ├── Step 1: Create the draft
        │   INSERT INTO assignment_drafts
        │   (name, description, template_id, class_id, owner_id, status='draft')
        │   → returns draft_id
        │
        ├── Step 2: Copy fixed template questions
        │   FOR each question in assignment_template_questions
        │     WHERE template_id = p_template_id
        │     ORDER BY selection_order
        │   LOOP
        │     INSERT INTO assignment_draft_questions
        │     (draft_id, question_id, selection_order)
        │     -- Track used IDs to avoid duplicates from random rules
        │     v_used_ids := array_append(v_used_ids, question_id)
        │   END LOOP
        │
        ├── Step 3: Resolve random rules
        │   FOR each rule in assignment_template_random_rules
        │     WHERE template_id = p_template_id
        │     ORDER BY rule_order
        │   LOOP
        │     -- Get rule criteria
        │     SELECT question_type_id, response_type, category, tags
        │     FROM assignment_template_random_rules WHERE id = rule_id
        │
        │     -- Call resolve_random_rule function
        │     v_resolved_qid := resolve_random_rule(
        │       p_question_type_id, p_response_type,
        │       p_category, p_tags, v_used_ids, p_class_id
        │     )
        │
        │     -- resolve_random_rule logic:
        │     --   Priority 1: Find a matching question NOT already used
        │     --   for this class (checks assignment_draft_questions
        │     --   joined with assignment_drafts where class_id matches)
        │     --   AND not in v_used_ids
        │     --   ORDER BY random() LIMIT 1
        │     --
        │     --   Priority 2 (fallback): Find any matching question
        │     --   not in v_used_ids
        │     --   ORDER BY random() LIMIT 1
        │
        │     IF v_resolved_qid IS NULL THEN
        │       v_unresolved := v_unresolved + 1
        │     ELSE
        │       INSERT INTO assignment_draft_questions
        │       (draft_id, question_id, selection_order = rule_order)
        │       v_used_ids := array_append(v_used_ids, v_resolved_qid)
        │     END IF
        │   END LOOP
        │
        ├── Step 4: Return result
        │   SELECT json_build_object(
        │     'draft_id', v_draft_id,
        │     'unresolved_rules', v_unresolved
        │   )
        │
        ▼
Draft created with resolved question IDs.
Teacher sees success message with count of unresolved rules (if any).
```

**Tables written:** `assignment_drafts`, `assignment_draft_questions`
**Tables read:** `assignment_templates`, `assignment_template_questions`, `assignment_template_random_rules`, `questions`, `assignment_drafts` (for class-scoped dedup)
**Enforcement:** RPC (SECURITY DEFINER, bypasses RLS)

---

## Flow 10: Teacher Views Assignment Drafts

```
Teacher navigates to Assignments page
        │
        ▼
TeacherAssignmentsPage.tsx calls fetchDrafts() in templates.ts
        │
        ├── SELECT assignment_drafts.*,
        │         profiles!assignment_drafts_owner_id_fkey(display_name),
        │         classes(name),
        │         assignment_templates(name)
        │  FROM assignment_drafts
        │  [filtered by owner_id, status, class_id, search]
        │  ORDER BY updated_at
        │
        ├── SELECT assignment_draft_questions, COUNT(draft_id)
        │  FROM assignment_draft_questions
        │  WHERE draft_id IN (...)
        │  GROUP BY draft_id
        │  (to show question count per draft)
        │
        ▼
Drafts displayed in a table with owner name, class name, template name,
and question count.
```

**Tables read:** `assignment_drafts`, `assignment_draft_questions`, `profiles`, `classes`, `assignment_templates`
**Enforcement:** RLS (`select_assignment_drafts`, `select_adq`)

---

## Flow 11: Teacher Deletes an Assignment Draft

```
Teacher clicks "Delete" on a draft
        │
        ▼
Confirmation dialog appears
        │
        ▼
Teacher confirms
        │
        ▼
templates.ts calls deleteDraft()
        │
        ├── DELETE FROM assignment_drafts WHERE id = ?
        │   (cascade deletes assignment_draft_questions via FK)
        │
        ▼
Draft and its questions deleted.
```

**Tables written:** `assignment_drafts` (DELETE), `assignment_draft_questions` (cascade DELETE)
**Enforcement:** RLS (`delete_assignment_drafts`)

---

## Flow 12: User Updates Profile

```
User navigates to Profile page
        │
        ▼
User edits display name and/or uploads new avatar
        │
        ▼
If avatar uploaded:
        │
        ├── Upload to storage bucket "avatars"
        │   path: {userId}/avatar.{ext}
        ├── Get public URL
        │
        ▼
ProfilePage.tsx calls update_own_profile RPC
        │
        ├── UPDATE profiles
        │   SET display_name = p_display_name,
        │       avatar_url = p_avatar_url
        │   WHERE id = auth.uid()
        │
        ▼
Profile updated.
```

**Tables written:** `profiles`
**Storage:** `avatars` bucket
**Enforcement:** RPC (SECURITY DEFINER, `WHERE id = auth.uid()`)

---

## Flow 13: Admin Views Audit Log

```
Admin navigates to Admin → Users page
        │
        ▼
AdminUsersPage.tsx queries role_audit_log
        │
        ├── SELECT id, admin_email, target_email,
        │         previous_role, new_role, created_at
        │  FROM role_audit_log
        │  ORDER BY created_at DESC
        │  LIMIT 50
        │
        ▼
Audit log displayed showing recent role changes.
```

**Tables read:** `role_audit_log`
**Enforcement:** RLS (`select_audit_log`)

---

## Flow 14: Ban Enforcement

```
Admin disables a user account (via admin-user-management Edge Function)
        │
        ▼
EF calls supabase.auth.admin.updateUserById()
  setting banned_until to a future timestamp
        │
        ▼
On next API call by the banned user:
        │
        ├── Every RLS policy calls can_current_user_access()
        │   which checks: auth.users.banned_until IS NULL
        │                  OR banned_until <= now()
        │
        ├── If banned: can_current_user_access() returns FALSE
        │   → All RLS policies deny access
        │
        ▼
Banned user sees no data. AuthContext detects missing profile
(RLS denies SELECT) and signs the user out.
```

**Tables read:** `auth.users` (via `can_current_user_access` RPC)
**Enforcement:** RLS (all policies call `can_current_user_access()`)
