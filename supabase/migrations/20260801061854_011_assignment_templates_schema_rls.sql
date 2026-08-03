/*
# 011 — Assignment Templates: schema, RLS, duplicate detection function

## Summary
Creates two new tables — `assignment_templates` and `assignment_template_questions` —
to store reusable assignment blueprints that reference Question Bank questions.
Enables RLS with ownership-based policies. Adds a SECURITY DEFINER function for
duplicate template detection.

## Why this migration is required
The current schema has no tables for assignment templates. The Question Bank
(`questions` table) stores individual reusable questions, but there is no way
to group multiple questions into a reusable assignment blueprint. Assignment
Templates are a new concept that requires new tables.

## New Tables

### assignment_templates
  - `id` (bigint, PK, identity)
  - `name` (text, NOT NULL) — template name
  - `description` (text, nullable) — optional description
  - `owner_id` (uuid, NOT NULL, default auth.uid()) — owner for RLS
  - `status` (text, NOT NULL, default 'active') — 'active' | 'archived'
  - `archived_at` (timestamptz, nullable)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

### assignment_template_questions
  - `id` (bigint, PK, identity)
  - `template_id` (bigint, FK → assignment_templates.id ON DELETE CASCADE)
  - `question_id` (bigint, FK → questions.id ON DELETE CASCADE)
  - `selection_order` (integer, NOT NULL) — selection order
  - `created_at` (timestamptz, default now())

## Constraints
  - `assignment_templates_status_check` — status IN ('active', 'archived')
  - UNIQUE (template_id, question_id) — prevents duplicate questions in a template

## RLS
  - assignment_templates: SELECT (all authenticated), INSERT (teacher/admin, owner),
    UPDATE (owner/admin), DELETE (admin only)
  - assignment_template_questions: SELECT (all authenticated), INSERT/UPDATE/DELETE
    (owner of parent template or admin)

## Duplicate Detection
  - `check_duplicate_template(p_question_ids bigint[])` — SECURITY DEFINER
  - Returns the ID and name of the first active template with the exact same
    set of question IDs, or NULL if no duplicate exists
*/

-- ── 1. assignment_templates table ──────────────────────────
CREATE TABLE IF NOT EXISTS assignment_templates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'active',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2. assignment_template_questions table ─────────────────
CREATE TABLE IF NOT EXISTS assignment_template_questions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id bigint NOT NULL REFERENCES assignment_templates(id) ON DELETE CASCADE,
  question_id bigint NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selection_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_template_questions_template_id_question_id_key UNIQUE (template_id, question_id)
);

-- ── 3. CHECK constraints ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_templates_status_check') THEN
    ALTER TABLE assignment_templates ADD CONSTRAINT assignment_templates_status_check CHECK (status IN ('active', 'archived'));
  END IF;
END $$;

-- ── 4. updated_at trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION assignment_templates_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assignment_templates_set_updated_at ON assignment_templates;
CREATE TRIGGER assignment_templates_set_updated_at
  BEFORE UPDATE ON assignment_templates
  FOR EACH ROW
  EXECUTE FUNCTION assignment_templates_set_updated_at();

-- ── 5. Enable RLS ──────────────────────────────────────────
ALTER TABLE assignment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_template_questions ENABLE ROW LEVEL SECURITY;

-- ── 6. RLS policies on assignment_templates ────────────────
DROP POLICY IF EXISTS "select_assignment_templates" ON assignment_templates;
CREATE POLICY "select_assignment_templates" ON assignment_templates
  FOR SELECT TO authenticated
  USING (can_current_user_access());

DROP POLICY IF EXISTS "insert_assignment_templates" ON assignment_templates;
CREATE POLICY "insert_assignment_templates" ON assignment_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('teacher', 'admin')
    AND owner_id = auth.uid()
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "update_assignment_templates" ON assignment_templates;
CREATE POLICY "update_assignment_templates" ON assignment_templates
  FOR UPDATE TO authenticated
  USING (
    (owner_id = auth.uid() OR get_my_role() = 'admin')
    AND can_current_user_access()
  )
  WITH CHECK (
    (owner_id = auth.uid() OR get_my_role() = 'admin')
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "delete_assignment_templates" ON assignment_templates;
CREATE POLICY "delete_assignment_templates" ON assignment_templates
  FOR DELETE TO authenticated
  USING (
    get_my_role() = 'admin'
    AND can_current_user_access()
  );

-- ── 7. RLS policies on assignment_template_questions ───────
DROP POLICY IF EXISTS "select_atq" ON assignment_template_questions;
CREATE POLICY "select_atq" ON assignment_template_questions
  FOR SELECT TO authenticated
  USING (can_current_user_access());

DROP POLICY IF EXISTS "insert_atq" ON assignment_template_questions;
CREATE POLICY "insert_atq" ON assignment_template_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignment_templates t
      WHERE t.id = assignment_template_questions.template_id
      AND (t.owner_id = auth.uid() OR get_my_role() = 'admin')
      AND can_current_user_access()
    )
  );

DROP POLICY IF EXISTS "update_atq" ON assignment_template_questions;
CREATE POLICY "update_atq" ON assignment_template_questions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignment_templates t
      WHERE t.id = assignment_template_questions.template_id
      AND (t.owner_id = auth.uid() OR get_my_role() = 'admin')
      AND can_current_user_access()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignment_templates t
      WHERE t.id = assignment_template_questions.template_id
      AND (t.owner_id = auth.uid() OR get_my_role() = 'admin')
      AND can_current_user_access()
    )
  );

DROP POLICY IF EXISTS "delete_atq" ON assignment_template_questions;
CREATE POLICY "delete_atq" ON assignment_template_questions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignment_templates t
      WHERE t.id = assignment_template_questions.template_id
      AND (t.owner_id = auth.uid() OR get_my_role() = 'admin')
      AND can_current_user_access()
    )
  );

-- ── 8. Indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assignment_templates_owner_id ON assignment_templates(owner_id);
CREATE INDEX IF NOT EXISTS idx_assignment_templates_status ON assignment_templates(status);
CREATE INDEX IF NOT EXISTS idx_atq_template_id ON assignment_template_questions(template_id);
CREATE INDEX IF NOT EXISTS idx_atq_question_id ON assignment_template_questions(question_id);

-- ── 9. Duplicate detection function ─────────────────────────
CREATE OR REPLACE FUNCTION check_duplicate_template(
  p_question_ids bigint[]
)
RETURNS TABLE (
  id bigint,
  name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name
  FROM assignment_templates t
  JOIN assignment_template_questions atq ON atq.template_id = t.id
  WHERE t.status = 'active'
  GROUP BY t.id, t.name
  HAVING array_agg(atq.question_id ORDER BY atq.question_id) = p_question_ids
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION check_duplicate_template(bigint[]) TO authenticated;