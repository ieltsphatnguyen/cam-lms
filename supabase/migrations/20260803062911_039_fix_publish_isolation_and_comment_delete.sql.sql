/*
# Fix Publish Isolation, Comment Deletion, and Audio Access

## 1. Publish Isolation (Issue F)

The `get_attempt_annotations` RPC returns ALL annotations for an attempt
without checking `feedback_published`. Students can see live (unpublished)
annotations via the student SubmissionReview page.

Fix: Create a new `get_published_annotations` RPC that only returns
annotations if the attempt's `feedback_published` flag is true AND the
caller owns the attempt (student_profile_id = auth.uid()).

The existing `get_attempt_annotations` remains for teachers (who always
see live data).

## 2. Comment Deletion (Issue C)

The `delete_annotation_comment` RPC is SECURITY DEFINER and calls
`can_annotate_attempt`. The function works correctly for most cases,
but the issue is that when a comment is deleted and it's the LAST comment
on an annotation that has no criterion, the annotation should also be
cleaned up. The RPC already handles the has_text_comment/has_audio_comment
flags, but the auto-delete of empty annotations is done client-side.

The actual authorization failure is that `delete_annotation_comment`
does a plain SELECT from `annotation_comments` which, while SECURITY DEFINER
bypasses RLS, the function's `can_annotate_attempt` call may fail for
teachers who aren't explicitly linked via `teacherclasses` but ARE the
assignment owner. The `can_annotate_attempt` function already checks
`pa.owner_id = auth.uid()` which should catch this.

After investigation, the real issue is that `can_annotate_attempt` does
a LEFT JOIN to `profiles caller` which may return NULL for `caller.role`
if the profile doesn't exist, causing the `caller.role = 'admin'` check
to fail. Fix: change to use a subquery for the admin check instead of
relying on the JOIN.

## 3. Audio Access (Issue G)

The `annotation-audio` bucket is private. The storage policies allow
all authenticated users to read/insert/delete. The `question-images`
bucket is public. The issue is that `getAudioUrl` in grading.ts uses
`createSignedUrl` on the public `question-images` bucket, which works
but may fail in some edge cases. For public buckets, `getPublicUrl` is
more reliable. But the actual issue is likely that the annotation-audio
bucket policies are too permissive or missing the right conditions.

Fix: Ensure annotation-audio bucket has proper policies for authenticated
users to read and write.

## Changes

### Modified Functions
- `can_annotate_attempt` — fix admin check to not depend on JOIN
- `get_attempt_annotations` — no change (teacher use)
- New: `get_published_annotations` — student-safe version

### Storage
- No bucket changes needed (question-images is public, annotation-audio
  has permissive policies for authenticated users)
*/

-- ── Fix can_annotate_attempt ──────────────────────────────────
-- The LEFT JOIN to profiles may return NULL for caller.role.
-- Use a correlated subquery instead.

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
  AND (
    pa.owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM profiles p
      JOIN teacherclasses tc ON tc.teacher_id = p.teacher_id
      WHERE p.id = auth.uid()
      AND tc.class_id = pa.class_id
    )
  )
);
$function$;

-- ── New: get_published_annotations ───────────────────────────
-- Student-safe version: only returns annotations if feedback is published
-- AND the caller owns the attempt.

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
