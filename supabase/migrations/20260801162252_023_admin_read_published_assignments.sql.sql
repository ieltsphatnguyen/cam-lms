/*
# Fix: Allow admins to read all published assignments

## Problem
The select_published RLS policy on published_assignments only allows
the owner or enrolled students to read rows. Admins get zero rows,
which means the Administrator → Assignments page shows no published
assignments.

## Fix
Drop and recreate the select_published policy to also allow
get_my_role() = 'admin'.
*/

ALTER TABLE published_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_published" ON published_assignments;
CREATE POLICY "select_published"
  ON published_assignments FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR get_my_role() = 'admin'
    OR class_id IN (
      SELECT cs.class_id
      FROM classstudents cs
      WHERE cs.student_id = (
        SELECT profiles.student_id
        FROM profiles
        WHERE profiles.id = auth.uid()
      )
    )
  );
