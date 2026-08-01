/*
# Fix: Allow admins to read published_assignment_items

## Problem
The select_published_items policy on published_assignment_items
only allows owners or enrolled students. Admins get zero rows.

## Fix
Drop and recreate the policy to also allow get_my_role() = 'admin'.
*/

ALTER TABLE published_assignment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_published_items" ON published_assignment_items;
CREATE POLICY "select_published_items"
  ON published_assignment_items FOR SELECT
  TO authenticated
  USING (
    published_assignment_id IN (
      SELECT published_assignments.id
      FROM published_assignments
      WHERE
        published_assignments.owner_id = auth.uid()
        OR get_my_role() = 'admin'
        OR published_assignments.class_id IN (
          SELECT cs.class_id
          FROM classstudents cs
          WHERE cs.student_id = (
            SELECT profiles.student_id
            FROM profiles
            WHERE profiles.id = auth.uid()
          )
        )
    )
  );
