-- ═══ A. Audio Comment Storage Policies ═══
-- The annotation-audio bucket exists but has zero storage policies,
-- causing uploads to fail and signed URLs to be inaccessible.

-- Allow authenticated users to upload audio comments
CREATE POLICY "annotation_audio_insert_authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'annotation-audio'
  );

-- Allow authenticated users to read audio comments (teachers during grading,
-- students viewing published feedback — signed URLs bypass RLS, but this
-- policy is needed for the createSignedUrl call to succeed)
CREATE POLICY "annotation_audio_select_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'annotation-audio'
  );

-- Allow authenticated users to delete their own audio comments
CREATE POLICY "annotation_audio_delete_authenticated"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'annotation-audio'
  );

-- ═══ F. Formatting & Text Colour on Submission ═══
-- Add formatting overlay columns to annotations table.
-- These store formatting applied to student submission text as annotation overlays.
-- The original submission text is never modified.

ALTER TABLE annotations
  ADD COLUMN IF NOT EXISTS format_bold boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS format_italic boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS format_underline boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS format_strikethrough boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS text_color text DEFAULT NULL;

-- Update save_annotation to accept formatting params
CREATE OR REPLACE FUNCTION public.save_annotation(
  p_mode text,
  p_annotation_id bigint DEFAULT NULL,
  p_attempt_id bigint DEFAULT NULL,
  p_criterion_id bigint DEFAULT NULL,
  p_criterion_name text DEFAULT NULL,
  p_start_offset integer DEFAULT NULL,
  p_end_offset integer DEFAULT NULL,
  p_selected_text text DEFAULT NULL,
  p_highlight_color text DEFAULT NULL,
  p_format_bold boolean DEFAULT false,
  p_format_italic boolean DEFAULT false,
  p_format_underline boolean DEFAULT false,
  p_format_strikethrough boolean DEFAULT false,
  p_text_color text DEFAULT NULL
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
  IF p_mode = 'create' THEN
    v_attempt_id := p_attempt_id;
  ELSIF p_mode = 'update' THEN
    v_attempt_id := (SELECT attempt_id FROM annotations WHERE id = p_annotation_id);
  END IF;

  IF NOT can_annotate_attempt(v_attempt_id) THEN
    RAISE EXCEPTION 'Not authorized to annotate this attempt';
  END IF;

  IF p_mode = 'create' THEN
    INSERT INTO annotations (
      attempt_id, criterion_id, criterion_name,
      start_offset, end_offset, selected_text, highlight_color,
      format_bold, format_italic, format_underline, format_strikethrough, text_color
    )
    VALUES (
      p_attempt_id, p_criterion_id, p_criterion_name,
      p_start_offset, p_end_offset, p_selected_text, p_highlight_color,
      p_format_bold, p_format_italic, p_format_underline, p_format_strikethrough, p_text_color
    )
    RETURNING id INTO v_id;
  ELSIF p_mode = 'update' THEN
    UPDATE annotations
    SET criterion_id = p_criterion_id,
        criterion_name = p_criterion_name,
        start_offset = p_start_offset,
        end_offset = p_end_offset,
        selected_text = p_selected_text,
        highlight_color = p_highlight_color,
        format_bold = p_format_bold,
        format_italic = p_format_italic,
        format_underline = p_format_underline,
        format_strikethrough = p_format_strikethrough,
        text_color = p_text_color,
        updated_at = now()
    WHERE id = p_annotation_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$;

-- Update get_attempt_annotations to return formatting fields
CREATE OR REPLACE FUNCTION public.get_attempt_annotations(p_attempt_id bigint)
RETURNS json
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
      'format_bold', a.format_bold,
      'format_italic', a.format_italic,
      'format_underline', a.format_underline,
      'format_strikethrough', a.format_strikethrough,
      'text_color', a.text_color,
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
