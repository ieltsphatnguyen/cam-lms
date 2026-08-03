/*
# Notification Workflow Repairs (v0.9.1)

## Fixes
1. Fix broken notification links:
   - Teacher: '/grading' → '/teacher-grading'
   - Student: '/student/assignments' → '/student-assignments'
2. Add 'feedback_updated' notification type — when teacher re-publishes feedback
   (feedback_published was already true), emit 'feedback_updated' instead of
   a duplicate 'feedback_published'.
3. Move notify_teacher_of_submission into submit_attempt RPC for reliability —
   eliminates the fire-and-forget client-side call that could miss if the
   client dies between submit and notify.
*/

-- ══════════════════════════════════════════════════════════════
-- 1. Fix notify_teacher_of_submission link
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_teacher_of_submission(p_attempt_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_profile_id uuid;
  v_item_id bigint;
  v_assignment_id bigint;
  v_class_id bigint;
  v_owner_id uuid;
  v_student_name text;
  v_assignment_name text;
  v_is_resubmission boolean;
BEGIN
  SELECT student_profile_id, published_assignment_item_id
  INTO v_student_profile_id, v_item_id
  FROM student_attempts WHERE id = p_attempt_id;

  IF v_student_profile_id IS NULL THEN RETURN; END IF;

  SELECT pai.published_assignment_id, pa.class_id, pa.owner_id, pa.name
  INTO v_assignment_id, v_class_id, v_owner_id, v_assignment_name
  FROM published_assignment_items pai
  JOIN published_assignments pa ON pa.id = pai.published_assignment_id
  WHERE pai.id = v_item_id;

  IF v_owner_id IS NULL THEN RETURN; END IF;

  SELECT revision_requested INTO v_is_resubmission
  FROM student_attempts WHERE id = p_attempt_id;

  SELECT display_name INTO v_student_name
  FROM profiles WHERE id = v_student_profile_id;

  IF v_is_resubmission THEN
    INSERT INTO notifications (recipient_id, sender_id, type, title, body, link)
    VALUES (
      v_owner_id, v_student_profile_id, 'resubmission',
      'Resubmission Received',
      COALESCE(v_student_name, 'A student') || ' has resubmitted their work for ' || COALESCE(v_assignment_name, 'an assignment') || '.',
      '/teacher-grading'
    );
  ELSE
    INSERT INTO notifications (recipient_id, sender_id, type, title, body, link)
    VALUES (
      v_owner_id, v_student_profile_id, 'new_submission',
      'New Submission',
      COALESCE(v_student_name, 'A student') || ' has submitted their work for ' || COALESCE(v_assignment_name, 'an assignment') || '.',
      '/teacher-grading'
    );
  END IF;
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- 2. Fix request_revision link
-- ══════════════════════════════════════════════════════════════

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
  v_item_id bigint;
  v_assignment_id bigint;
  v_class_id bigint;
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

  SELECT pai.published_assignment_id, pa.class_id
  INTO v_assignment_id, v_class_id
  FROM published_assignment_items pai
  JOIN published_assignments pa ON pa.id = pai.published_assignment_id
  WHERE pai.id = v_item_id;

  v_teacher_id := auth.uid();

  UPDATE student_attempts
  SET revision_requested = true, revision_notes = p_notes
  WHERE id = p_attempt_id;

  UPDATE grading SET grading_status = 'revision_requested', grading_timestamp = now()
  WHERE submission_id = p_attempt_id;

  INSERT INTO notifications (recipient_id, sender_id, type, title, body, link)
  VALUES (
    v_student_profile_id,
    v_teacher_id,
    'revision_requested',
    'Revision Requested',
    COALESCE(p_notes, 'Your teacher has requested a revision for your submission.'),
    '/student-assignments'
  );
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- 3. Fix publish_feedback — emit feedback_updated on re-publish + fix link
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.publish_feedback(p_attempt_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grading_id bigint;
  v_teacher_id bigint;
  v_published_by uuid;
  v_student_profile_id uuid;
  v_overall_band numeric;
  v_item_id bigint;
  v_assignment_id bigint;
  v_assignment_name text;
  v_was_published boolean;
  v_notif_type text;
  v_notif_title text;
BEGIN
  IF NOT can_annotate_attempt(p_attempt_id) THEN
    RAISE EXCEPTION 'Not authorized to publish feedback for this attempt';
  END IF;

  SELECT p.teacher_id INTO v_teacher_id FROM profiles p WHERE p.id = auth.uid();
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

  v_published_by := auth.uid();

  SELECT student_profile_id, published_assignment_item_id, feedback_published
  INTO v_student_profile_id, v_item_id, v_was_published
  FROM student_attempts WHERE id = p_attempt_id;

  -- Snapshot annotations + comments
  DELETE FROM published_annotation_snapshots WHERE attempt_id = p_attempt_id;
  INSERT INTO published_annotation_snapshots (
    attempt_id, annotation_id, criterion_id, criterion_name,
    start_offset, end_offset, selected_text, highlight_color,
    format_bold, format_italic, format_underline, format_strikethrough, text_color,
    comments, published_by
  )
  SELECT
    p_attempt_id, a.id, a.criterion_id, a.criterion_name,
    a.start_offset, a.end_offset, a.selected_text, a.highlight_color,
    a.format_bold, a.format_italic, a.format_underline, a.format_strikethrough, a.text_color,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'type', c.type, 'content', c.content,
        'audio_path', c.audio_path, 'created_at', c.created_at
      ))
      FROM annotation_comments c WHERE c.annotation_id = a.id
    ), '[]'::jsonb),
    v_published_by
  FROM annotations a WHERE a.attempt_id = p_attempt_id;

  -- Snapshot text formats
  DELETE FROM published_text_format_snapshots WHERE attempt_id = p_attempt_id;
  INSERT INTO published_text_format_snapshots (
    attempt_id, start_offset, end_offset,
    format_bold, format_italic, format_underline, format_strikethrough, published_by
  )
  SELECT p_attempt_id, tf.start_offset, tf.end_offset,
    tf.format_bold, tf.format_italic, tf.format_underline, tf.format_strikethrough, v_published_by
  FROM text_formats tf WHERE tf.attempt_id = p_attempt_id;

  -- Compute overall band
  v_overall_band := public.compute_overall_band(p_attempt_id);

  -- Snapshot criterion scores + overall band
  DELETE FROM published_score_snapshots WHERE attempt_id = p_attempt_id;
  INSERT INTO published_score_snapshots (
    attempt_id, criterion_id, criterion_name, score, overall_band_score, published_by
  )
  SELECT
    p_attempt_id, cs.criterion_id, rc.name, cs.score, v_overall_band, v_published_by
  FROM criterion_scores cs
  JOIN rubric_criteria rc ON rc.id = cs.criterion_id
  WHERE cs.attempt_id = p_attempt_id;

  -- Mark feedback as published, clear revision flag
  UPDATE student_attempts
  SET feedback_published = true, revision_requested = false, revision_notes = NULL
  WHERE id = p_attempt_id;

  -- Create or update grading record
  SELECT id INTO v_grading_id FROM grading WHERE submission_id = p_attempt_id LIMIT 1;
  IF v_grading_id IS NOT NULL THEN
    UPDATE grading SET grading_status = 'completed', grading_timestamp = now(),
      teacher_id = v_teacher_id, overall_band_score = v_overall_band
    WHERE id = v_grading_id;
  ELSE
    INSERT INTO grading (submission_id, teacher_id, grading_status, grading_timestamp, overall_band_score)
    VALUES (p_attempt_id, v_teacher_id, 'completed', now(), v_overall_band);
  END IF;

  -- Resolve assignment name for notification
  SELECT pa.name INTO v_assignment_name
  FROM published_assignment_items pai
  JOIN published_assignments pa ON pa.id = pai.published_assignment_id
  WHERE pai.id = v_item_id;

  -- Determine notification type: first publish vs re-publish
  IF v_was_published THEN
    v_notif_type := 'feedback_updated';
    v_notif_title := 'Teacher Updated Feedback';
  ELSE
    v_notif_type := 'feedback_published';
    v_notif_title := 'Teacher Published Feedback';
  END IF;

  INSERT INTO notifications (recipient_id, sender_id, type, title, body, link)
  VALUES (
    v_student_profile_id, v_published_by, v_notif_type,
    v_notif_title,
    'Your teacher has published feedback for ' || COALESCE(v_assignment_name, 'your submission') || '.',
    '/student-assignments'
  );
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- 4. Update submit_attempt to call notify_teacher_of_submission internally
--    (replaces unreliable client-side fire-and-forget)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_attempt(
  p_attempt_id bigint,
  p_written_response text DEFAULT NULL,
  p_audio_path text DEFAULT NULL,
  p_word_count integer DEFAULT NULL,
  p_status text DEFAULT 'submitted'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt student_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt FROM student_attempts WHERE id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;

  IF v_attempt.student_profile_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to submit this attempt';
  END IF;

  IF v_attempt.status != 'in_progress' THEN
    RAISE EXCEPTION 'Attempt is not in progress (current status: %)', v_attempt.status;
  END IF;

  UPDATE student_attempts
  SET written_response = p_written_response,
      audio_path = p_audio_path,
      word_count = p_word_count,
      status = p_status,
      submitted_at = now()
  WHERE id = p_attempt_id;

  -- Notify the teacher of the submission (server-side, reliable)
  PERFORM public.notify_teacher_of_submission(p_attempt_id);

  RETURN p_attempt_id;
END;
$function$;
