/*
# Student Attempts and Submissions

## Purpose
Implements the "Attempt" lifecycle for the Student Workspace (Milestone 0.7).
Students take published assignment items under timed conditions. The attempt
is the unit of work — it owns the start timestamp, status, and submission data.

## Why a new table is unavoidable
The existing `studentsubmissions` table references `studentassignmentitems`,
which references the legacy `publishedassignments` table — completely
disconnected from the active `published_assignments` / `published_assignment_items`
architecture. Reusing it would require destructive schema changes (dropping FKs,
changing column types) that risk data loss. A new table is the clean path.

## New Tables

### `student_attempts`
- `id` (bigint, PK, identity)
- `published_assignment_item_id` (bigint, NOT NULL, FK → published_assignment_items.id ON DELETE CASCADE)
- `student_profile_id` (uuid, NOT NULL, FK → profiles.id ON DELETE CASCADE)
- `status` (text, NOT NULL, DEFAULT 'in_progress') — values: 'in_progress', 'submitted', 'auto_submitted'
- `started_at` (timestamptz, NOT NULL, DEFAULT now()) — server-set when attempt is created
- `submitted_at` (timestamptz, NULL) — set when student submits or auto-submit fires
- `time_limit_seconds` (integer, NULL) — snapshot of the item's time limit at attempt creation
- `response_type` (text, NOT NULL) — 'text' or 'audio', snapshot from the published item
- `written_response` (text, NULL) — student's written answer (for text response type)
- `audio_path` (text, NULL) — storage path for recorded audio (for audio response type)
- `word_count` (integer, NULL) — word count of written response at submission
- `created_at` (timestamptz, NOT NULL, DEFAULT now())

### Unique constraint
- One attempt per student per published item at a time: UNIQUE(published_assignment_item_id, student_profile_id) WHERE status = 'in_progress'

## Security (RLS)
- Enable RLS on `student_attempts`.
- SELECT: students can read only their own attempts; admins can read all.
- INSERT: only via `start_attempt` RPC (SECURITY DEFINER). Direct inserts denied.
- UPDATE: students can update their own attempt (to save written_response / audio_path / status). Admins can update any.
- DELETE: denied (attempts are immutable once created; use status changes instead).

## RPCs

### `start_attempt(p_published_item_id bigint)`
- SECURITY DEFINER, callable by authenticated.
- Verifies the student is enrolled in the class that owns the published assignment.
- Verifies the item is available (available_from is null or <= now).
- Creates a new attempt row (or resumes an existing in-progress one).
- Returns JSON with attempt_id, started_at, time_limit_seconds, response_type, and the full question content (content, type_name, image_url, custom_instructions, etc.).
- This is the ONLY way question content becomes available to the student — the RPC returns it only after the attempt row exists.

### `submit_attempt(p_attempt_id bigint, p_written_response text DEFAULT NULL, p_audio_path text DEFAULT NULL, p_word_count integer DEFAULT NULL, p_status text DEFAULT 'submitted')`
- SECURITY DEFINER, callable by authenticated.
- Verifies the attempt belongs to the calling student.
- Sets submitted_at = now(), status = p_status (or 'auto_submitted'), and stores the response data.
- Returns the attempt id.

## Indexes
- idx_student_attempts_student (student_profile_id) — student's attempt history
- idx_student_attempts_item (published_assignment_item_id) — find attempts for an item
- uniq_active_attempt — unique partial index for in-progress attempts
*/

-- ── student_attempts table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS student_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  published_assignment_item_id bigint NOT NULL REFERENCES published_assignment_items(id) ON DELETE CASCADE,
  student_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NULL,
  time_limit_seconds integer NULL,
  response_type text NOT NULL,
  written_response text NULL,
  audio_path text NULL,
  word_count integer NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_attempts ENABLE ROW LEVEL SECURITY;

-- SELECT: students see only their own attempts; admins see all
DROP POLICY IF EXISTS "select_own_attempts" ON student_attempts;
CREATE POLICY "select_own_attempts" ON student_attempts
  FOR SELECT TO authenticated
  USING (student_profile_id = auth.uid() OR get_my_role() = 'admin');

-- UPDATE: students can update their own attempt (save response, mark submitted)
DROP POLICY IF EXISTS "update_own_attempts" ON student_attempts;
CREATE POLICY "update_own_attempts" ON student_attempts
  FOR UPDATE TO authenticated
  USING (student_profile_id = auth.uid() OR get_my_role() = 'admin')
  WITH CHECK (student_profile_id = auth.uid() OR get_my_role() = 'admin');

-- No INSERT or DELETE policies — attempts are created only via start_attempt RPC

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_attempts_student ON student_attempts (student_profile_id);
CREATE INDEX IF NOT EXISTS idx_student_attempts_item ON student_attempts (published_assignment_item_id);

-- Unique partial index: one in-progress attempt per student per item
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_attempt
  ON student_attempts (published_assignment_item_id, student_profile_id)
  WHERE status = 'in_progress';

-- ── start_attempt RPC ──────────────────────────────────────
-- This is the ONLY way question content becomes available.
-- The RPC verifies enrollment, creates the attempt, then returns content.
CREATE OR REPLACE FUNCTION start_attempt(p_published_item_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_profile_id uuid := auth.uid();
  v_student_id bigint;
  v_item published_assignment_items%ROWTYPE;
  v_published published_assignments%ROWTYPE;
  v_class_id bigint;
  v_attempt_id bigint;
  v_existing_attempt_id bigint;
  v_time_limit_seconds integer;
  v_result json;
BEGIN
  -- Must be authenticated
  IF v_student_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Must not be banned
  IF NOT can_current_user_access() THEN
    RAISE EXCEPTION 'Account access denied';
  END IF;

  -- Get the student's student_id from their profile
  SELECT student_id INTO v_student_id
  FROM profiles
  WHERE id = v_student_profile_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Only students can start attempts';
  END IF;

  -- Fetch the published item
  SELECT * INTO v_item
  FROM published_assignment_items
  WHERE id = p_published_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  -- Fetch the published assignment to get class_id
  SELECT * INTO v_published
  FROM published_assignments
  WHERE id = v_item.published_assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published assignment not found';
  END IF;

  v_class_id := v_published.class_id;

  -- Verify student is enrolled in the class
  IF NOT EXISTS (
    SELECT 1 FROM classstudents
    WHERE class_id = v_class_id AND student_id = v_student_id
  ) THEN
    RAISE EXCEPTION 'Not enrolled in this class';
  END IF;

  -- Check availability: item must be available (available_from is null or <= now)
  IF v_item.available_from IS NOT NULL AND v_item.available_from > now() THEN
    RAISE EXCEPTION 'Item not yet available';
  END IF;

  -- Check for existing in-progress attempt (resume)
  SELECT id INTO v_existing_attempt_id
  FROM student_attempts
  WHERE published_assignment_item_id = p_published_item_id
    AND student_profile_id = v_student_profile_id
    AND status = 'in_progress'
  LIMIT 1;

  IF v_existing_attempt_id IS NOT NULL THEN
    -- Resume existing attempt
    v_attempt_id := v_existing_attempt_id;
  ELSE
    -- Calculate time limit in seconds from the interval
    IF v_item.timed AND v_item.time_limit IS NOT NULL THEN
      v_time_limit_seconds := EXTRACT(EPOCH FROM v_item.time_limit)::integer;
    ELSE
      v_time_limit_seconds := NULL;
    END IF;

    -- Create new attempt
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
  -- This is the moment content becomes available — only after the attempt exists
  SELECT json_build_object(
    'attempt_id', v_attempt_id,
    'started_at', started_at,
    'time_limit_seconds', time_limit_seconds,
    'response_type', response_type,
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
      'time_limit', v_item.time_limit
    )
  ) INTO v_result
  FROM student_attempts
  WHERE id = v_attempt_id;

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION start_attempt(bigint) TO authenticated;

-- ── submit_attempt RPC ─────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_attempt(
  p_attempt_id bigint,
  p_written_response text DEFAULT NULL,
  p_audio_path text DEFAULT NULL,
  p_word_count integer DEFAULT NULL,
  p_status text DEFAULT 'submitted'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid := auth.uid();
  v_attempt student_attempts%ROWTYPE;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Fetch the attempt
  SELECT * INTO v_attempt
  FROM student_attempts
  WHERE id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;

  -- Must own the attempt
  IF v_attempt.student_profile_id != v_profile_id AND get_my_role() != 'admin' THEN
    RAISE EXCEPTION 'Not your attempt';
  END IF;

  -- Must be in progress
  IF v_attempt.status != 'in_progress' THEN
    RAISE EXCEPTION 'Attempt already submitted';
  END IF;

  -- Update the attempt
  UPDATE student_attempts
  SET
    written_response = COALESCE(p_written_response, written_response),
    audio_path = COALESCE(p_audio_path, audio_path),
    word_count = COALESCE(p_word_count, word_count),
    status = p_status,
    submitted_at = now()
  WHERE id = p_attempt_id;

  RETURN p_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_attempt(bigint, text, text, integer, text) TO authenticated;
