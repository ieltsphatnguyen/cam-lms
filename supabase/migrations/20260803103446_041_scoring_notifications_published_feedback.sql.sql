/*
# Scoring, Notifications & Published Feedback Workflow (v0.9.0)

## Overview
This migration introduces the complete IELTS scoring workflow, notification system,
and published feedback lifecycle. Students receive teacher feedback, criterion scores,
overall band, teacher comments, and annotations ONLY after teachers publish.

## 1. New Table: criterion_scores
Stores per-criterion scores (0.0–9.0 or NULL) for each student attempt.
- `id` — bigint PK
- `attempt_id` — FK to student_attempts
- `criterion_id` — FK to rubric_criteria
- `score` — numeric(3,1), nullable (NULL = not yet scored)
- `created_at`, `updated_at` — timestamps
- Unique constraint on (attempt_id, criterion_id)

## 2. New Table: published_score_snapshots
Immutable snapshot of criterion scores + overall band at publish time.
Students read from this table — never from live criterion_scores.
- `id` — bigint PK
- `attempt_id` — FK to student_attempts
- `criterion_id` — bigint (not FK — source may change)
- `criterion_name` — text
- `score` — numeric(3,1), nullable
- `overall_band_score` — numeric(3,1), nullable
- `published_at` — timestamptz
- `published_by` — uuid FK to auth.users

## 3. New Table: notifications
Dashboard notifications for teachers and students.
- `id` — bigint PK
- `recipient_id` — uuid (the user who receives the notification)
- `sender_id` — uuid nullable (the user who triggered it)
- `type` — text (e.g. 'new_submission', 'resubmission', 'ready_to_publish',
  'feedback_published', 'revision_requested', 'feedback_updated')
- `title` — text
- `body` — text nullable
- `link` — text nullable (URL path for navigation)
- `read` — boolean default false
- `created_at` — timestamptz

## 4. Altered Table: student_attempts
- Added `revision_requested` boolean default false
- Added `revision_notes` text nullable

## 5. Altered Table: grading
- `grading_status` now supports 'revision_requested' value

## 6. New RPCs
- save_criterion_score(attempt_id, criterion_id, score) — insert/update criterion score
- get_criterion_scores(attempt_id) — teacher: fetch live criterion scores
- get_published_scores(attempt_id) — student: fetch published score snapshots
- request_revision(attempt_id, notes) — teacher: mark revision requested, notify student
- get_notifications(recipient_id) — fetch notifications for a user
- mark_notification_read(id) — mark a notification as read
- mark_all_notifications_read(recipient_id) — mark all as read
- compute_overall_band(attempt_id) — calculate overall band from criterion scores

## 7. Updated RPC: publish_feedback
Now also snapshots criterion scores + overall band into published_score_snapshots,
and creates a 'feedback_published' notification for the student.

## 8. Triggers
- After student submits (submit_attempt): create 'new_submission' notification for teacher
- After publish_feedback: create 'feedback_published' notification for student
- After request_revision: create 'revision_requested' notification for student

## 9. RLS
- criterion_scores: teacher CRUD via can_annotate_attempt; student SELECT via owns_attempt
- published_score_snapshots: student SELECT only when feedback_published = true
- notifications: users can only see/manage their own notifications (recipient_id = auth.uid())
*/

-- ══════════════════════════════════════════════════════════════
-- 1. criterion_scores table
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS criterion_scores (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id bigint NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
  criterion_id bigint NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
  score numeric(3,1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE criterion_scores ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_criterion_scores_unique ON criterion_scores(attempt_id, criterion_id);
CREATE INDEX IF NOT EXISTS idx_criterion_scores_attempt ON criterion_scores(attempt_id);

DROP POLICY IF EXISTS "select_criterion_scores" ON criterion_scores;
CREATE POLICY "select_criterion_scores" ON criterion_scores FOR SELECT
  TO authenticated USING (can_annotate_attempt(attempt_id) OR owns_attempt(attempt_id));

DROP POLICY IF EXISTS "insert_criterion_scores" ON criterion_scores;
CREATE POLICY "insert_criterion_scores" ON criterion_scores FOR INSERT
  TO authenticated WITH CHECK (can_annotate_attempt(attempt_id));

DROP POLICY IF EXISTS "update_criterion_scores" ON criterion_scores;
CREATE POLICY "update_criterion_scores" ON criterion_scores FOR UPDATE
  TO authenticated USING (can_annotate_attempt(attempt_id))
  WITH CHECK (can_annotate_attempt(attempt_id));

DROP POLICY IF EXISTS "delete_criterion_scores" ON criterion_scores;
CREATE POLICY "delete_criterion_scores" ON criterion_scores FOR DELETE
  TO authenticated USING (can_annotate_attempt(attempt_id));

-- ══════════════════════════════════════════════════════════════
-- 2. published_score_snapshots table
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS published_score_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id bigint NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
  criterion_id bigint,
  criterion_name text,
  score numeric(3,1),
  overall_band_score numeric(3,1),
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES auth.users(id)
);

ALTER TABLE published_score_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pub_score_snapshots_attempt ON published_score_snapshots(attempt_id);

DROP POLICY IF EXISTS "select_published_score_snapshots" ON published_score_snapshots;
CREATE POLICY "select_published_score_snapshots" ON published_score_snapshots FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM student_attempts sa
      WHERE sa.id = attempt_id
      AND sa.student_profile_id = auth.uid()
      AND sa.feedback_published = true
    )
  );

-- ══════════════════════════════════════════════════════════════
-- 3. notifications table
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_id uuid NOT NULL,
  sender_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(recipient_id, read);

DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications FOR SELECT
  TO authenticated USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE
  TO authenticated USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE
  TO authenticated USING (recipient_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- 4. Alter student_attempts: add revision columns
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'student_attempts' AND column_name = 'revision_requested'
  ) THEN
    ALTER TABLE student_attempts ADD COLUMN revision_requested boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'student_attempts' AND column_name = 'revision_notes'
  ) THEN
    ALTER TABLE student_attempts ADD COLUMN revision_notes text;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- 5. RPC: save_criterion_score
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.save_criterion_score(
  p_attempt_id bigint,
  p_criterion_id bigint,
  p_score numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT can_annotate_attempt(p_attempt_id) THEN
    RAISE EXCEPTION 'Not authorized to score this attempt';
  END IF;

  IF p_score IS NOT NULL AND (p_score < 0 OR p_score > 9) THEN
    RAISE EXCEPTION 'Score must be between 0.0 and 9.0';
  END IF;

  INSERT INTO criterion_scores (attempt_id, criterion_id, score, updated_at)
  VALUES (p_attempt_id, p_criterion_id, p_score, now())
  ON CONFLICT (attempt_id, criterion_id)
  DO UPDATE SET score = EXCLUDED.score, updated_at = now();
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- 6. RPC: get_criterion_scores (teacher)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_criterion_scores(p_attempt_id bigint)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT COALESCE(json_agg(json_build_object(
  'id', cs.id,
  'attempt_id', cs.attempt_id,
  'criterion_id', cs.criterion_id,
  'score', cs.score
)), '[]'::json)
FROM criterion_scores cs
WHERE cs.attempt_id = p_attempt_id;
$function$;

-- ══════════════════════════════════════════════════════════════
-- 7. RPC: get_published_scores (student)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_published_scores(p_attempt_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM student_attempts
    WHERE id = p_attempt_id
    AND student_profile_id = auth.uid()
    AND feedback_published = true
  ) THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'id', s.id,
    'criterion_id', s.criterion_id,
    'criterion_name', s.criterion_name,
    'score', s.score,
    'overall_band_score', s.overall_band_score
  )), '[]'::json)
  INTO result
  FROM published_score_snapshots s
  WHERE s.attempt_id = p_attempt_id;

  RETURN result;
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- 8. RPC: compute_overall_band
-- IELTS rounding: average of 4 criteria, rounded to nearest 0.5
-- (standard IELTS .25/.75 rounding to nearest 0.5)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_overall_band(p_attempt_id bigint)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_avg numeric;
  v_count integer;
  v_scores numeric[];
  v_rounded numeric;
BEGIN
  SELECT array_agg(score), count(*)
  INTO v_scores, v_count
  FROM criterion_scores
  WHERE attempt_id = p_attempt_id
  AND score IS NOT NULL;

  IF v_count = 0 OR v_count < 4 THEN
    RETURN NULL;
  END IF;

  SELECT avg(x) INTO v_avg FROM unnest(v_scores) AS x;

  -- IELTS rounding: .25 rounds up to .5, .75 rounds up to next whole
  -- .00 stays, .25→.5, .5 stays, .75→next whole
  v_rounded := floor(v_avg);
  IF v_avg - v_rounded < 0.125 THEN
    v_rounded := v_rounded;
  ELSIF v_avg - v_rounded < 0.375 THEN
    v_rounded := v_rounded + 0.5;
  ELSIF v_avg - v_rounded < 0.625 THEN
    v_rounded := v_rounded + 0.5;
  ELSIF v_avg - v_rounded < 0.875 THEN
    v_rounded := v_rounded + 1.0;
  ELSE
    v_rounded := v_rounded + 1.0;
  END IF;

  RETURN v_rounded;
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- 9. RPC: request_revision
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

  -- Update grading status
  UPDATE grading SET grading_status = 'revision_requested', grading_timestamp = now()
  WHERE submission_id = p_attempt_id;

  -- Notify student
  INSERT INTO notifications (recipient_id, sender_id, type, title, body, link)
  VALUES (
    v_student_profile_id,
    v_teacher_id,
    'revision_requested',
    'Revision Requested',
    COALESCE(p_notes, 'Your teacher has requested a revision for your submission.'),
    '/student/assignments'
  );
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- 10. RPC: get_notifications
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_notifications(p_recipient_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT COALESCE(json_agg(json_build_object(
  'id', id,
  'recipient_id', recipient_id,
  'sender_id', sender_id,
  'type', type,
  'title', title,
  'body', body,
  'link', link,
  'read', read,
  'created_at', created_at
) ORDER BY created_at DESC), '[]'::json)
FROM notifications
WHERE recipient_id = p_recipient_id;
$function$;

-- ══════════════════════════════════════════════════════════════
-- 11. RPC: mark_notification_read
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE id = p_notification_id AND recipient_id = auth.uid()) THEN
    RAISE EXCEPTION 'Notification not found or not owned';
  END IF;
  UPDATE notifications SET read = true WHERE id = p_notification_id;
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- 12. RPC: mark_all_notifications_read
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(p_recipient_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_recipient_id != auth.uid() THEN
    RAISE EXCEPTION 'Can only mark your own notifications';
  END IF;
  UPDATE notifications SET read = true WHERE recipient_id = p_recipient_id AND read = false;
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- 13. RPC: notify_teacher_of_submission
-- Called after student submits an attempt
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

  -- Check if this is a resubmission (revision was requested)
  SELECT revision_requested INTO v_is_resubmission
  FROM student_attempts WHERE id = p_attempt_id;

  -- Get student name
  SELECT display_name INTO v_student_name
  FROM profiles WHERE id = v_student_profile_id;

  IF v_is_resubmission THEN
    INSERT INTO notifications (recipient_id, sender_id, type, title, body, link)
    VALUES (
      v_owner_id, v_student_profile_id, 'resubmission',
      'Resubmission Received',
      COALESCE(v_student_name, 'A student') || ' has resubmitted their work for ' || COALESCE(v_assignment_name, 'an assignment') || '.',
      '/grading'
    );
  ELSE
    INSERT INTO notifications (recipient_id, sender_id, type, title, body, link)
    VALUES (
      v_owner_id, v_student_profile_id, 'new_submission',
      'New Submission',
      COALESCE(v_student_name, 'A student') || ' has submitted their work for ' || COALESCE(v_assignment_name, 'an assignment') || '.',
      '/grading'
    );
  END IF;
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- 14. Updated publish_feedback — now snapshots scores + notifies
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

  SELECT student_profile_id, published_assignment_item_id
  INTO v_student_profile_id, v_item_id
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

  -- Notify student
  INSERT INTO notifications (recipient_id, sender_id, type, title, body, link)
  VALUES (
    v_student_profile_id, v_published_by, 'feedback_published',
    'Teacher Published Feedback',
    'Your teacher has published feedback for ' || COALESCE(v_assignment_name, 'your submission') || '.',
    '/student/assignments'
  );
END;
$function$;
