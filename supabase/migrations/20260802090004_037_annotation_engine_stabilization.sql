/*
# Annotation Engine Stabilization

## Purpose
Fix annotation creation failures, enable teacher feedback/transcript saving,
and add feedback publishing workflow.

## Changes

### 1. Fix save_annotation RPC
The original save_annotation RPC used DEFAULT NULL for p_annotation_id.
When the Supabase JS client calls an RPC, it sends all parameters as named
arguments. If p_annotation_id is omitted, the client may still send it as
null, causing the UPDATE branch to execute instead of the INSERT branch.

Fix: Add an explicit p_mode parameter ('create' | 'update') to disambiguate.
This makes the intent explicit regardless of how the client sends nulls.

### 2. New RPC: save_feedback
Teachers cannot update student_attempts due to RLS (only the student owner can).
This SECURITY DEFINER function allows the teacher who owns the published
assignment to save feedback text on the student's attempt.

### 3. New RPC: save_transcript
Same pattern as save_feedback — allows the teacher to save a transcript
on the student's attempt.

### 4. New RPC: publish_feedback
Sets the feedback as published, making it visible to the student.
Adds a feedback_published boolean column to student_attempts.
Also creates/updates a grading record with grading_status = 'completed'
so the assignment shows as "graded" in the student dashboard.

### 5. New column: student_attempts.feedback_published
Boolean, defaults to false. When true, students can see the feedback.

### 6. New RPC: get_student_feedback
Allows a student to read their own feedback ONLY when feedback_published = true.

## Security
- All new RPCs are SECURITY DEFINER with search_path = public.
- save_feedback, save_transcript, publish_feedback all verify the caller
  is the teacher who owns the published assignment via can_annotate_attempt().
- get_student_feedback verifies the caller owns the attempt AND feedback is published.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Add feedback_published column to student_attempts
-- ═══════════════════════════════════════════════════════════
ALTER TABLE student_attempts ADD COLUMN IF NOT EXISTS feedback_published boolean DEFAULT false;

-- ═══════════════════════════════════════════════════════════
-- 2. Fix save_annotation RPC — add explicit p_mode parameter
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.save_annotation(
  p_mode text DEFAULT 'create',
  p_annotation_id bigint DEFAULT NULL,
  p_attempt_id bigint DEFAULT NULL,
  p_criterion_id bigint DEFAULT NULL,
  p_criterion_name text DEFAULT NULL,
  p_start_offset int DEFAULT NULL,
  p_end_offset int DEFAULT NULL,
  p_selected_text text DEFAULT NULL,
  p_highlight_color text DEFAULT 'green'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id bigint;
  v_attempt_id bigint;
BEGIN
  v_attempt_id := COALESCE(p_attempt_id, (SELECT attempt_id FROM annotations WHERE id = p_annotation_id));
  IF NOT can_annotate_attempt(v_attempt_id) THEN
    RAISE EXCEPTION 'Not authorized to annotate this attempt';
  END IF;

  IF p_mode = 'update' AND p_annotation_id IS NOT NULL THEN
    UPDATE annotations
    SET criterion_id = p_criterion_id,
        criterion_name = p_criterion_name,
        start_offset = p_start_offset,
        end_offset = p_end_offset,
        selected_text = p_selected_text,
        highlight_color = p_highlight_color,
        updated_at = now()
    WHERE id = p_annotation_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO annotations (attempt_id, criterion_id, criterion_name, start_offset, end_offset, selected_text, highlight_color)
    VALUES (p_attempt_id, p_criterion_id, p_criterion_name, p_start_offset, p_end_offset, p_selected_text, p_highlight_color)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_annotation(text, bigint, bigint, bigint, text, int, int, text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- 3. save_feedback RPC
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.save_feedback(
  p_attempt_id bigint,
  p_feedback text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT can_annotate_attempt(p_attempt_id) THEN
    RAISE EXCEPTION 'Not authorized to save feedback for this attempt';
  END IF;
  UPDATE student_attempts SET feedback = p_feedback WHERE id = p_attempt_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_feedback(bigint, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- 4. save_transcript RPC
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.save_transcript(
  p_attempt_id bigint,
  p_transcript text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT can_annotate_attempt(p_attempt_id) THEN
    RAISE EXCEPTION 'Not authorized to save transcript for this attempt';
  END IF;
  UPDATE student_attempts SET transcript = p_transcript WHERE id = p_attempt_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_transcript(bigint, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- 5. publish_feedback RPC
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
BEGIN
  IF NOT can_annotate_attempt(p_attempt_id) THEN
    RAISE EXCEPTION 'Not authorized to publish feedback for this attempt';
  END IF;

  -- Mark feedback as published
  UPDATE student_attempts SET feedback_published = true WHERE id = p_attempt_id;

  -- Create or update grading record
  SELECT id INTO v_grading_id FROM grading WHERE submission_id = p_attempt_id LIMIT 1;

  IF v_grading_id IS NOT NULL THEN
    UPDATE grading
    SET grading_status = 'completed',
        grading_timestamp = now()
    WHERE id = v_grading_id;
  ELSE
    INSERT INTO grading (submission_id, grading_status, grading_timestamp)
    VALUES (p_attempt_id, 'completed', now());
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.publish_feedback(bigint) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- 6. unpublish_feedback RPC (for Save Draft — feedback stays unpublished)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.unpublish_feedback(
  p_attempt_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT can_annotate_attempt(p_attempt_id) THEN
    RAISE EXCEPTION 'Not authorized to unpublish feedback for this attempt';
  END IF;
  UPDATE student_attempts SET feedback_published = false WHERE id = p_attempt_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.unpublish_feedback(bigint) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- 7. get_student_feedback RPC
-- ═══════════════════════════════════════════════════════════
-- Allows a student to read their own feedback + transcript only when published
CREATE OR REPLACE FUNCTION public.get_student_feedback(
  p_attempt_id bigint
)
RETURNS TABLE (
  feedback text,
  transcript text,
  feedback_published boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT feedback, transcript, feedback_published
  FROM student_attempts
  WHERE id = p_attempt_id
    AND student_profile_id = auth.uid()
    AND feedback_published = true;
$function$;

GRANT EXECUTE ON FUNCTION public.get_student_feedback(bigint) TO authenticated;
