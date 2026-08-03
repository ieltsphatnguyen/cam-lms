/*
# Fix assignment ownership and visibility RLS

## published_assignments
- SELECT: owner OR admin OR enrolled student OR teacher of the class
- UPDATE: owner OR admin
- DELETE: owner OR admin

## published_assignment_items
- SELECT: same as published_assignments
- UPDATE: owner OR admin
- DELETE: owner OR admin
*/

-- ── published_assignments ──────────────────────────────────

DROP POLICY IF EXISTS "select_published" ON published_assignments;
CREATE POLICY "select_published" ON published_assignments
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR get_my_role() = 'admin'
    OR class_id IN (
      SELECT cs.class_id FROM classstudents cs
      WHERE cs.student_id = (SELECT student_id FROM profiles WHERE id = auth.uid())
    )
    OR class_id IN (
      SELECT tc.class_id FROM teacherclasses tc
      WHERE tc.teacher_id = (SELECT teacher_id FROM profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "update_published" ON published_assignments;
CREATE POLICY "update_published" ON published_assignments
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR get_my_role() = 'admin')
  WITH CHECK (owner_id = auth.uid() OR get_my_role() = 'admin');

DROP POLICY IF EXISTS "delete_published" ON published_assignments;
CREATE POLICY "delete_published" ON published_assignments
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR get_my_role() = 'admin');

DROP POLICY IF EXISTS "insert_published" ON published_assignments;
CREATE POLICY "insert_published" ON published_assignments
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- ── published_assignment_items ──────────────────────────────

DROP POLICY IF EXISTS "select_published_items" ON published_assignment_items;
CREATE POLICY "select_published_items" ON published_assignment_items
  FOR SELECT TO authenticated
  USING (
    published_assignment_id IN (
      SELECT pa.id FROM published_assignments pa
      WHERE pa.owner_id = auth.uid()
        OR get_my_role() = 'admin'
        OR pa.class_id IN (
          SELECT cs.class_id FROM classstudents cs
          WHERE cs.student_id = (SELECT student_id FROM profiles WHERE id = auth.uid())
        )
        OR pa.class_id IN (
          SELECT tc.class_id FROM teacherclasses tc
          WHERE tc.teacher_id = (SELECT teacher_id FROM profiles WHERE id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "update_published_items" ON published_assignment_items;
CREATE POLICY "update_published_items" ON published_assignment_items
  FOR UPDATE TO authenticated
  USING (
    published_assignment_id IN (
      SELECT pa.id FROM published_assignments pa
      WHERE pa.owner_id = auth.uid() OR get_my_role() = 'admin'
    )
  )
  WITH CHECK (
    published_assignment_id IN (
      SELECT pa.id FROM published_assignments pa
      WHERE pa.owner_id = auth.uid() OR get_my_role() = 'admin'
    )
  );

DROP POLICY IF EXISTS "delete_published_items" ON published_assignment_items;
CREATE POLICY "delete_published_items" ON published_assignment_items
  FOR DELETE TO authenticated
  USING (
    published_assignment_id IN (
      SELECT pa.id FROM published_assignments pa
      WHERE pa.owner_id = auth.uid() OR get_my_role() = 'admin'
    )
  );

DROP POLICY IF EXISTS "insert_published_items" ON published_assignment_items;
CREATE POLICY "insert_published_items" ON published_assignment_items
  FOR INSERT TO authenticated
  WITH CHECK (
    published_assignment_id IN (
      SELECT pa.id FROM published_assignments pa
      WHERE pa.owner_id = auth.uid() OR get_my_role() = 'admin'
    )
  );
