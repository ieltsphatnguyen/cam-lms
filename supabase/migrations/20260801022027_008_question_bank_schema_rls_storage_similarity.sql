/*
# 008 — Question Bank: schema, seed data, RLS, storage, similarity search

## Summary
Adds the columns needed by the Question Bank module to the existing `questions`
table, seeds the 7 built-in question types, enables RLS with ownership-based
policies, creates a storage bucket for question images, and adds a trigram
similarity search function for similar-question detection.

## Why this migration is required
The existing `questions` table has only `content`, `category_id`, `type_id`,
`created_by`, `created_at`, `updated_at`. The Question Bank module needs:
title, description, IELTS band/CEFR level, free-text teaching category, tags,
response type (text/audio), time-limit settings, image URL, owner (auth user
uuid for RLS), status (active/archived), archive timestamp, and custom-type
metadata. None of these can be stored in the current schema.

## New Columns on `questions` (15 columns)
  - `title` (text, NOT NULL, default '') — short question title
  - `description` (text, nullable) — optional longer description
  - `ielts_band` (text, nullable) — IELTS band or CEFR level (e.g. "B2", "7.0")
  - `teaching_category` (text, nullable) — free-text category (IELTS, Grammar, etc.)
  - `tags` (text[], default '{}') — multiple tags
  - `response_type` (text, NOT NULL, default 'text') — 'text' | 'audio'
  - `time_limit_enabled` (boolean, NOT NULL, default false)
  - `time_limit_seconds` (integer, nullable) — timer in seconds when enabled
  - `image_url` (text, nullable) — public URL of uploaded image (Writing Task 1)
  - `owner_id` (uuid, nullable, default auth.uid()) — current owner for RLS
  - `status` (text, NOT NULL, default 'active') — 'active' | 'archived'
  - `archived_at` (timestamptz, nullable) — when the question was archived
  - `custom_type_name` (text, nullable) — name for Custom question types
  - `custom_instructions` (text, nullable) — instructions for Custom types

## Modified Columns
  - `questions.category_id` — dropped NOT NULL (teaching_category is now free text)

## Seed Data
  - `questiontypes` — 7 built-in types with explicit IDs 1-7:
    Writing Task 1, Writing Task 2, Speaking Part 1, Speaking Part 2,
    Speaking Part 3, Extra Homework, Custom

## CHECK Constraints
  - `questions_response_type_check` — response_type IN ('text', 'audio')
  - `questions_status_check` — status IN ('active', 'archived')

## Trigger
  - `questions_set_updated_at` — auto-updates `updated_at` on every UPDATE

## RLS
### questions (4 policies)
  - SELECT: all authenticated, non-banned users (collaboration — view all)
  - INSERT: teachers/admins only, owner_id must equal auth.uid()
  - UPDATE: owner OR admin (teachers cannot edit others' questions)
  - DELETE: owner OR admin

### questiontypes (1 policy)
  - SELECT: all authenticated, non-banned users (reference data)

## Storage
  - `question-images` bucket (public) for Writing Task 1 image uploads
  - Public read policy (anon + authenticated)
  - Insert/update/delete scoped to user's own path prefix

## Similarity Search
  - `search_similar_questions(p_prompt, p_threshold, p_exclude_id)` function
  - Uses pg_trgm extension for trigram-based text similarity
  - SECURITY DEFINER so it can see all active questions across all teachers
  - Returns top 5 similar questions with similarity score
  - Architecture allows future replacement with semantic AI similarity

## Notes
  1. The `content` column (pre-existing) is used as the "Prompt" field.
  2. `created_by` (pre-existing, references teachers) is kept for backward
     compatibility. `owner_id` (new, references auth.users via uuid) is the
     primary ownership field used by RLS.
  3. `category_id` is kept but made nullable — the Question Bank uses the
     free-text `teaching_category` column instead of the FK-based
     `questioncategories` table.
  4. No existing data is modified or deleted — all changes are additive.
  5. pg_trgm extension is required for similarity search and the GIN trigram
     index on `content`.
*/

-- ── 1. pg_trgm extension ──────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 2. Seed question types with explicit IDs ──────────────
INSERT INTO questiontypes (id, name) VALUES
  (1, 'Writing Task 1'),
  (2, 'Writing Task 2'),
  (3, 'Speaking Part 1'),
  (4, 'Speaking Part 2'),
  (5, 'Speaking Part 3'),
  (6, 'Extra Homework'),
  (7, 'Custom')
ON CONFLICT (id) DO NOTHING;

-- Reset the sequence so future inserts don't collide
SELECT setval('questiontypes_id_seq', GREATEST((SELECT COALESCE(MAX(id), 7) FROM questiontypes), 7), true);

-- Unique constraint on name to prevent duplicates
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questiontypes_name_key') THEN
    ALTER TABLE questiontypes ADD CONSTRAINT questiontypes_name_key UNIQUE (name);
  END IF;
END $$;

-- ── 3. Add columns to questions ───────────────────────────
ALTER TABLE questions ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS ielts_band text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS teaching_category text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS response_type text NOT NULL DEFAULT 'text';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS time_limit_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS time_limit_seconds integer;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS owner_id uuid DEFAULT auth.uid();
ALTER TABLE questions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS custom_type_name text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS custom_instructions text;

-- Make category_id nullable (teaching_category is free text)
ALTER TABLE questions ALTER COLUMN category_id DROP NOT NULL;

-- ── 4. CHECK constraints ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_response_type_check') THEN
    ALTER TABLE questions ADD CONSTRAINT questions_response_type_check CHECK (response_type IN ('text', 'audio'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_status_check') THEN
    ALTER TABLE questions ADD CONSTRAINT questions_status_check CHECK (status IN ('active', 'archived'));
  END IF;
END $$;

-- ── 5. updated_at trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION questions_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questions_set_updated_at ON questions;
CREATE TRIGGER questions_set_updated_at
  BEFORE UPDATE ON questions
  FOR EACH ROW
  EXECUTE FUNCTION questions_set_updated_at();

-- ── 6. Enable RLS ──────────────────────────────────────────
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE questiontypes ENABLE ROW LEVEL SECURITY;

-- ── 7. RLS policies on questions ──────────────────────────
DROP POLICY IF EXISTS "select_questions" ON questions;
CREATE POLICY "select_questions" ON questions
  FOR SELECT TO authenticated
  USING (can_current_user_access());

DROP POLICY IF EXISTS "insert_questions" ON questions;
CREATE POLICY "insert_questions" ON questions
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('teacher', 'admin')
    AND owner_id = auth.uid()
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "update_questions" ON questions;
CREATE POLICY "update_questions" ON questions
  FOR UPDATE TO authenticated
  USING (
    (owner_id = auth.uid() OR get_my_role() = 'admin')
    AND can_current_user_access()
  )
  WITH CHECK (
    (owner_id = auth.uid() OR get_my_role() = 'admin')
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "delete_questions" ON questions;
CREATE POLICY "delete_questions" ON questions
  FOR DELETE TO authenticated
  USING (
    (owner_id = auth.uid() OR get_my_role() = 'admin')
    AND can_current_user_access()
  );

-- ── RLS on questiontypes (read-only reference data) ────────
DROP POLICY IF EXISTS "select_questiontypes" ON questiontypes;
CREATE POLICY "select_questiontypes" ON questiontypes
  FOR SELECT TO authenticated
  USING (can_current_user_access());

-- ── 8. Indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_questions_content_trgm ON questions USING GIN (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_questions_owner_id ON questions(owner_id);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_teaching_category ON questions(teaching_category);
CREATE INDEX IF NOT EXISTS idx_questions_tags ON questions USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_questions_response_type ON questions(response_type);

-- ── 9. Storage bucket for question images ──────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_question_images" ON storage.objects;
CREATE POLICY "public_read_question_images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'question-images');

DROP POLICY IF EXISTS "insert_own_question_image" ON storage.objects;
CREATE POLICY "insert_own_question_image"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'question-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "update_own_question_image" ON storage.objects;
CREATE POLICY "update_own_question_image"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'question-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'question-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "delete_own_question_image" ON storage.objects;
CREATE POLICY "delete_own_question_image"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'question-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 10. Similarity search function ─────────────────────────
CREATE OR REPLACE FUNCTION search_similar_questions(
  p_prompt text,
  p_threshold real DEFAULT 0.3,
  p_exclude_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  title text,
  content text,
  type_name text,
  teaching_category text,
  response_type text,
  owner_display_name text,
  sim real
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    q.id,
    q.title,
    q.content,
    qt.name AS type_name,
    q.teaching_category,
    q.response_type,
    COALESCE(p.display_name, 'Unknown') AS owner_display_name,
    similarity(q.content, p_prompt) AS sim
  FROM questions q
  JOIN questiontypes qt ON qt.id = q.type_id
  LEFT JOIN profiles p ON p.id = q.owner_id
  WHERE q.status = 'active'
    AND char_length(p_prompt) >= 10
    AND q.content % p_prompt
    AND similarity(q.content, p_prompt) >= p_threshold
    AND (p_exclude_id IS NULL OR q.id <> p_exclude_id)
  ORDER BY sim DESC
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION search_similar_questions(text, real, bigint) TO authenticated;