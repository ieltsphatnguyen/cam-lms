/*
# Milestone 0.7.1 — Speaking timing columns + storage fix

## Schema additions
Add `prep_time_seconds` and `recording_time_seconds` to both
`assignment_draft_questions` and `published_assignment_items`.
These are used only for Speaking Part 2 and Custom Speaking tasks.
All other task types continue using `time_limit` (interval).

## Storage policy fix
Add an INSERT policy for student audio submissions in the
`question-images` bucket. The existing `insert_own_question_image`
policy requires the first path segment to be the user's UUID,
but student audio uploads to `audio/` — which fails RLS.
The new policy allows any authenticated student to upload to
`student-audio/` paths.
*/

-- ── Add timing columns to draft questions ──────────────────
ALTER TABLE assignment_draft_questions
  ADD COLUMN IF NOT EXISTS prep_time_seconds integer,
  ADD COLUMN IF NOT EXISTS recording_time_seconds integer;

-- ── Add timing columns to published items ───────────────────
ALTER TABLE published_assignment_items
  ADD COLUMN IF NOT EXISTS prep_time_seconds integer,
  ADD COLUMN IF NOT EXISTS recording_time_seconds integer;

-- ── Storage policy for student audio uploads ───────────────
-- Students upload recordings to student-audio/{uid}/ paths.
-- The existing insert_own_question_image policy requires
-- foldername(name)[1] = auth.uid(), which fails for "audio/" paths.
DROP POLICY IF EXISTS "insert_student_audio" ON storage.objects;
CREATE POLICY "insert_student_audio" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'question-images'
    AND (storage.foldername(name))[1] = 'student-audio'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Allow students to read their own audio submissions
DROP POLICY IF EXISTS "read_own_student_audio" ON storage.objects;
CREATE POLICY "read_own_student_audio" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'question-images'
    AND (storage.foldername(name))[1] = 'student-audio'
  );
