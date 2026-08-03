/*
# 001 — Profiles table and authentication support

## Summary
Adds the bridge layer between Supabase Auth (auth.users) and the existing
business entities (teachers, students). This is the ONLY new table in this
migration; no existing tables are altered.

## New Tables
### profiles
Links each authenticated user to their role and their corresponding entity:
  - id         uuid       — matches auth.users.id (PK, cascades on user deletion)
  - role        text       — 'admin' | 'teacher' | 'student' (CHECK constraint)
  - teacher_id  bigint     — FK → teachers.id (set for teachers, null otherwise)
  - student_id  bigint     — FK → students.id (set for students, null otherwise)
  - created_at  timestamptz

## New Functions
### get_my_role()
  SECURITY DEFINER helper that returns the current user's role without hitting
  RLS. Used by all downstream RLS policies to avoid infinite recursion.

### register_student(p_name text)
  SECURITY DEFINER function called after student sign-up. Atomically:
    1. Inserts a row into students (name)
    2. Inserts the matching row into profiles (role='student')
  Granted EXECUTE to the authenticated role.

## Security
  - RLS enabled on profiles.
  - SELECT  : own row OR admin.
  - INSERT  : self-insert with role='student' only (public registration).
              Admin/teacher creation goes through the service-role edge function.
  - UPDATE/DELETE intentionally omitted — role changes via server functions only.

## Notes
  1. Email confirmation must be OFF in the Supabase Auth settings.
  2. First admin account must be seeded directly (see below).
  3. Teacher accounts are created by the admin via the create-teacher edge function.
  4. studentclasses is NOT used — classstudents is the canonical enrollment table.

## Seeding the first admin
  After applying this migration, run the following SQL to promote an existing
  auth user to admin (replace the placeholder UUID and name):

    INSERT INTO profiles (id, role)
    VALUES ('<auth-user-uuid>', 'admin');

  There is intentionally no UI for creating admins.
*/

-- ─────────────────────────────────────────────────────────────
-- 1. profiles table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  teacher_id bigint REFERENCES teachers(id),
  student_id bigint REFERENCES students(id),
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. get_my_role() — bypasses RLS to avoid recursion in policies
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. register_student() — atomic student sign-up helper
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION register_student(p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id bigint;
BEGIN
  INSERT INTO students (name) VALUES (p_name) RETURNING id INTO v_student_id;
  INSERT INTO profiles (id, role, student_id)
    VALUES (auth.uid(), 'student', v_student_id);
END;
$$;

GRANT EXECUTE ON FUNCTION register_student(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS on profiles
-- ─────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR get_my_role() = 'admin');

DROP POLICY IF EXISTS "insert_student_profile" ON profiles;
CREATE POLICY "insert_student_profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id AND role = 'student');
