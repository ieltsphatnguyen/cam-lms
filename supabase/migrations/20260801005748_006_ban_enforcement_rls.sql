/*
# 006 — Ban enforcement at the RLS level via can_current_user_access()

## Summary
Adds a SECURITY DEFINER function `can_current_user_access()` that returns true
only when the caller is authenticated and not currently banned in auth.users.
Every RLS policy on every table that protects user data is updated to include
`AND can_current_user_access()` in its USING and/or WITH CHECK clause, so a
banned user with a still-valid JWT sees zero rows — they are locked out
immediately, not just at login time.

## New Function
### can_current_user_access() → boolean
  - SECURITY DEFINER, language sql, search_path = public.
  - Returns true if auth.uid() is non-null AND the corresponding auth.users row
    has no active ban (banned_until IS NULL or banned_until <= now()).
  - Returns false for unauthenticated requests (auth.uid() IS NULL) or banned
    users.
  - Returns ONLY a boolean. No columns from auth.users are exposed — the EXISTS
    subquery selects a constant 1.

## Modified Policies (all tables with RLS enabled)
Every policy below gains `AND can_current_user_access()` in its USING and/or
WITH CHECK clause. The existing ownership/role predicates are preserved
unchanged — the ban check is purely additive.

### profiles (3 policies)
  - select_own_profile: USING += AND can_current_user_access()
  - insert_student_profile: WITH CHECK += AND can_current_user_access()
  - update_own_profile: USING + WITH CHECK += AND can_current_user_access()

### teachers (2 policies)
  - select_teachers: USING += AND can_current_user_access()
  - update_own_teacher: USING + WITH CHECK += AND can_current_user_access()

### students (2 policies)
  - select_students: USING += AND can_current_user_access()
  - update_own_student: USING + WITH CHECK += AND can_current_user_access()

### classes (3 policies)
  - select_classes: USING (was `true`) → can_current_user_access()
  - insert_classes: WITH CHECK += AND can_current_user_access()
  - update_classes: USING + WITH CHECK += AND can_current_user_access()

### classstudents (3 policies)
  - select_classstudents: USING += AND can_current_user_access()
  - insert_classstudents: WITH CHECK += AND can_current_user_access()
  - delete_classstudents: USING += AND can_current_user_access()

### teacherclasses (3 policies)
  - select_teacherclasses: USING += AND can_current_user_access()
  - insert_teacherclasses: WITH CHECK += AND can_current_user_access()
  - delete_teacherclasses: USING += AND can_current_user_access()

## Notes
  1. The function is SECURITY DEFINER because auth.users is not readable by
     the anon/authenticated roles. The function exposes only a boolean.
  2. The existing ban/restore workflow (admin-user-management edge function
     using ban_duration) is unchanged. This migration only adds RLS-level
     enforcement for already-issued JWTs.
  3. All policies are dropped and recreated to remain idempotent.
*/

-- ── Helper function ─────────────────────────────────────

CREATE OR REPLACE FUNCTION can_current_user_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM auth.users
     WHERE id = auth.uid()
       AND (banned_until IS NULL OR banned_until <= now())
  );
$$;

GRANT EXECUTE ON FUNCTION can_current_user_access() TO authenticated, anon;

-- ── profiles ─────────────────────────────────────────────

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile"
  ON profiles FOR SELECT
  TO authenticated
  USING ((auth.uid() = id OR get_my_role() = 'admin') AND can_current_user_access());

DROP POLICY IF EXISTS "insert_student_profile" ON profiles;
CREATE POLICY "insert_student_profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid() = id AND role = 'student') AND can_current_user_access());

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id AND can_current_user_access())
  WITH CHECK (auth.uid() = id AND can_current_user_access());

-- ── teachers ─────────────────────────────────────────────

DROP POLICY IF EXISTS "select_teachers" ON teachers;
CREATE POLICY "select_teachers"
  ON teachers FOR SELECT
  TO authenticated
  USING (
    (
      id = (SELECT teacher_id FROM profiles WHERE profiles.id = auth.uid())
      OR get_my_role() = ANY (ARRAY['admin', 'teacher'])
    )
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "update_own_teacher" ON teachers;
CREATE POLICY "update_own_teacher"
  ON teachers FOR UPDATE
  TO authenticated
  USING (
    (
      id = (SELECT teacher_id FROM profiles WHERE profiles.id = auth.uid())
      OR get_my_role() = 'admin'
    )
    AND can_current_user_access()
  )
  WITH CHECK (
    (
      id = (SELECT teacher_id FROM profiles WHERE profiles.id = auth.uid())
      OR get_my_role() = 'admin'
    )
    AND can_current_user_access()
  );

-- ── students ─────────────────────────────────────────────

DROP POLICY IF EXISTS "select_students" ON students;
CREATE POLICY "select_students"
  ON students FOR SELECT
  TO authenticated
  USING (
    (
      id = (SELECT student_id FROM profiles WHERE profiles.id = auth.uid())
      OR get_my_role() = ANY (ARRAY['admin', 'teacher'])
    )
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "update_own_student" ON students;
CREATE POLICY "update_own_student"
  ON students FOR UPDATE
  TO authenticated
  USING (
    (
      id = (SELECT student_id FROM profiles WHERE profiles.id = auth.uid())
      OR get_my_role() = 'admin'
    )
    AND can_current_user_access()
  )
  WITH CHECK (
    (
      id = (SELECT student_id FROM profiles WHERE profiles.id = auth.uid())
      OR get_my_role() = 'admin'
    )
    AND can_current_user_access()
  );

-- ── classes ──────────────────────────────────────────────

DROP POLICY IF EXISTS "select_classes" ON classes;
CREATE POLICY "select_classes"
  ON classes FOR SELECT
  TO authenticated
  USING (can_current_user_access());

DROP POLICY IF EXISTS "insert_classes" ON classes;
CREATE POLICY "insert_classes"
  ON classes FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() = ANY (ARRAY['teacher', 'admin'])
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "update_classes" ON classes;
CREATE POLICY "update_classes"
  ON classes FOR UPDATE
  TO authenticated
  USING (
    (
      get_my_role() = 'admin'
      OR (
        get_my_role() = 'teacher'
        AND EXISTS (
          SELECT 1 FROM teacherclasses tc
          JOIN profiles p ON p.teacher_id = tc.teacher_id
          WHERE tc.class_id = classes.id AND p.id = auth.uid()
        )
      )
    )
    AND can_current_user_access()
  )
  WITH CHECK (
    (
      get_my_role() = 'admin'
      OR (
        get_my_role() = 'teacher'
        AND EXISTS (
          SELECT 1 FROM teacherclasses tc
          JOIN profiles p ON p.teacher_id = tc.teacher_id
          WHERE tc.class_id = classes.id AND p.id = auth.uid()
        )
      )
    )
    AND can_current_user_access()
  );

-- ── classstudents ────────────────────────────────────────

DROP POLICY IF EXISTS "select_classstudents" ON classstudents;
CREATE POLICY "select_classstudents"
  ON classstudents FOR SELECT
  TO authenticated
  USING (
    (
      student_id = (SELECT student_id FROM profiles WHERE profiles.id = auth.uid())
      OR get_my_role() = ANY (ARRAY['admin', 'teacher'])
    )
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "insert_classstudents" ON classstudents;
CREATE POLICY "insert_classstudents"
  ON classstudents FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      student_id = (SELECT student_id FROM profiles WHERE profiles.id = auth.uid())
      OR get_my_role() = ANY (ARRAY['admin', 'teacher'])
    )
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "delete_classstudents" ON classstudents;
CREATE POLICY "delete_classstudents"
  ON classstudents FOR DELETE
  TO authenticated
  USING (
    (
      student_id = (SELECT student_id FROM profiles WHERE profiles.id = auth.uid())
      OR get_my_role() = ANY (ARRAY['admin', 'teacher'])
    )
    AND can_current_user_access()
  );

-- ── teacherclasses ───────────────────────────────────────

DROP POLICY IF EXISTS "select_teacherclasses" ON teacherclasses;
CREATE POLICY "select_teacherclasses"
  ON teacherclasses FOR SELECT
  TO authenticated
  USING (
    (
      teacher_id = (SELECT teacher_id FROM profiles WHERE profiles.id = auth.uid())
      OR get_my_role() = 'admin'
    )
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "insert_teacherclasses" ON teacherclasses;
CREATE POLICY "insert_teacherclasses"
  ON teacherclasses FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      get_my_role() = 'admin'
      OR (
        get_my_role() = 'teacher'
        AND teacher_id = (SELECT teacher_id FROM profiles WHERE profiles.id = auth.uid())
      )
    )
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "delete_teacherclasses" ON teacherclasses;
CREATE POLICY "delete_teacherclasses"
  ON teacherclasses FOR DELETE
  TO authenticated
  USING (
    (
      get_my_role() = 'admin'
      OR (
        get_my_role() = 'teacher'
        AND teacher_id = (SELECT teacher_id FROM profiles WHERE profiles.id = auth.uid())
      )
    )
    AND can_current_user_access()
  );