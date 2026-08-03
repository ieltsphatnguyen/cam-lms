/*
# Update start_attempt RPC

## Changes:
1. Return prep_time_seconds and recording_time_seconds in the result
2. If a submitted/auto_submitted attempt exists, return it as-is
   (do NOT create a new attempt — one item = one attempt)
3. Block starting if the student already has a finalized attempt
*/

CREATE OR REPLACE FUNCTION public.start_attempt(p_published_item_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_profile_id uuid := auth.uid();
  v_student_id bigint;
  v_item published_assignment_items%ROWTYPE;
  v_published published_assignments%ROWTYPE;
  v_class_id bigint;
  v_attempt_id bigint;
  v_existing_attempt_id bigint;
  v_existing_status text;
  v_time_limit_seconds integer;
  v_result json;
BEGIN
  IF v_student_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT can_current_user_access() THEN
    RAISE EXCEPTION 'Account access denied';
  END IF;

  SELECT student_id INTO v_student_id FROM profiles WHERE id = v_student_profile_id;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Only students can start attempts';
  END IF;

  SELECT * INTO v_item FROM published_assignment_items WHERE id = p_published_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  SELECT * INTO v_published FROM published_assignments WHERE id = v_item.published_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published assignment not found';
  END IF;

  v_class_id := v_published.class_id;

  IF NOT EXISTS (
    SELECT 1 FROM classstudents WHERE class_id = v_class_id AND student_id = v_student_id
  ) THEN
    RAISE EXCEPTION 'Not enrolled in this class';
  END IF;

  IF v_item.available_from IS NOT NULL AND v_item.available_from > now() THEN
    RAISE EXCEPTION 'Item not yet available';
  END IF;

  -- Check for ANY existing attempt (in_progress OR submitted OR auto_submitted)
  SELECT id, status INTO v_existing_attempt_id, v_existing_status
  FROM student_attempts
  WHERE published_assignment_item_id = p_published_item_id
    AND student_profile_id = v_student_profile_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_attempt_id IS NOT NULL THEN
    IF v_existing_status != 'in_progress' THEN
      -- Already submitted — return the finalized attempt (no new attempt)
      SELECT json_build_object(
        'attempt_id', sa.id,
        'started_at', sa.started_at,
        'time_limit_seconds', sa.time_limit_seconds,
        'response_type', sa.response_type,
        'status', sa.status,
        'submitted_at', sa.submitted_at,
        'already_submitted', true,
        'item', json_build_object(
          'id', v_item.id,
          'content', v_item.content,
          'type_id', v_item.type_id,
          'type_name', v_item.type_name,
          'response_type', v_item.response_type,
          'image_url', v_item.image_url,
          'custom_type_name', v_item.custom_type_name,
          'custom_instructions', v_item.custom_instructions,
          'category', v_item.category,
          'category_secondary', v_item.category_secondary,
          'tags', v_item.tags,
          'ielts_band', v_item.ielts_band,
          'description', v_item.description,
          'selection_order', v_item.selection_order,
          'available_from', v_item.available_from,
          'due_date', v_item.due_date,
          'timed', v_item.timed,
          'time_limit', v_item.time_limit,
          'prep_time_seconds', v_item.prep_time_seconds,
          'recording_time_seconds', v_item.recording_time_seconds
        )
      ) INTO v_result
      FROM student_attempts sa
      WHERE sa.id = v_existing_attempt_id;
      RETURN v_result;
    END IF;
    -- Resume existing in-progress attempt
    v_attempt_id := v_existing_attempt_id;
  ELSE
    -- Calculate time limit in seconds
    IF v_item.timed AND v_item.time_limit IS NOT NULL THEN
      v_time_limit_seconds := EXTRACT(EPOCH FROM v_item.time_limit)::integer;
    ELSE
      v_time_limit_seconds := NULL;
    END IF;

    INSERT INTO student_attempts (
      published_assignment_item_id,
      student_profile_id,
      status,
      time_limit_seconds,
      response_type
    ) VALUES (
      p_published_item_id,
      v_student_profile_id,
      'in_progress',
      v_time_limit_seconds,
      v_item.response_type
    )
    RETURNING id INTO v_attempt_id;
  END IF;

  -- Return attempt metadata + full question content
  SELECT json_build_object(
    'attempt_id', v_attempt_id,
    'started_at', sa.started_at,
    'time_limit_seconds', sa.time_limit_seconds,
    'response_type', sa.response_type,
    'status', sa.status,
    'already_submitted', false,
    'item', json_build_object(
      'id', v_item.id,
      'content', v_item.content,
      'type_id', v_item.type_id,
      'type_name', v_item.type_name,
      'response_type', v_item.response_type,
      'image_url', v_item.image_url,
      'custom_type_name', v_item.custom_type_name,
      'custom_instructions', v_item.custom_instructions,
      'category', v_item.category,
      'category_secondary', v_item.category_secondary,
      'tags', v_item.tags,
      'ielts_band', v_item.ielts_band,
      'description', v_item.description,
      'selection_order', v_item.selection_order,
      'available_from', v_item.available_from,
      'due_date', v_item.due_date,
      'timed', v_item.timed,
      'time_limit', v_item.time_limit,
      'prep_time_seconds', v_item.prep_time_seconds,
      'recording_time_seconds', v_item.recording_time_seconds
    )
  ) INTO v_result
  FROM student_attempts sa
  WHERE sa.id = v_attempt_id;

  RETURN v_result;
END;
$$;
