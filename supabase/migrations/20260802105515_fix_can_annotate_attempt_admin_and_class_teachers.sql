-- Fix can_annotate_attempt() to authorize:
-- 1. The assignment owner (existing behavior)
-- 2. Admins (profiles.role = 'admin')
-- 3. Teachers assigned to the class (via teacherclasses)
--
-- The old function ONLY checked pa.owner_id = auth.uid(), which meant
-- non-owner teachers and admins got "Not authorized" errors.

CREATE OR REPLACE FUNCTION public.can_annotate_attempt(p_attempt_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM student_attempts sa
  JOIN published_assignment_items pai ON pai.id = sa.published_assignment_item_id
  JOIN published_assignments pa ON pa.id = pai.published_assignment_id
  LEFT JOIN profiles caller ON caller.id = auth.uid()
  LEFT JOIN teacherclasses tc ON tc.teacher_id = caller.teacher_id
                                   AND tc.class_id = pa.class_id
  WHERE sa.id = p_attempt_id
  AND (
    pa.owner_id = auth.uid()          -- assignment owner
    OR caller.role = 'admin'           -- admins can always annotate
    OR tc.teacher_id IS NOT NULL       -- teacher assigned to the class
  )
);
$function$;
