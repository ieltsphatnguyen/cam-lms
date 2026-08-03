/*
# Secure resolve_template_to_draft RPC

## Purpose
The `resolve_template_to_draft` RPC currently accepts `p_owner_id` as a
parameter from the frontend. Because it is a SECURITY DEFINER function, a
malicious caller could supply another user's UUID and create a draft owned
by someone else. This migration removes the `p_owner_id` parameter and
determines the owner from `auth.uid()` inside the function.

## Changes
1. Drop the existing `resolve_template_to_draft` function
2. Recreate it with `p_owner_id` removed; use `auth.uid()` instead
3. Add an explicit authentication check: raise exception if `auth.uid()` is NULL

## Security
- The owner is now determined server-side from the authenticated session.
- Unauthenticated calls are rejected with an error.
- All existing draft creation functionality is preserved (same logic, same
  return shape).
*/

DROP FUNCTION IF EXISTS resolve_template_to_draft(bigint, bigint, text, text, uuid);

CREATE OR REPLACE FUNCTION resolve_template_to_draft(
  p_template_id bigint,
  p_class_id bigint,
  p_draft_name text,
  p_draft_description text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_draft_id bigint;
  v_owner_id uuid := auth.uid();
  v_used_ids bigint[] := ARRAY[]::bigint[];
  v_qid bigint;
  v_order integer := 0;
  v_unresolved integer := 0;
  v_result json;
BEGIN
  -- Reject unauthenticated calls
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create assignment drafts';
  END IF;

  -- Create the draft
  INSERT INTO assignment_drafts (name, description, template_id, class_id, owner_id, status)
  VALUES (p_draft_name, p_draft_description, p_template_id, p_class_id, v_owner_id, 'draft')
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
$function$;
