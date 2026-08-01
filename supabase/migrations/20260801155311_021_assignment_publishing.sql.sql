-- Published Assignments: immutable snapshots of drafts at publish time.
-- Students see published assignments; drafts remain private to the teacher.

CREATE TABLE published_assignments (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  draft_id bigint NOT NULL REFERENCES assignment_drafts(id),
  class_id bigint NOT NULL REFERENCES classes(id),
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX published_assignments_draft_id_unique
  ON published_assignments (draft_id);

CREATE INDEX published_assignments_class_id_idx
  ON published_assignments (class_id);

CREATE TABLE published_assignment_items (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  published_assignment_id bigint NOT NULL REFERENCES published_assignments(id) ON DELETE CASCADE,
  question_id bigint NOT NULL,
  content text NOT NULL,
  type_id bigint NOT NULL,
  type_name text NOT NULL,
  response_type text NOT NULL DEFAULT 'text',
  image_url text,
  custom_type_name text,
  custom_instructions text,
  category text,
  category_secondary text,
  tags text[] DEFAULT '{}',
  ielts_band text,
  description text,
  selection_order integer NOT NULL,
  available_from timestamptz,
  due_date timestamptz,
  due_after_days integer,
  timed boolean NOT NULL DEFAULT false,
  time_limit interval
);

CREATE INDEX published_assignment_items_pub_id_idx
  ON published_assignment_items (published_assignment_id);

ALTER TABLE published_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE published_assignment_items ENABLE ROW LEVEL SECURITY;

-- published_assignments: teachers see their own, students see enrolled classes
CREATE POLICY "select_published" ON published_assignments
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR class_id IN (
      SELECT cs.class_id FROM classstudents cs
      WHERE cs.student_id = (SELECT student_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "insert_published" ON published_assignments
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "update_published" ON published_assignments
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "delete_published" ON published_assignments
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- published_assignment_items: same visibility as parent
CREATE POLICY "select_published_items" ON published_assignment_items
  FOR SELECT TO authenticated
  USING (
    published_assignment_id IN (
      SELECT id FROM published_assignments
      WHERE owner_id = auth.uid()
        OR class_id IN (
          SELECT cs.class_id FROM classstudents cs
          WHERE cs.student_id = (SELECT student_id FROM profiles WHERE id = auth.uid())
        )
    )
  );

CREATE POLICY "insert_published_items" ON published_assignment_items
  FOR INSERT TO authenticated
  WITH CHECK (
    published_assignment_id IN (
      SELECT id FROM published_assignments WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "update_published_items" ON published_assignment_items
  FOR UPDATE TO authenticated
  USING (
    published_assignment_id IN (
      SELECT id FROM published_assignments WHERE owner_id = auth.uid()
    )
  ) WITH CHECK (
    published_assignment_id IN (
      SELECT id FROM published_assignments WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "delete_published_items" ON published_assignment_items
  FOR DELETE TO authenticated
  USING (
    published_assignment_id IN (
      SELECT id FROM published_assignments WHERE owner_id = auth.uid()
    )
  );

-- publish_draft: atomically convert a draft into a published assignment
-- with snapshotted question content. Random rules are already resolved
-- in the draft questions, so we snapshot them as-is.
CREATE OR REPLACE FUNCTION publish_draft(p_draft_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft assignment_drafts%ROWTYPE;
  v_published_id bigint;
  v_item assignment_draft_questions%ROWTYPE;
  v_question questions%ROWTYPE;
  v_type_name text;
BEGIN
  SELECT * INTO v_draft FROM assignment_drafts WHERE id = p_draft_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft not found';
  END IF;
  IF v_draft.owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to publish this draft';
  END IF;
  IF v_draft.status = 'published' THEN
    RAISE EXCEPTION 'This assignment has already been published';
  END IF;
  IF v_draft.class_id IS NULL THEN
    RAISE EXCEPTION 'Target class is required';
  END IF;
  IF v_draft.name IS NULL OR trim(v_draft.name) = '' THEN
    RAISE EXCEPTION 'Assignment name is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM assignment_draft_questions WHERE draft_id = p_draft_id) THEN
    RAISE EXCEPTION 'At least one assignment item is required';
  END IF;

  INSERT INTO published_assignments (draft_id, class_id, name, description, owner_id)
  VALUES (v_draft.id, v_draft.class_id, v_draft.name, v_draft.description, v_draft.owner_id)
  RETURNING id INTO v_published_id;

  FOR v_item IN SELECT * FROM assignment_draft_questions WHERE draft_id = p_draft_id ORDER BY selection_order LOOP
    SELECT * INTO v_question FROM questions WHERE id = v_item.question_id;
    SELECT name INTO v_type_name FROM questiontypes WHERE id = v_question.type_id;

    INSERT INTO published_assignment_items (
      published_assignment_id, question_id,
      content, type_id, type_name, response_type, image_url,
      custom_type_name, custom_instructions, category, category_secondary,
      tags, ielts_band, description,
      selection_order, available_from, due_date, due_after_days, timed, time_limit
    ) VALUES (
      v_published_id, v_item.question_id,
      v_question.content, v_question.type_id, COALESCE(v_type_name, 'Unknown'),
      v_question.response_type, v_question.image_url,
      v_question.custom_type_name, v_question.custom_instructions,
      v_question.category, v_question.category_secondary,
      v_question.tags, v_question.ielts_band, v_question.description,
      v_item.selection_order, v_item.available_from, v_item.due_date,
      v_item.due_after_days, v_item.timed, v_item.time_limit
    );
  END LOOP;

  UPDATE assignment_drafts SET status = 'published' WHERE id = p_draft_id;

  RETURN v_published_id;
END;
$$;

GRANT EXECUTE ON FUNCTION publish_draft(bigint) TO authenticated;