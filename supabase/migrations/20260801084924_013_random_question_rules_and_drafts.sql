/*
# 013 — Dynamic Random Question Rules + Assignment Drafts

## Summary
This migration introduces **Dynamic Random Question Rules** for Assignment Templates
and the **Assignment Draft** resolution flow. Templates can now contain either fixed
Question Bank questions (existing behaviour, unchanged) or Random Question Rules
that describe what *kind* of question to pick later. When a teacher creates an
Assignment Draft from a template, every Random Rule is resolved into exactly one
real Question Bank question. The draft then stores fixed Question IDs and never
re-randomises.

## New Tables

### assignment_template_random_rules
  - `id` (bigint, PK, identity)
  - `template_id` (bigint, FK → assignment_templates.id ON DELETE CASCADE)
  - `rule_order` (integer, NOT NULL) — ordering within the template
  - `question_type_id` (bigint, NOT NULL) — which Question Type to match
  - `response_type` (text, NOT NULL) — 'text' | 'audio'
  - `category` (text, nullable) — optional category filter
  - `tags` (text[], nullable) — optional tag filter
  - `created_at` (timestamptz, default now())

  A Random Rule stores ONLY: Question Type, Response Type, Category (optional),
  Tags (optional). It never stores a Question ID, prompt, description, image, or
  any copied Question Bank content.

### assignment_drafts
  - `id` (bigint, PK, identity)
  - `name` (text, NOT NULL)
  - `description` (text, nullable)
  - `template_id` (bigint, nullable, FK → assignment_templates.id)
  - `class_id` (bigint, nullable, FK → classes.id)
  - `owner_id` (uuid, NOT NULL, default auth.uid())
  - `status` (text, NOT NULL, default 'draft') — 'draft' | 'published'
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

### assignment_draft_questions
  - `id` (bigint, PK, identity)
  - `draft_id` (bigint, FK → assignment_drafts.id ON DELETE CASCADE)
  - `question_id` (bigint, FK → questions.id ON DELETE CASCADE)
  - `selection_order` (integer, NOT NULL)
  - `created_at` (timestamptz, default now())

  After resolution, each Random Rule becomes exactly one row here with a real
  Question Bank question ID. Fixed template questions are also copied here.

## Security
  - RLS enabled on all three new tables.
  - assignment_template_random_rules: SELECT (all authenticated), INSERT/UPDATE/DELETE
    (owner of parent template or admin).
  - assignment_drafts: full ownership-based CRUD (owner or admin).
  - assignment_draft_questions: scoped through parent draft ownership.

## Resolution Functions
  - `resolve_random_rule` — given a rule's filters + already-used question IDs + class
    history, returns a single matching question ID (preferring unused questions).
  - `resolve_template_to_draft` — resolves ALL rules in a template into real questions
    and inserts draft + draft_questions rows. Returns the new draft ID.

## Important Notes
  1. Existing `assignment_template_questions` table is UNCHANGED — fixed-question
     templates continue working without modification.
  2. No existing table columns are dropped or renamed.
  3. Canonical ordering is preserved: rules and fixed questions share the same
     `selection_order` / `rule_order` space, ordered by question type rank.
  4. Randomisation occurs ONLY during draft creation — never during publishing,
     student access, or grading.
*/

-- ── 1. assignment_template_random_rules ───────────────────
CREATE TABLE IF NOT EXISTS assignment_template_random_rules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id bigint NOT NULL REFERENCES assignment_templates(id) ON DELETE CASCADE,
  rule_order integer NOT NULL,
  question_type_id bigint NOT NULL,
  response_type text NOT NULL,
  category text,
  tags text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2. assignment_drafts ──────────────────────────────────
CREATE TABLE IF NOT EXISTS assignment_drafts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  description text,
  template_id bigint REFERENCES assignment_templates(id),
  class_id bigint REFERENCES classes(id),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 3. assignment_draft_questions ─────────────────────────
CREATE TABLE IF NOT EXISTS assignment_draft_questions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id bigint NOT NULL REFERENCES assignment_drafts(id) ON DELETE CASCADE,
  question_id bigint NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selection_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_draft_questions_draft_id_question_id_key UNIQUE (draft_id, question_id)
);

-- ── 4. CHECK constraints ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_drafts_status_check') THEN
    ALTER TABLE assignment_drafts ADD CONSTRAINT assignment_drafts_status_check
      CHECK (status IN ('draft', 'published'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atrr_response_type_check') THEN
    ALTER TABLE assignment_template_random_rules ADD CONSTRAINT atrr_response_type_check
      CHECK (response_type IN ('text', 'audio'));
  END IF;
END $$;

-- ── 5. updated_at trigger for drafts ──────────────────────
CREATE OR REPLACE FUNCTION assignment_drafts_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assignment_drafts_set_updated_at ON assignment_drafts;
CREATE TRIGGER assignment_drafts_set_updated_at
  BEFORE UPDATE ON assignment_drafts
  FOR EACH ROW
  EXECUTE FUNCTION assignment_drafts_set_updated_at();

-- ── 6. Enable RLS ─────────────────────────────────────────
ALTER TABLE assignment_template_random_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_draft_questions ENABLE ROW LEVEL SECURITY;

-- ── 7. RLS: assignment_template_random_rules ──────────────
DROP POLICY IF EXISTS "select_atrr" ON assignment_template_random_rules;
CREATE POLICY "select_atrr" ON assignment_template_random_rules
  FOR SELECT TO authenticated
  USING (can_current_user_access());

DROP POLICY IF EXISTS "insert_atrr" ON assignment_template_random_rules;
CREATE POLICY "insert_atrr" ON assignment_template_random_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignment_templates t
      WHERE t.id = assignment_template_random_rules.template_id
      AND (t.owner_id = auth.uid() OR get_my_role() = 'admin')
      AND can_current_user_access()
    )
  );

DROP POLICY IF EXISTS "update_atrr" ON assignment_template_random_rules;
CREATE POLICY "update_atrr" ON assignment_template_random_rules
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignment_templates t
      WHERE t.id = assignment_template_random_rules.template_id
      AND (t.owner_id = auth.uid() OR get_my_role() = 'admin')
      AND can_current_user_access()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignment_templates t
      WHERE t.id = assignment_template_random_rules.template_id
      AND (t.owner_id = auth.uid() OR get_my_role() = 'admin')
      AND can_current_user_access()
    )
  );

DROP POLICY IF EXISTS "delete_atrr" ON assignment_template_random_rules;
CREATE POLICY "delete_atrr" ON assignment_template_random_rules
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignment_templates t
      WHERE t.id = assignment_template_random_rules.template_id
      AND (t.owner_id = auth.uid() OR get_my_role() = 'admin')
      AND can_current_user_access()
    )
  );

-- ── 8. RLS: assignment_drafts ─────────────────────────────
DROP POLICY IF EXISTS "select_assignment_drafts" ON assignment_drafts;
CREATE POLICY "select_assignment_drafts" ON assignment_drafts
  FOR SELECT TO authenticated
  USING (can_current_user_access());

DROP POLICY IF EXISTS "insert_assignment_drafts" ON assignment_drafts;
CREATE POLICY "insert_assignment_drafts" ON assignment_drafts
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('teacher', 'admin')
    AND owner_id = auth.uid()
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "update_assignment_drafts" ON assignment_drafts;
CREATE POLICY "update_assignment_drafts" ON assignment_drafts
  FOR UPDATE TO authenticated
  USING (
    (owner_id = auth.uid() OR get_my_role() = 'admin')
    AND can_current_user_access()
  )
  WITH CHECK (
    (owner_id = auth.uid() OR get_my_role() = 'admin')
    AND can_current_user_access()
  );

DROP POLICY IF EXISTS "delete_assignment_drafts" ON assignment_drafts;
CREATE POLICY "delete_assignment_drafts" ON assignment_drafts
  FOR DELETE TO authenticated
  USING (
    (owner_id = auth.uid() OR get_my_role() = 'admin')
    AND can_current_user_access()
  );

-- ── 9. RLS: assignment_draft_questions ────────────────────
DROP POLICY IF EXISTS "select_adq" ON assignment_draft_questions;
CREATE POLICY "select_adq" ON assignment_draft_questions
  FOR SELECT TO authenticated
  USING (can_current_user_access());

DROP POLICY IF EXISTS "insert_adq" ON assignment_draft_questions;
CREATE POLICY "insert_adq" ON assignment_draft_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignment_drafts d
      WHERE d.id = assignment_draft_questions.draft_id
      AND (d.owner_id = auth.uid() OR get_my_role() = 'admin')
      AND can_current_user_access()
    )
  );

DROP POLICY IF EXISTS "update_adq" ON assignment_draft_questions;
CREATE POLICY "update_adq" ON assignment_draft_questions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignment_drafts d
      WHERE d.id = assignment_draft_questions.draft_id
      AND (d.owner_id = auth.uid() OR get_my_role() = 'admin')
      AND can_current_user_access()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignment_drafts d
      WHERE d.id = assignment_draft_questions.draft_id
      AND (d.owner_id = auth.uid() OR get_my_role() = 'admin')
      AND can_current_user_access()
    )
  );

DROP POLICY IF EXISTS "delete_adq" ON assignment_draft_questions;
CREATE POLICY "delete_adq" ON assignment_draft_questions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignment_drafts d
      WHERE d.id = assignment_draft_questions.draft_id
      AND (d.owner_id = auth.uid() OR get_my_role() = 'admin')
      AND can_current_user_access()
    )
  );

-- ── 10. Indexes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_atrr_template_id ON assignment_template_random_rules(template_id);
CREATE INDEX IF NOT EXISTS idx_assignment_drafts_owner_id ON assignment_drafts(owner_id);
CREATE INDEX IF NOT EXISTS idx_assignment_drafts_class_id ON assignment_drafts(class_id);
CREATE INDEX IF NOT EXISTS idx_assignment_drafts_template_id ON assignment_drafts(template_id);
CREATE INDEX IF NOT EXISTS idx_adq_draft_id ON assignment_draft_questions(draft_id);
CREATE INDEX IF NOT EXISTS idx_adq_question_id ON assignment_draft_questions(question_id);

-- ── 11. resolve_random_rule function ──────────────────────
-- Given a rule's filters, a set of already-used question IDs (within this draft),
-- and optionally a class_id for per-class history exclusion, returns a single
-- matching question ID. Prefers questions never previously assigned to the class.
-- Returns NULL if no match found.
CREATE OR REPLACE FUNCTION resolve_random_rule(
  p_question_type_id bigint,
  p_response_type text,
  p_category text,
  p_tags text[],
  p_used_question_ids bigint[],
  p_class_id bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result bigint;
  v_has_class boolean := p_class_id IS NOT NULL;
BEGIN
  -- First priority: matching questions NOT already used for this class
  -- (and not already selected in this draft)
  IF v_has_class THEN
    SELECT q.id INTO v_result
    FROM questions q
    WHERE q.type_id = p_question_type_id
      AND q.response_type = p_response_type
      AND q.status = 'active'
      AND (p_category IS NULL OR q.category = p_category)
      AND (p_tags IS NULL OR array_length(p_tags, 1) IS NULL OR q.tags && p_tags)
      AND (p_used_question_ids IS NULL OR array_length(p_used_question_ids, 1) IS NULL OR NOT (q.id = ANY(p_used_question_ids)))
      AND NOT EXISTS (
        SELECT 1
        FROM assignment_draft_questions adq
        JOIN assignment_drafts d ON d.id = adq.draft_id
        WHERE d.class_id = p_class_id
          AND adq.question_id = q.id
      )
    ORDER BY random()
    LIMIT 1;
  END IF;

  -- If class-scoped search found nothing (or no class), fall back to any matching
  -- question not already used in this draft
  IF v_result IS NULL THEN
    SELECT q.id INTO v_result
    FROM questions q
    WHERE q.type_id = p_question_type_id
      AND q.response_type = p_response_type
      AND q.status = 'active'
      AND (p_category IS NULL OR q.category = p_category)
      AND (p_tags IS NULL OR array_length(p_tags, 1) IS NULL OR q.tags && p_tags)
      AND (p_used_question_ids IS NULL OR array_length(p_used_question_ids, 1) IS NULL OR NOT (q.id = ANY(p_used_question_ids)))
    ORDER BY random()
    LIMIT 1;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_random_rule(bigint, text, text, text[], bigint[], bigint) TO authenticated;

-- ── 12. resolve_template_to_draft function ────────────────
-- Resolves ALL random rules in a template into real questions, copies fixed
-- template questions, and creates an assignment_draft with draft_questions.
-- Returns a JSON object: { draft_id bigint, unresolved_rules integer }
-- If unresolved_rules > 0, the caller should warn the teacher.
CREATE OR REPLACE FUNCTION resolve_template_to_draft(
  p_template_id bigint,
  p_class_id bigint,
  p_draft_name text,
  p_draft_description text,
  p_owner_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft_id bigint;
  v_used_ids bigint[] := ARRAY[]::bigint[];
  v_qid bigint;
  v_order integer := 0;
  v_unresolved integer := 0;
  v_result json;
BEGIN
  -- Create the draft
  INSERT INTO assignment_drafts (name, description, template_id, class_id, owner_id, status)
  VALUES (p_draft_name, p_draft_description, p_template_id, p_class_id, p_owner_id, 'draft')
  RETURNING id INTO v_draft_id;

  -- Copy fixed template questions (preserving selection_order)
  FOR v_qid, v_order IN
    SELECT question_id, selection_order
    FROM assignment_template_questions
    WHERE template_id = p_template_id
    ORDER BY selection_order
  LOOP
    INSERT INTO assignment_draft_questions (draft_id, question_id, selection_order)
    VALUES (v_draft_id, v_qid, v_order);
    v_used_ids := array_append(v_used_ids, v_qid);
  END LOOP;

  -- Resolve random rules
  FOR v_qid, v_order IN
    SELECT id, rule_order
    FROM assignment_template_random_rules
    WHERE template_id = p_template_id
    ORDER BY rule_order
  LOOP
    DECLARE
      v_rule_id bigint := v_qid;
      v_rule_order integer := v_order;
      v_type_id bigint;
      v_resp_type text;
      v_category text;
      v_tags text[];
      v_resolved_qid bigint;
    BEGIN
      SELECT question_type_id, response_type, category, tags
      INTO v_type_id, v_resp_type, v_category, v_tags
      FROM assignment_template_random_rules
      WHERE id = v_rule_id;

      v_resolved_qid := resolve_random_rule(
        v_type_id, v_resp_type, v_category, v_tags, v_used_ids, p_class_id
      );

      IF v_resolved_qid IS NULL THEN
        v_unresolved := v_unresolved + 1;
      ELSE
        INSERT INTO assignment_draft_questions (draft_id, question_id, selection_order)
        VALUES (v_draft_id, v_resolved_qid, v_rule_order);
        v_used_ids := array_append(v_used_ids, v_resolved_qid);
      END IF;
    END;
  END LOOP;

  SELECT json_build_object(
    'draft_id', v_draft_id,
    'unresolved_rules', v_unresolved
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_template_to_draft(bigint, bigint, text, text, uuid) TO authenticated;
