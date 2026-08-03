/*
# Annotation Engine Schema

## Purpose
Transform CAM into an examiner workspace. Teachers can highlight mistakes,
organise evidence by criterion, and attach text/audio comments before grading.

## New Tables
1. rubric_criteria — IELTS assessment criteria per question type
2. annotations — independent annotation objects attached to student_attempts
3. annotation_comments — text/audio comments belonging to annotations

## Modified Tables
- student_attempts: ADD feedback (text), transcript (text)
- grading: ADD examiner_id (uuid), moderation_status (text)

## Storage
- Bucket 'annotation-audio' for audio comment recordings

## RLS
- rubric_criteria: readable by all authenticated (reference data)
- annotations: teacher-owner CRUD, student-owner SELECT
- annotation_comments: same access via parent annotation

## RPC Functions
- get_rubric_criteria(question_type_id) → criteria list
- get_attempt_annotations(attempt_id) → JSON with annotations + comments
- save_annotation(...) → create/update, returns id
- delete_annotation(annotation_id) → cascade delete
- move_annotation(annotation_id, criterion_id, color) → drag-drop
- save_annotation_comment(...) → create/update comment
- delete_annotation_comment(comment_id)
- get_assignment_status(assignment_id, profile_id) → per-item status

## Security
- All RPC functions are SECURITY DEFINER with search_path = public.
- Annotation CRUD verifies caller owns the published assignment.
- Students can read their own annotations but cannot modify them.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Sequences
-- ═══════════════════════════════════════════════════════════
CREATE SEQUENCE IF NOT EXISTS rubric_criteria_id_seq;
CREATE SEQUENCE IF NOT EXISTS annotations_id_seq;
CREATE SEQUENCE IF NOT EXISTS annotation_comments_id_seq;

-- ═══════════════════════════════════════════════════════════
-- 2. rubric_criteria table
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rubric_criteria (
  id bigint PRIMARY KEY DEFAULT nextval('rubric_criteria_id_seq'),
  question_type_id bigint NOT NULL REFERENCES questiontypes(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE rubric_criteria ADD CONSTRAINT rubric_criteria_question_type_id_name_key UNIQUE (question_type_id, name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_rubric_criteria_type ON rubric_criteria(question_type_id);

ALTER TABLE rubric_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_rubric_criteria" ON rubric_criteria;
CREATE POLICY "read_rubric_criteria" ON rubric_criteria FOR SELECT
  TO authenticated USING (true);

INSERT INTO rubric_criteria (question_type_id, name, display_order) VALUES
  (1, 'Task Achievement', 1),
  (1, 'Coherence & Cohesion', 2),
  (1, 'Lexical Resource', 3),
  (1, 'Grammatical Range & Accuracy', 4),
  (2, 'Task Response', 1),
  (2, 'Coherence & Cohesion', 2),
  (2, 'Lexical Resource', 3),
  (2, 'Grammatical Range & Accuracy', 4),
  (3, 'Fluency & Coherence', 1),
  (3, 'Lexical Resource', 2),
  (3, 'Grammatical Range & Accuracy', 3),
  (3, 'Pronunciation', 4),
  (4, 'Fluency & Coherence', 1),
  (4, 'Lexical Resource', 2),
  (4, 'Grammatical Range & Accuracy', 3),
  (4, 'Pronunciation', 4),
  (5, 'Fluency & Coherence', 1),
  (5, 'Lexical Resource', 2),
  (5, 'Grammatical Range & Accuracy', 3),
  (5, 'Pronunciation', 4),
  (6, 'Content', 1),
  (6, 'Language', 2),
  (7, 'Content', 1),
  (7, 'Language', 2)
ON CONFLICT (question_type_id, name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- 3. Helper functions for RLS
-- ═══════════════════════════════════════════════════════════
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
    WHERE sa.id = p_attempt_id
      AND pa.owner_id = auth.uid()
  );
$function$;

GRANT EXECUTE ON FUNCTION public.can_annotate_attempt(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.owns_attempt(p_attempt_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM student_attempts
    WHERE id = p_attempt_id AND student_profile_id = auth.uid()
  );
$function$;

GRANT EXECUTE ON FUNCTION public.owns_attempt(bigint) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- 4. annotations table
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS annotations (
  id bigint PRIMARY KEY DEFAULT nextval('annotations_id_seq'),
  attempt_id bigint NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
  criterion_id bigint REFERENCES rubric_criteria(id) ON DELETE SET NULL,
  criterion_name text NOT NULL,
  start_offset int NOT NULL,
  end_offset int NOT NULL,
  selected_text text NOT NULL,
  highlight_color text NOT NULL DEFAULT 'green',
  has_text_comment boolean NOT NULL DEFAULT false,
  has_audio_comment boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_annotations_attempt ON annotations(attempt_id);
CREATE INDEX IF NOT EXISTS idx_annotations_criterion ON annotations(criterion_id);

ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_annotations" ON annotations;
CREATE POLICY "select_annotations" ON annotations FOR SELECT
  TO authenticated USING (
    can_annotate_attempt(attempt_id) OR owns_attempt(attempt_id)
  );

DROP POLICY IF EXISTS "insert_annotations" ON annotations;
CREATE POLICY "insert_annotations" ON annotations FOR INSERT
  TO authenticated WITH CHECK (can_annotate_attempt(attempt_id));

DROP POLICY IF EXISTS "update_annotations" ON annotations;
CREATE POLICY "update_annotations" ON annotations FOR UPDATE
  TO authenticated USING (can_annotate_attempt(attempt_id))
  WITH CHECK (can_annotate_attempt(attempt_id));

DROP POLICY IF EXISTS "delete_annotations" ON annotations;
CREATE POLICY "delete_annotations" ON annotations FOR DELETE
  TO authenticated USING (can_annotate_attempt(attempt_id));

-- ═══════════════════════════════════════════════════════════
-- 5. annotation_comments table
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS annotation_comments (
  id bigint PRIMARY KEY DEFAULT nextval('annotation_comments_id_seq'),
  annotation_id bigint NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('text', 'audio')),
  content text,
  audio_path text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_annotation_comments_annotation ON annotation_comments(annotation_id);

ALTER TABLE annotation_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_annotation_comments" ON annotation_comments;
CREATE POLICY "select_annotation_comments" ON annotation_comments FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM annotations a
      WHERE a.id = annotation_comments.annotation_id
        AND (can_annotate_attempt(a.attempt_id) OR owns_attempt(a.attempt_id))
    )
  );

DROP POLICY IF EXISTS "insert_annotation_comments" ON annotation_comments;
CREATE POLICY "insert_annotation_comments" ON annotation_comments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM annotations a
      WHERE a.id = annotation_comments.annotation_id
        AND can_annotate_attempt(a.attempt_id)
    )
  );

DROP POLICY IF EXISTS "update_annotation_comments" ON annotation_comments;
CREATE POLICY "update_annotation_comments" ON annotation_comments FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM annotations a
      WHERE a.id = annotation_comments.annotation_id
        AND can_annotate_attempt(a.attempt_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM annotations a
      WHERE a.id = annotation_comments.annotation_id
        AND can_annotate_attempt(a.attempt_id)
    )
  );

DROP POLICY IF EXISTS "delete_annotation_comments" ON annotation_comments;
CREATE POLICY "delete_annotation_comments" ON annotation_comments FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM annotations a
      WHERE a.id = annotation_comments.annotation_id
        AND can_annotate_attempt(a.attempt_id)
    )
  );

-- ═══════════════════════════════════════════════════════════
-- 6. Add columns to student_attempts and grading
-- ═══════════════════════════════════════════════════════════
ALTER TABLE student_attempts ADD COLUMN IF NOT EXISTS feedback text;
ALTER TABLE student_attempts ADD COLUMN IF NOT EXISTS transcript text;

ALTER TABLE grading ADD COLUMN IF NOT EXISTS examiner_id uuid;
ALTER TABLE grading ADD COLUMN IF NOT EXISTS moderation_status text DEFAULT 'pending';

-- ═══════════════════════════════════════════════════════════
-- 7. Storage bucket for audio comments
-- ═══════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('annotation-audio', 'annotation-audio', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "annotation_audio_read" ON storage.objects;
CREATE POLICY "annotation_audio_read" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'annotation-audio');

DROP POLICY IF EXISTS "annotation_audio_insert" ON storage.objects;
CREATE POLICY "annotation_audio_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'annotation-audio');

DROP POLICY IF EXISTS "annotation_audio_update" ON storage.objects;
CREATE POLICY "annotation_audio_update" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'annotation-audio') WITH CHECK (bucket_id = 'annotation-audio');

DROP POLICY IF EXISTS "annotation_audio_delete" ON storage.objects;
CREATE POLICY "annotation_audio_delete" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'annotation-audio');

-- ═══════════════════════════════════════════════════════════
-- 8. RPC Functions
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_rubric_criteria(p_question_type_id bigint)
RETURNS TABLE (
  id bigint,
  name text,
  display_order int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id, name, display_order
  FROM rubric_criteria
  WHERE question_type_id = p_question_type_id
  ORDER BY display_order;
$function$;

GRANT EXECUTE ON FUNCTION public.get_rubric_criteria(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_attempt_annotations(p_attempt_id bigint)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', a.id,
      'attempt_id', a.attempt_id,
      'criterion_id', a.criterion_id,
      'criterion_name', a.criterion_name,
      'start_offset', a.start_offset,
      'end_offset', a.end_offset,
      'selected_text', a.selected_text,
      'highlight_color', a.highlight_color,
      'has_text_comment', a.has_text_comment,
      'has_audio_comment', a.has_audio_comment,
      'created_at', a.created_at,
      'updated_at', a.updated_at,
      'comments', COALESCE((
        SELECT json_agg(json_build_object(
          'id', c.id,
          'type', c.type,
          'content', c.content,
          'audio_path', c.audio_path,
          'created_at', c.created_at
        ))
        FROM annotation_comments c
        WHERE c.annotation_id = a.id
      ), '[]'::json)
    )
  ), '[]'::json)
  INTO result
  FROM annotations a
  WHERE a.attempt_id = p_attempt_id;

  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_attempt_annotations(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_annotation(
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

  IF p_annotation_id IS NOT NULL THEN
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

GRANT EXECUTE ON FUNCTION public.save_annotation(bigint, bigint, bigint, text, int, int, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_annotation(p_annotation_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT can_annotate_attempt((SELECT attempt_id FROM annotations WHERE id = p_annotation_id)) THEN
    RAISE EXCEPTION 'Not authorized to delete this annotation';
  END IF;
  DELETE FROM annotations WHERE id = p_annotation_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_annotation(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.move_annotation(
  p_annotation_id bigint,
  p_criterion_id bigint,
  p_highlight_color text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_criterion_name text;
BEGIN
  IF NOT can_annotate_attempt((SELECT attempt_id FROM annotations WHERE id = p_annotation_id)) THEN
    RAISE EXCEPTION 'Not authorized to move this annotation';
  END IF;
  SELECT name INTO v_criterion_name FROM rubric_criteria WHERE id = p_criterion_id;
  UPDATE annotations
  SET criterion_id = p_criterion_id,
      criterion_name = v_criterion_name,
      highlight_color = p_highlight_color,
      updated_at = now()
  WHERE id = p_annotation_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.move_annotation(bigint, bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_annotation_comment(
  p_comment_id bigint DEFAULT NULL,
  p_annotation_id bigint DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_content text DEFAULT NULL,
  p_audio_path text DEFAULT NULL
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
  v_attempt_id := (SELECT attempt_id FROM annotations WHERE id = COALESCE(p_annotation_id, (SELECT annotation_id FROM annotation_comments WHERE id = p_comment_id)));
  IF NOT can_annotate_attempt(v_attempt_id) THEN
    RAISE EXCEPTION 'Not authorized to comment on this annotation';
  END IF;

  IF p_comment_id IS NOT NULL THEN
    UPDATE annotation_comments
    SET type = p_type,
        content = p_content,
        audio_path = p_audio_path,
        updated_at = now()
    WHERE id = p_comment_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO annotation_comments (annotation_id, type, content, audio_path)
    VALUES (p_annotation_id, p_type, p_content, p_audio_path)
    RETURNING id INTO v_id;

    IF p_type = 'text' THEN
      UPDATE annotations SET has_text_comment = true, updated_at = now() WHERE id = p_annotation_id;
    ELSIF p_type = 'audio' THEN
      UPDATE annotations SET has_audio_comment = true, updated_at = now() WHERE id = p_annotation_id;
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_annotation_comment(bigint, bigint, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_annotation_comment(p_comment_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_annotation_id bigint;
  v_type text;
BEGIN
  SELECT annotation_id, type INTO v_annotation_id, v_type
  FROM annotation_comments WHERE id = p_comment_id;

  IF NOT can_annotate_attempt((SELECT attempt_id FROM annotations WHERE id = v_annotation_id)) THEN
    RAISE EXCEPTION 'Not authorized to delete this comment';
  END IF;

  DELETE FROM annotation_comments WHERE id = p_comment_id;

  IF v_type = 'text' AND NOT EXISTS (SELECT 1 FROM annotation_comments WHERE annotation_id = v_annotation_id AND type = 'text') THEN
    UPDATE annotations SET has_text_comment = false, updated_at = now() WHERE id = v_annotation_id;
  ELSIF v_type = 'audio' AND NOT EXISTS (SELECT 1 FROM annotation_comments WHERE annotation_id = v_annotation_id AND type = 'audio') THEN
    UPDATE annotations SET has_audio_comment = false, updated_at = now() WHERE id = v_annotation_id;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_annotation_comment(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_assignment_status(
  p_published_assignment_id bigint,
  p_student_profile_id uuid
)
RETURNS TABLE (
  item_id bigint,
  attempt_status text,
  is_submitted boolean,
  is_graded boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    pai.id AS item_id,
    sa.status::text AS attempt_status,
    (sa.status = 'submitted' OR sa.status = 'auto_submitted') AS is_submitted,
    EXISTS (
      SELECT 1 FROM grading g
      WHERE g.submission_id = sa.id
        AND (g.grading_status = 'completed' OR g.grading_status = 'graded')
    ) AS is_graded
  FROM published_assignment_items pai
  LEFT JOIN student_attempts sa
    ON sa.published_assignment_item_id = pai.id
    AND sa.student_profile_id = p_student_profile_id
  WHERE pai.published_assignment_id = p_published_assignment_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_assignment_status(bigint, uuid) TO authenticated;
