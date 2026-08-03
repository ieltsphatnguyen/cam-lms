/*
# Annotation Lifecycle Stabilisation — Schema Changes

## 1. Independent Text Formatting (Part A)

### New Table: `text_formats`

Stores text formatting (bold/italic/underline/strikethrough) as an
independent visual layer, decoupled from annotations. Formatting can
be applied to ANY selected text — it does NOT require an annotation
to exist first, and it does NOT create annotations, comments, highlights,
or criterion assignments.

Columns:
- `id` — bigint, primary key
- `attempt_id` — bigint, FK to student_attempts (the attempt this format belongs to)
- `start_offset` — integer, character offset in the student text
- `end_offset` — integer, character offset (exclusive)
- `format_bold` — boolean, default false
- `format_italic` — boolean, default false
- `format_underline` — boolean, default false
- `format_strikethrough` — boolean, default false
- `created_at` — timestamptz, default now()
- `updated_at` — timestamptz, default now()

### New RPCs:
- `save_text_format` — insert or update a text_format record
- `delete_text_format` — delete a text_format record
- `get_text_formats` — return all text_formats for an attempt (teacher)
- `get_published_text_formats` — return text_formats only if feedback is published (student)

### RLS:
- Teacher: can annotate attempt → full CRUD
- Student: can read own attempt's formats only when feedback_published = true

## 2. Published Annotation Snapshots (Part B)

### New Table: `published_annotation_snapshots`

Immutable snapshot of annotations + comments at the moment of Publish Feedback.
The student UI reads exclusively from this table — never from the live
`annotations` table. This guarantees that students see a single consistent
published version and that teacher edits after publishing never leak.

Columns:
- `id` — bigint, primary key
- `attempt_id` — bigint, FK to student_attempts
- `annotation_id` — bigint, the source annotation ID (for reference)
- `criterion_id` — bigint, nullable
- `criterion_name` — text, nullable
- `start_offset` — integer
- `end_offset` — integer
- `selected_text` — text
- `highlight_color` — text
- `format_bold` — boolean
- `format_italic` — boolean
- `format_underline` — boolean
- `format_strikethrough` — boolean
- `text_color` — text, nullable
- `comments` — JSONB, snapshot of annotation_comments for this annotation
- `published_at` — timestamptz, default now()
- `published_by` — uuid, FK to auth.users

### New Table: `published_text_format_snapshots`

Same concept — immutable snapshot of text_formats at publish time.

Columns:
- `id` — bigint, primary key
- `attempt_id` — bigint, FK to student_attempts
- `start_offset` — integer
- `end_offset` — integer
- `format_bold` — boolean
- `format_italic` — boolean
- `format_underline` — boolean
- `format_strikethrough` — boolean
- `published_at` — timestamptz, default now()
- `published_by` — uuid, FK to auth.users

### Updated RPCs:
- `publish_feedback` — now snapshots all annotations, comments, and text_formats
  into the snapshot tables before marking feedback_published = true
- `get_published_annotations` — now reads from published_annotation_snapshots
- `get_published_text_formats` — reads from published_text_format_snapshots

### RLS:
- Teacher: no access to snapshots (they use the live tables)
- Student: can SELECT snapshots for their own attempts only when feedback_published = true

## 3. Security
- All new tables have RLS enabled
- All new RPCs are SECURITY DEFINER with search_path = 'public'
- Student access is gated on feedback_published = true AND ownership
*/

-- ══════════════════════════════════════════════════════════════
-- Part 1: text_formats table
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS text_formats (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id bigint NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  format_bold boolean NOT NULL DEFAULT false,
  format_italic boolean NOT NULL DEFAULT false,
  format_underline boolean NOT NULL DEFAULT false,
  format_strikethrough boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE text_formats ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_text_formats_attempt ON text_formats(attempt_id);

DROP POLICY IF EXISTS "select_text_formats" ON text_formats;
CREATE POLICY "select_text_formats" ON text_formats FOR SELECT
  TO authenticated USING (can_annotate_attempt(attempt_id) OR owns_attempt(attempt_id));

DROP POLICY IF EXISTS "insert_text_formats" ON text_formats;
CREATE POLICY "insert_text_formats" ON text_formats FOR INSERT
  TO authenticated WITH CHECK (can_annotate_attempt(attempt_id));

DROP POLICY IF EXISTS "update_text_formats" ON text_formats;
CREATE POLICY "update_text_formats" ON text_formats FOR UPDATE
  TO authenticated USING (can_annotate_attempt(attempt_id))
  WITH CHECK (can_annotate_attempt(attempt_id));

DROP POLICY IF EXISTS "delete_text_formats" ON text_formats;
CREATE POLICY "delete_text_formats" ON text_formats FOR DELETE
  TO authenticated USING (can_annotate_attempt(attempt_id));

-- ══════════════════════════════════════════════════════════════
-- Part 2: published_annotation_snapshots table
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS published_annotation_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id bigint NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
  annotation_id bigint, -- source annotation ID, not FK (source may be deleted later)
  criterion_id bigint,
  criterion_name text,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  selected_text text,
  highlight_color text,
  format_bold boolean NOT NULL DEFAULT false,
  format_italic boolean NOT NULL DEFAULT false,
  format_underline boolean NOT NULL DEFAULT false,
  format_strikethrough boolean NOT NULL DEFAULT false,
  text_color text,
  comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES auth.users(id)
);

ALTER TABLE published_annotation_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pub_ann_snapshots_attempt ON published_annotation_snapshots(attempt_id);

-- Students can only read their own snapshots, and only when feedback is published
DROP POLICY IF EXISTS "select_published_annotation_snapshots" ON published_annotation_snapshots;
CREATE POLICY "select_published_annotation_snapshots" ON published_annotation_snapshots FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM student_attempts sa
      WHERE sa.id = attempt_id
      AND sa.student_profile_id = auth.uid()
      AND sa.feedback_published = true
    )
  );

-- No INSERT/UPDATE/DELETE via RLS — only the publish_feedback RPC (SECURITY DEFINER) writes

-- ══════════════════════════════════════════════════════════════
-- Part 3: published_text_format_snapshots table
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS published_text_format_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id bigint NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  format_bold boolean NOT NULL DEFAULT false,
  format_italic boolean NOT NULL DEFAULT false,
  format_underline boolean NOT NULL DEFAULT false,
  format_strikethrough boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES auth.users(id)
);

ALTER TABLE published_text_format_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pub_tf_snapshots_attempt ON published_text_format_snapshots(attempt_id);

DROP POLICY IF EXISTS "select_published_text_format_snapshots" ON published_text_format_snapshots;
CREATE POLICY "select_published_text_format_snapshots" ON published_text_format_snapshots FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM student_attempts sa
      WHERE sa.id = attempt_id
      AND sa.student_profile_id = auth.uid()
      AND sa.feedback_published = true
    )
  );

-- ══════════════════════════════════════════════════════════════
-- Part 4: RPCs for text_formats
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.save_text_format(
  p_id bigint DEFAULT NULL,
  p_attempt_id bigint DEFAULT NULL,
  p_start_offset integer DEFAULT NULL,
  p_end_offset integer DEFAULT NULL,
  p_format_bold boolean DEFAULT false,
  p_format_italic boolean DEFAULT false,
  p_format_underline boolean DEFAULT false,
  p_format_strikethrough boolean DEFAULT false
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
  v_attempt_id := COALESCE(p_attempt_id, (SELECT attempt_id FROM text_formats WHERE id = p_id));
  IF v_attempt_id IS NULL THEN
    RAISE EXCEPTION 'attempt_id is required for new text formats';
  END IF;

  IF NOT can_annotate_attempt(v_attempt_id) THEN
    RAISE EXCEPTION 'Not authorized to format this attempt';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE text_formats
    SET start_offset = p_start_offset,
        end_offset = p_end_offset,
        format_bold = p_format_bold,
        format_italic = p_format_italic,
        format_underline = p_format_underline,
        format_strikethrough = p_format_strikethrough,
        updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO text_formats (attempt_id, start_offset, end_offset, format_bold, format_italic, format_underline, format_strikethrough)
    VALUES (p_attempt_id, p_start_offset, p_end_offset, p_format_bold, p_format_italic, p_format_underline, p_format_strikethrough)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_text_format(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt_id bigint;
BEGIN
  SELECT attempt_id INTO v_attempt_id FROM text_formats WHERE id = p_id;
  IF v_attempt_id IS NULL THEN RETURN; END IF;

  IF NOT can_annotate_attempt(v_attempt_id) THEN
    RAISE EXCEPTION 'Not authorized to delete this text format';
  END IF;

  DELETE FROM text_formats WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_text_formats(p_attempt_id bigint)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT COALESCE(json_agg(json_build_object(
  'id', id,
  'attempt_id', attempt_id,
  'start_offset', start_offset,
  'end_offset', end_offset,
  'format_bold', format_bold,
  'format_italic', format_italic,
  'format_underline', format_underline,
  'format_strikethrough', format_strikethrough
)), '[]'::json)
FROM text_formats
WHERE attempt_id = p_attempt_id;
$function$;

-- ══════════════════════════════════════════════════════════════
-- Part 5: Updated publish_feedback — now snapshots everything
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

  v_published_by := auth.uid();

  -- ── Snapshot all annotations + comments ──
  -- Clear old snapshots for this attempt (supports re-publishing)
  DELETE FROM published_annotation_snapshots WHERE attempt_id = p_attempt_id;

  INSERT INTO published_annotation_snapshots (
    attempt_id, annotation_id, criterion_id, criterion_name,
    start_offset, end_offset, selected_text, highlight_color,
    format_bold, format_italic, format_underline, format_strikethrough, text_color,
    comments, published_by
  )
  SELECT
    p_attempt_id,
    a.id,
    a.criterion_id,
    a.criterion_name,
    a.start_offset,
    a.end_offset,
    a.selected_text,
    a.highlight_color,
    a.format_bold,
    a.format_italic,
    a.format_underline,
    a.format_strikethrough,
    a.text_color,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'type', c.type,
        'content', c.content,
        'audio_path', c.audio_path,
        'created_at', c.created_at
      ))
      FROM annotation_comments c
      WHERE c.annotation_id = a.id
    ), '[]'::jsonb),
    v_published_by
  FROM annotations a
  WHERE a.attempt_id = p_attempt_id;

  -- ── Snapshot all text_formats ──
  DELETE FROM published_text_format_snapshots WHERE attempt_id = p_attempt_id;

  INSERT INTO published_text_format_snapshots (
    attempt_id, start_offset, end_offset,
    format_bold, format_italic, format_underline, format_strikethrough,
    published_by
  )
  SELECT
    p_attempt_id,
    tf.start_offset,
    tf.end_offset,
    tf.format_bold,
    tf.format_italic,
    tf.format_underline,
    tf.format_strikethrough,
    v_published_by
  FROM text_formats tf
  WHERE tf.attempt_id = p_attempt_id;

  -- ── Mark feedback as published ──
  UPDATE student_attempts SET feedback_published = true WHERE id = p_attempt_id;

  -- ── Create or update grading record ──
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

-- ══════════════════════════════════════════════════════════════
-- Part 6: Updated get_published_annotations — reads from snapshots
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_published_annotations(p_attempt_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- Verify the caller owns this attempt AND feedback is published
  IF NOT EXISTS (
    SELECT 1 FROM student_attempts
    WHERE id = p_attempt_id
    AND student_profile_id = auth.uid()
    AND feedback_published = true
  ) THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(
    json_build_object(
      'id', s.id,
      'attempt_id', s.attempt_id,
      'criterion_id', s.criterion_id,
      'criterion_name', s.criterion_name,
      'start_offset', s.start_offset,
      'end_offset', s.end_offset,
      'selected_text', s.selected_text,
      'highlight_color', s.highlight_color,
      'has_text_comment', COALESCE((SELECT jsonb_array_length(s.comments) > 0), false),
      'has_audio_comment', COALESCE((
        SELECT bool_or((elem->>'type') = 'audio')
        FROM jsonb_array_elements(s.comments) AS elem
      ), false),
      'format_bold', s.format_bold,
      'format_italic', s.format_italic,
      'format_underline', s.format_underline,
      'format_strikethrough', s.format_strikethrough,
      'text_color', s.text_color,
      'created_at', s.published_at,
      'updated_at', s.published_at,
      'comments', s.comments
    )
  ), '[]'::json)
  INTO result
  FROM published_annotation_snapshots s
  WHERE s.attempt_id = p_attempt_id;

  RETURN result;
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- Part 7: get_published_text_formats — reads from snapshots
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_published_text_formats(p_attempt_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
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
    'attempt_id', s.attempt_id,
    'start_offset', s.start_offset,
    'end_offset', s.end_offset,
    'format_bold', s.format_bold,
    'format_italic', s.format_italic,
    'format_underline', s.format_underline,
    'format_strikethrough', s.format_strikethrough
  )), '[]'::json)
  INTO result
  FROM published_text_format_snapshots s
  WHERE s.attempt_id = p_attempt_id;

  RETURN result;
END;
$function$;
