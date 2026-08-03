-- Fix publish_feedback: resolve teacher_id from the actual grader (auth.uid()),
-- not from the assignment owner. The old code resolved from pa.owner_id → profiles.teacher_id,
-- which fails when an admin (who may not have a teacher_id) grades a non-owned attempt,
-- and incorrectly attributes grading to the owner instead of the actual grader.

CREATE OR REPLACE FUNCTION public.publish_feedback(p_attempt_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_grading_id bigint;
v_teacher_id bigint;
BEGIN
IF NOT can_annotate_attempt(p_attempt_id) THEN
RAISE EXCEPTION 'Not authorized to publish feedback for this attempt';
END IF;

-- Resolve teacher_id from the actual grader (auth.uid())
SELECT p.teacher_id INTO v_teacher_id
FROM profiles p
WHERE p.id = auth.uid();

-- Fallback: if the grader has no teacher_id (e.g. pure admin),
-- resolve from the assignment owner
IF v_teacher_id IS NULL THEN
  SELECT p.teacher_id INTO v_teacher_id
  FROM student_attempts sa
  JOIN published_assignment_items pai ON pai.id = sa.published_assignment_item_id
  JOIN published_assignments pa ON pa.id = pai.published_assignment_id
  JOIN profiles p ON p.id = pa.owner_id
  WHERE sa.id = p_attempt_id;
END IF;

IF v_teacher_id IS NULL THEN
RAISE EXCEPTION 'Could not resolve teacher for this attempt';
END IF;

-- Mark feedback as published
UPDATE student_attempts SET feedback_published = true WHERE id = p_attempt_id;

-- Create or update grading record
SELECT id INTO v_grading_id FROM grading WHERE submission_id = p_attempt_id LIMIT 1;

IF v_grading_id IS NOT NULL THEN
UPDATE grading
SET grading_status = 'completed',
grading_timestamp = now(),
teacher_id = v_teacher_id
WHERE id = v_grading_id;
ELSE
INSERT INTO grading (submission_id, teacher_id, grading_status, grading_timestamp)
VALUES (p_attempt_id, v_teacher_id, 'completed', now());
END IF;
END;
$function$;
