/*
# Fix request_revision to upsert grading row

## Problem
The `request_revision` RPC uses a bare `UPDATE grading SET grading_status = 'revision_requested' WHERE submission_id = p_attempt_id`.
If no grading row exists yet for the attempt (e.g. teacher requests revision before any grading record was created),
the UPDATE silently affects 0 rows and `grading_status` is never set to `'revision_requested'`.

The `publish_feedback` RPC already uses a SELECT-then-INSERT-or-UPDATE pattern (upsert).
This migration makes `request_revision` consistent with that pattern.

## Changes
1. Replaces `request_revision` with a version that:
   - SELECTs the grading row by submission_id
   - If found: UPDATEs grading_status to 'revision_requested'
   - If not found: INSERTs a new grading row with grading_status = 'revision_requested'
   - Resolves teacher_id from the assignment owner chain (same as publish_feedback)
   - Preserves all existing behaviour: revision_requested flag, revision_notes, student notification

## Security
- SECURITY DEFINER, search_path = 'public' (unchanged)
- Authorization via can_annotate_attempt (unchanged)
- No RLS or policy changes

## Important Notes
1. This is a backwards-compatible change — existing grading rows are updated, missing ones are created.
2. No data is lost or deleted.
3. The notification link and type are unchanged from migration 044.
*/

CREATE OR REPLACE FUNCTION public.request_revision(
  p_attempt_id bigint,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_profile_id uuid;
  v_teacher_id uuid;
  v_teacher_db_id bigint;
  v_item_id bigint;
  v_assignment_id bigint;
  v_class_id bigint;
  v_grading_id bigint;
BEGIN
  IF NOT can_annotate_attempt(p_attempt_id) THEN
    RAISE EXCEPTION 'Not authorized to request revision for this attempt';
  END IF;

  SELECT student_profile_id, published_assignment_item_id
  INTO v_student_profile_id, v_item_id
  FROM student_attempts WHERE id = p_attempt_id;

  IF v_student_profile_id IS NULL THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;

  -- Resolve assignment + class for link
  SELECT pai.published_assignment_id, pa.class_id
  INTO v_assignment_id, v_class_id
  FROM published_assignment_items pai
  JOIN published_assignments pa ON pa.id = pai.published_assignment_id
  WHERE pai.id = v_item_id;

  v_teacher_id := auth.uid();

  -- Mark revision requested
  UPDATE student_attempts
  SET revision_requested = true, revision_notes = p_notes
  WHERE id = p_attempt_id;

  -- Resolve teacher DB id for grading row FK (teacher_id references teachers.id, not auth.users.id)
  SELECT t.id
  INTO v_teacher_db_id
  FROM teachers t
  JOIN profiles p ON p.teacher_id = t.id
  WHERE p.id = v_teacher_id
  LIMIT 1;

  -- If no teacher profile link found, fall back to the assignment owner's teacher id
  IF v_teacher_db_id IS NULL THEN
    SELECT t.id
    INTO v_teacher_db_id
    FROM published_assignments pa
    JOIN profiles p ON p.id = pa.owner_id
    JOIN teachers t ON t.id = p.teacher_id
    WHERE pa.id = v_assignment_id
    LIMIT 1;
  END IF;

  -- Upsert grading row (consistent with publish_feedback pattern)
  SELECT id INTO v_grading_id FROM grading WHERE submission_id = p_attempt_id LIMIT 1;
  IF v_grading_id IS NOT NULL THEN
    UPDATE grading
    SET grading_status = 'revision_requested', grading_timestamp = now()
    WHERE id = v_grading_id;
  ELSE
    INSERT INTO grading (submission_id, teacher_id, grading_status, grading_timestamp)
    VALUES (p_attempt_id, COALESCE(v_teacher_db_id, 0), 'revision_requested', now());
  END IF;

  -- Notify student
  INSERT INTO notifications (recipient_id, sender_id, type, title, body, link)
  VALUES (
    v_student_profile_id,
    v_teacher_id,
    'revision_requested',
    'Revision Requested',
    COALESCE(p_notes, 'Your teacher has requested a revision for your submission.'),
    '/student-assignment-detail?assignmentId=' || v_assignment_id
  );
END;
$function$;
