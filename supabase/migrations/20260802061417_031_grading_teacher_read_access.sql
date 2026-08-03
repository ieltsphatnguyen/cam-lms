/*
# Grading: teacher read access to student attempts + fix grading FK

Teachers need to read student_attempts for students in classes they teach.
The grading table's FK references the legacy studentsubmissions table;
redirect it to student_attempts which is where student work actually lives.
*/

-- 1. Fix grading FK: point to student_attempts instead of studentsubmissions
ALTER TABLE public.grading DROP CONSTRAINT IF EXISTS grading_submission_id_fkey;
ALTER TABLE public.grading ADD CONSTRAINT grading_submission_id_fkey
  FOREIGN KEY (submission_id) REFERENCES public.student_attempts(id) ON DELETE CASCADE;

-- 2. Enable RLS on grading
ALTER TABLE public.grading ENABLE ROW LEVEL SECURITY;

-- 3. Teachers can read student_attempts for items in classes they teach
CREATE POLICY "select_attempts_for_teachers" ON public.student_attempts
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'admin'
    OR published_assignment_item_id IN (
      SELECT pai.id FROM public.published_assignment_items pai
      JOIN public.published_assignments pa ON pa.id = pai.published_assignment_id
      WHERE pa.class_id IN (
        SELECT tc.class_id FROM public.teacherclasses tc
        WHERE tc.teacher_id = (SELECT profiles.teacher_id FROM public.profiles WHERE profiles.id = auth.uid())
      )
    )
  );

-- 4. Teachers can read grading rows for attempts in their classes
CREATE POLICY "select_grading_for_teachers" ON public.grading
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'admin'
    OR submission_id IN (
      SELECT sa.id FROM public.student_attempts sa
      JOIN public.published_assignment_items pai ON pai.id = sa.published_assignment_item_id
      JOIN public.published_assignments pa ON pa.id = pai.published_assignment_id
      WHERE pa.class_id IN (
        SELECT tc.class_id FROM public.teacherclasses tc
        WHERE tc.teacher_id = (SELECT profiles.teacher_id FROM public.profiles WHERE profiles.id = auth.uid())
      )
    )
  );

-- 5. Teachers can insert grading rows for attempts in their classes
CREATE POLICY "insert_grading_for_teachers" ON public.grading
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'admin'
    OR submission_id IN (
      SELECT sa.id FROM public.student_attempts sa
      JOIN public.published_assignment_items pai ON pai.id = sa.published_assignment_item_id
      JOIN public.published_assignments pa ON pa.id = pai.published_assignment_id
      WHERE pa.class_id IN (
        SELECT tc.class_id FROM public.teacherclasses tc
        WHERE tc.teacher_id = (SELECT profiles.teacher_id FROM public.profiles WHERE profiles.id = auth.uid())
      )
    )
  );

-- 6. Teachers can update grading rows for attempts in their classes
CREATE POLICY "update_grading_for_teachers" ON public.grading
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'admin'
    OR submission_id IN (
      SELECT sa.id FROM public.student_attempts sa
      JOIN public.published_assignment_items pai ON pai.id = sa.published_assignment_item_id
      JOIN public.published_assignments pa ON pa.id = pai.published_assignment_id
      WHERE pa.class_id IN (
        SELECT tc.class_id FROM public.teacherclasses tc
        WHERE tc.teacher_id = (SELECT profiles.teacher_id FROM public.profiles WHERE profiles.id = auth.uid())
      )
    )
  )
  WITH CHECK (
    get_my_role() = 'admin'
    OR submission_id IN (
      SELECT sa.id FROM public.student_attempts sa
      JOIN public.published_assignment_items pai ON pai.id = sa.published_assignment_item_id
      JOIN public.published_assignments pa ON pa.id = pai.published_assignment_id
      WHERE pa.class_id IN (
        SELECT tc.class_id FROM public.teacherclasses tc
        WHERE tc.teacher_id = (SELECT profiles.teacher_id FROM public.profiles WHERE profiles.id = auth.uid())
      )
    )
  );
