/*
# 002 — Row Level Security on core Milestone 1 tables

## Summary
Enables RLS and adds policies on the five tables accessed in Milestone 1:
teachers, students, classes, classstudents, teacherclasses.
No columns are added, removed, or changed on any existing table.
All policies use get_my_role() (defined in migration 001) to check the
caller's role without recursion.

## Tables modified (RLS only — no column changes)
  - teachers
  - students
  - classes
  - classstudents
  - teacherclasses

## Policy overview
### teachers
  SELECT  : own record OR admin sees all OR teacher sees all (for display purposes)

### students
  SELECT  : own record OR admin/teacher sees all

### classes
  SELECT  : all authenticated users (needed for join-by-code flow + teacher views)
  INSERT  : teachers and admins only
  UPDATE  : the teacher who owns the class (via teacherclasses) OR admin

### classstudents
  SELECT  : own enrollments OR admin/teacher
  INSERT  : self-enroll (student) OR admin/teacher
  DELETE  : self-unenroll (student) OR admin/teacher
  UPDATE  : intentionally omitted (no editable fields)

### teacherclasses
  SELECT  : own records OR admin
  INSERT  : teacher links themselves OR admin
  DELETE  : teacher unlinks themselves OR admin
  UPDATE  : intentionally omitted

## Notes
  1. classstudents is the canonical enrollment table. studentclasses is ignored.
  2. Classes do not yet have an archived_at / status column. Archive support
     requires a separate approved migration.
  3. The USING clause on classes UPDATE checks ownership via teacherclasses
     to ensure a teacher can only edit their own classes.
*/

-- ─────────────────────────────────────────────────────────────
-- teachers
-- ─────────────────────────────────────────────────────────────
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_teachers" ON teachers;
CREATE POLICY "select_teachers" ON teachers
  FOR SELECT TO authenticated
  USING (
    id = (SELECT teacher_id FROM profiles WHERE profiles.id = auth.uid())
    OR get_my_role() IN ('admin', 'teacher')
  );

-- ─────────────────────────────────────────────────────────────
-- students
-- ─────────────────────────────────────────────────────────────
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_students" ON students;
CREATE POLICY "select_students" ON students
  FOR SELECT TO authenticated
  USING (
    id = (SELECT student_id FROM profiles WHERE profiles.id = auth.uid())
    OR get_my_role() IN ('admin', 'teacher')
  );

-- ─────────────────────────────────────────────────────────────
-- classes
-- ─────────────────────────────────────────────────────────────
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_classes" ON classes;
CREATE POLICY "select_classes" ON classes
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "insert_classes" ON classes;
CREATE POLICY "insert_classes" ON classes
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS "update_classes" ON classes;
CREATE POLICY "update_classes" ON classes
  FOR UPDATE TO authenticated
  USING (
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
  WITH CHECK (
    get_my_role() = 'admin'
    OR (
      get_my_role() = 'teacher'
      AND EXISTS (
        SELECT 1 FROM teacherclasses tc
        JOIN profiles p ON p.teacher_id = tc.teacher_id
        WHERE tc.class_id = classes.id AND p.id = auth.uid()
      )
    )
  );

-- ─────────────────────────────────────────────────────────────
-- classstudents
-- ─────────────────────────────────────────────────────────────
ALTER TABLE classstudents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_classstudents" ON classstudents;
CREATE POLICY "select_classstudents" ON classstudents
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT student_id FROM profiles WHERE profiles.id = auth.uid())
    OR get_my_role() IN ('admin', 'teacher')
  );

DROP POLICY IF EXISTS "insert_classstudents" ON classstudents;
CREATE POLICY "insert_classstudents" ON classstudents
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = (SELECT student_id FROM profiles WHERE profiles.id = auth.uid())
    OR get_my_role() IN ('admin', 'teacher')
  );

DROP POLICY IF EXISTS "delete_classstudents" ON classstudents;
CREATE POLICY "delete_classstudents" ON classstudents
  FOR DELETE TO authenticated
  USING (
    student_id = (SELECT student_id FROM profiles WHERE profiles.id = auth.uid())
    OR get_my_role() IN ('admin', 'teacher')
  );

-- ─────────────────────────────────────────────────────────────
-- teacherclasses
-- ─────────────────────────────────────────────────────────────
ALTER TABLE teacherclasses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_teacherclasses" ON teacherclasses;
CREATE POLICY "select_teacherclasses" ON teacherclasses
  FOR SELECT TO authenticated
  USING (
    teacher_id = (SELECT teacher_id FROM profiles WHERE profiles.id = auth.uid())
    OR get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "insert_teacherclasses" ON teacherclasses;
CREATE POLICY "insert_teacherclasses" ON teacherclasses
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'admin'
    OR (
      get_my_role() = 'teacher'
      AND teacher_id = (SELECT teacher_id FROM profiles WHERE profiles.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "delete_teacherclasses" ON teacherclasses;
CREATE POLICY "delete_teacherclasses" ON teacherclasses
  FOR DELETE TO authenticated
  USING (
    get_my_role() = 'admin'
    OR (
      get_my_role() = 'teacher'
      AND teacher_id = (SELECT teacher_id FROM profiles WHERE profiles.id = auth.uid())
    )
  );