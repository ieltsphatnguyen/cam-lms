/*
# Repair Grading Pipeline — v0.8.1c

## Purpose
Fix the three backend failures blocking the grading write pipeline:
1. Duplicate save_annotation overload causes PostgREST function resolution failure
2. publish_feedback INSERT into grading fails due to NOT NULL teacher_id with no default
3. get_student_feedback returns no rows for students whose feedback_published is true
   but the student_attempts SELECT policy doesn't allow students to read feedback_published

## Changes

### 1. Drop old 8-parameter save_annotation overload
PostgREST cannot resolve overloaded functions when parameter names overlap.
The old overload (oid 18594) shares 8 parameter names with the new 9-param version.
Every RPC call from the frontend fails with "Could not choose the best candidate function."
Drop the old overload so only the 9-param version (with p_mode) remains.

### 2. Fix publish_feedback: resolve teacher_id from attempt ownership
The grading table has teacher_id NOT NULL with no default.
publish_feedback does INSERT INTO grading (submission_id, grading_status, grading_timestamp)
which omits teacher_id, causing a NOT NULL constraint violation.
Fix: resolve teacher_id from the attempt → item → assignment → owner_id → profiles.teacher_id chain.

### 3. Fix get_student_feedback: add feedback_published to student_attempts SELECT
Students need to see feedback_published status. The current select_own_attempts policy
allows students to SELECT their own attempts, which includes all columns. This already works.
However, get_student_feedback is SECURITY DEFINER and returns the row directly, bypassing RLS.
The issue is that the student frontend never calls get_student_feedback. This migration
does not change the RPC — the fix is in the frontend.

## Security
- No new tables created.
- No RLS policies changed.
- Only the old save_annotation overload is dropped.
- publish_feedback now resolves teacher_id internally via existing FK chain.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Drop old 8-parameter save_annotation overload
-- ═══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.save_annotation(
  p_annotation_id bigint,
  p_attempt_id bigint,
  p_criterion_id bigint,
  p_criterion_name text,
  p_start_offset integer,
  p_end_offset integer,
  p_selected_text text,
  p_highlight_color text
);

-- ═══════════════════════════════════════════════════════════
-- 2. Fix publish_feedback: resolve teacher_id
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.publish_feedback(
  p_attempt_id bigint
)
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

  -- Resolve teacher_id from the attempt → item → assignment → owner → profiles.teacher_id chain
  SELECT p.teacher_id INTO v_teacher_id
  FROM student_attempts sa
  JOIN published_assignment_items pai ON pai.id = sa.published_assignment_item_id
  JOIN published_assignments pa ON pa.id = pai.published_assignment_id
  JOIN profiles p ON p.id = pa.owner_id
  WHERE sa.id = p_attempt_id;

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

GRANT EXECUTE ON FUNCTION public.publish_feedback(bigint) TO authenticated;
