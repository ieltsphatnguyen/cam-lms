/*
# Preset Favorites + Unpublish Workflow

## 1. New Table: assignment_template_favorites
- Per-teacher favorite markers for assignment templates (presets).
- Columns:
  - id (bigint PK, identity)
  - template_id (bigint FK → assignment_templates.id, ON DELETE CASCADE)
  - user_id (uuid FK → auth.users.id, ON DELETE CASCADE, DEFAULT auth.uid())
  - created_at (timestamptz, default now())
- Unique constraint on (template_id, user_id) — one favorite per user per template.
- Index on user_id for fast "my favorites" queries.

## 2. Security
- RLS enabled on assignment_template_favorites.
- 4 policies (SELECT/INSERT/UPDATE/DELETE), all scoped TO authenticated,
  ownership check auth.uid() = user_id.

## 3. New Function: unpublish_draft(p_published_id bigint)
- SECURITY DEFINER, search_path = public.
- Converts a Published Assignment back into an editable Draft.
- Steps:
  1. Look up the published_assignment by id.
  2. Verify ownership: published_assignments.owner_id = auth.uid()
     OR get_my_role() = 'admin'.
  3. Delete all published_assignment_items for that published_assignment.
  4. Delete the published_assignment row itself.
  5. Set the source assignment_drafts.status back to 'draft'.
- Returns the draft_id on success.
- Since submissions are not yet implemented, unpublish is allowed unconditionally.
*/

-- ── Favorites table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignment_template_favorites (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id bigint NOT NULL REFERENCES assignment_templates(id) ON DELETE CASCADE,
  user_id    uuid   NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE assignment_template_favorites ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_template_user_favorite
  ON assignment_template_favorites (template_id, user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_user
  ON assignment_template_favorites (user_id);

DROP POLICY IF EXISTS "select_own_favorites" ON assignment_template_favorites;
CREATE POLICY "select_own_favorites"
  ON assignment_template_favorites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_favorites" ON assignment_template_favorites;
CREATE POLICY "insert_own_favorites"
  ON assignment_template_favorites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_favorites" ON assignment_template_favorites;
CREATE POLICY "update_own_favorites"
  ON assignment_template_favorites FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_favorites" ON assignment_template_favorites;
CREATE POLICY "delete_own_favorites"
  ON assignment_template_favorites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── Unpublish function ───────────────────────────────────────
CREATE OR REPLACE FUNCTION unpublish_draft(p_published_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_published published_assignments%ROWTYPE;
BEGIN
  SELECT * INTO v_published FROM published_assignments WHERE id = p_published_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published assignment not found';
  END IF;

  IF v_published.owner_id != auth.uid() AND get_my_role() != 'admin' THEN
    RAISE EXCEPTION 'Not authorized to unpublish this assignment';
  END IF;

  DELETE FROM published_assignment_items WHERE published_assignment_id = p_published_id;
  DELETE FROM published_assignments WHERE id = p_published_id;

  UPDATE assignment_drafts SET status = 'draft' WHERE id = v_published.draft_id;

  RETURN v_published.draft_id;
END;
$$;
