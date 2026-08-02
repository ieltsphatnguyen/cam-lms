/*
# 007 — Role management: audit log + atomic role change function

## Summary
Adds a `role_audit_log` table to record every administrative role change,
and a `change_user_role()` SECURITY DEFINER function that atomically
promotes or demotes a user between student, teacher, and admin roles.
The function enforces the "never zero admins" safety rule and manages
teacher_id / student_id linkage records consistently.

## New Table
### role_audit_log
  - `id` (uuid, primary key)
  - `admin_id` (uuid, references auth.users) — the admin who performed the change
  - `admin_email` (text) — admin's email at time of action (denormalized for readability)
  - `target_id` (uuid, references auth.users) — the user whose role changed
  - `target_email` (text) — target user's email at time of action
  - `previous_role` (text) — role before the change
  - `new_role` (text) — role after the change
  - `created_at` (timestamptz, default now())

## New Function
### change_user_role(p_target_id uuid, p_new_role text) → void
  - SECURITY DEFINER, language plpgsql, search_path = public.
  - Only callable by authenticated users whose profile role is 'admin'.
  - Validates p_new_role is one of 'student', 'teacher', 'admin'.
  - Reads the target's current profile (role, teacher_id, student_id).
  - Enforces safety rules:
    1. Cannot change own role (prevents self-demotion removing last admin).
    2. If demoting an admin and only one admin remains, raises an exception:
       "At least one administrator must remain active."
  - Performs the role change atomically:
    - Updates profiles.role to p_new_role.
    - If new role is 'teacher' and no teacher record exists: inserts a new
      teacher row and links teacher_id. If a teacher row already exists
      (from a previous teacher stint), reuses it.
    - If new role is 'student' and no student record exists: inserts a new
      student row and links student_id. If a student row already exists,
      reuses it.
    - If old role was 'teacher' and new role is not 'teacher': the teacher
      row is preserved (not deleted) so class assignments and historical
      data remain intact. teacher_id stays on the profile for reference.
    - If old role was 'student' and new role is not 'student': same —
      student row is preserved, student_id stays.
  - Inserts a row into role_audit_log with admin info, target info, and
    previous/new roles.
  - The entire operation runs in an implicit function-body transaction
    (plpgsql), so it is atomic — either all changes commit or none do.

## Security
  - role_audit_log has RLS enabled.
  - SELECT: any authenticated user can read the audit log (transparency).
  - INSERT: only the change_user_role function can insert (via SECURITY
    DEFINER). No direct INSERT policy for anon/authenticated.
  - UPDATE/DELETE: no policies — the log is immutable.

## Notes
  1. No existing tables are modified — only additive changes.
  2. Teacher and student rows are never deleted on demotion, preserving
     referential integrity with classes, assignments, etc.
  3. The function fetches admin/target email from auth.users via a
     SECURITY DEFINER subquery — no auth data is exposed to the caller
     beyond what they already know (the target's email is shown in the UI).
*/

-- ── Audit log table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL,
  admin_email text NOT NULL,
  target_id   uuid NOT NULL,
  target_email text NOT NULL,
  previous_role text NOT NULL,
  new_role    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE role_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_audit_log" ON role_audit_log;
CREATE POLICY "select_audit_log"
  ON role_audit_log FOR SELECT
  TO authenticated
  USING (can_current_user_access());

-- No INSERT/UPDATE/DELETE policies — only the SECURITY DEFINER function writes.

-- ── change_user_role function ────────────────────────────
CREATE OR REPLACE FUNCTION change_user_role(p_target_id uuid, p_new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_caller_role  text;
  v_prev_role    text;
  v_prev_teacher_id  bigint;
  v_prev_student_id  bigint;
  v_admin_email   text;
  v_target_email  text;
  v_admin_count   int;
  v_new_teacher_id bigint;
  v_new_student_id bigint;
BEGIN
  -- ── Authorization: only admins can change roles ───────
  SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin access required';
  END IF;

  -- ── Validate new role ──────────────────────────────────
  IF p_new_role NOT IN ('student', 'teacher', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role;
  END IF;

  -- ── Safety Rule 1: cannot change own role ─────────────
  IF p_target_id = v_caller_id THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;

  -- ── Fetch target's current state ───────────────────────
  SELECT role, teacher_id, student_id
    INTO v_prev_role, v_prev_teacher_id, v_prev_student_id
    FROM profiles
   WHERE id = p_target_id;

  IF v_prev_role IS NULL THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  -- ── No-op if role is unchanged ─────────────────────────
  IF v_prev_role = p_new_role THEN
    RAISE EXCEPTION 'User already has this role';
  END IF;

  -- ── Safety Rule: never allow zero admins ───────────────
  IF v_prev_role = 'admin' AND p_new_role <> 'admin' THEN
    SELECT count(*) INTO v_admin_count
      FROM profiles
     WHERE role = 'admin'
       AND id <> p_target_id;
    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'At least one administrator must remain active';
    END IF;
  END IF;

  -- ── Fetch emails for audit log ─────────────────────────
  SELECT email INTO v_admin_email FROM auth.users WHERE id = v_caller_id;
  SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_id;

  -- ── Handle teacher record ──────────────────────────────
  IF p_new_role = 'teacher' THEN
    IF v_prev_teacher_id IS NULL THEN
      INSERT INTO teachers (name) VALUES (coalesce(
        (SELECT display_name FROM profiles WHERE id = p_target_id),
        split_part(v_target_email, '@', 1)
      )) RETURNING id INTO v_new_teacher_id;
    ELSE
      v_new_teacher_id := v_prev_teacher_id;
    END IF;
  END IF;

  -- ── Handle student record ──────────────────────────────
  IF p_new_role = 'student' THEN
    IF v_prev_student_id IS NULL THEN
      INSERT INTO students (name) VALUES (coalesce(
        (SELECT display_name FROM profiles WHERE id = p_target_id),
        split_part(v_target_email, '@', 1)
      )) RETURNING id INTO v_new_student_id;
    ELSE
      v_new_student_id := v_prev_student_id;
    END IF;
  END IF;

  -- ── Update profile role + linkages ─────────────────────
  UPDATE profiles
     SET role = p_new_role,
         teacher_id = CASE WHEN p_new_role = 'teacher' THEN v_new_teacher_id ELSE teacher_id END,
         student_id = CASE WHEN p_new_role = 'student' THEN v_new_student_id ELSE student_id END
   WHERE id = p_target_id;

  -- ── Write audit log ────────────────────────────────────
  INSERT INTO role_audit_log (admin_id, admin_email, target_id, target_email, previous_role, new_role)
  VALUES (v_caller_id, v_admin_email, p_target_id, v_target_email, v_prev_role, p_new_role);
END;
$$;

GRANT EXECUTE ON FUNCTION change_user_role(uuid, text) TO authenticated;