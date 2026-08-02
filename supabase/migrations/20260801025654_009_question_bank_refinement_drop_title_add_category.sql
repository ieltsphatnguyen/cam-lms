/*
# 009 — Question Bank refinement: drop title/teaching_category, add per-type category

## Summary
Removes the `title` and `teaching_category` columns from the `questions` table
and replaces them with a flexible `category` (text) and `category_secondary`
(text) pair that supports per-question-type categorization. Updates the
similarity search function and indexes accordingly.

## Why this migration is required
1. The `title` column is no longer used — the Prompt (`content`) is now the
   primary identifier of a question.
2. The `teaching_category` free-text field is replaced by per-type category
   dropdowns/fields. A single `category` column cannot represent the variety
   needed (Speaking Part 1 has two free-text topics, others have dropdowns
   with "Others" custom text), so we need `category` (primary) and
   `category_secondary` (secondary, used for Speaking Part 1 Topic 2 or as
   the "Others" custom text).

## Dropped Columns
### questions
  - `title` — removed; Prompt is now the primary identifier
  - `teaching_category` — removed; replaced by per-type category system

## New Columns
### questions
  - `category` (text, nullable) — primary category per question type
  - `category_secondary` (text, nullable) — secondary category

## Updated Objects
  - `search_similar_questions` — dropped and recreated to drop title from return
  - Indexes — dropped old, added new

## Notes
  1. The `content` column (Prompt) remains the primary identifier.
  2. All other columns are unchanged.
  3. RLS policies are unchanged.
*/

-- ── 1. Drop title and teaching_category ───────────────────
ALTER TABLE questions DROP COLUMN IF EXISTS title;
ALTER TABLE questions DROP COLUMN IF EXISTS teaching_category;

-- ── 2. Add category columns ────────────────────────────────
ALTER TABLE questions ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS category_secondary text;

-- ── 3. Update indexes ───────────────────────────────────────
DROP INDEX IF EXISTS idx_questions_teaching_category;
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);

-- ── 4. Update similarity search function ────────────────────
DROP FUNCTION IF EXISTS search_similar_questions(text, real, bigint);

CREATE FUNCTION search_similar_questions(
  p_prompt text,
  p_threshold real DEFAULT 0.3,
  p_exclude_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  content text,
  type_name text,
  category text,
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
    q.content,
    qt.name AS type_name,
    q.category,
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