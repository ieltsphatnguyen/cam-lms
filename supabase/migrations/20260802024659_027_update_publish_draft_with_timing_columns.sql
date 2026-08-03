/*
# Update publish_draft to snapshot prep_time_seconds and recording_time_seconds
*/
CREATE OR REPLACE FUNCTION public.publish_draft(p_draft_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
IF v_draft.owner_id != auth.uid() AND get_my_role() != 'admin' THEN
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
selection_order, available_from, due_date, due_after_days, timed, time_limit,
prep_time_seconds, recording_time_seconds
) VALUES (
v_published_id, v_item.question_id,
v_question.content, v_question.type_id, COALESCE(v_type_name, 'Unknown'),
v_question.response_type, v_question.image_url,
v_question.custom_type_name, v_question.custom_instructions, v_question.category, v_question.category_secondary,
v_question.tags, v_question.ielts_band, v_question.description,
v_item.selection_order, v_item.available_from, v_item.due_date,
v_item.due_after_days, v_item.timed, v_item.time_limit,
v_item.prep_time_seconds, v_item.recording_time_seconds
);
END LOOP;

UPDATE assignment_drafts SET status = 'published' WHERE id = p_draft_id;

RETURN v_published_id;
END;
$function$;
