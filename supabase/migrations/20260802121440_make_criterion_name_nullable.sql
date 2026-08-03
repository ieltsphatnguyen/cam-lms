-- Make annotations.criterion_name nullable so annotations can exist
-- without a criterion (criterion is optional per the annotation architecture).
ALTER TABLE annotations ALTER COLUMN criterion_name DROP NOT NULL;

-- Update move_annotation to handle null criterion_id (moving to "Uncategorized").
-- When criterion_id is null, set criterion_name to null and keep the passed highlight_color.
CREATE OR REPLACE FUNCTION public.move_annotation(
  p_annotation_id bigint,
  p_criterion_id bigint,
  p_highlight_color text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_criterion_name text;
BEGIN
  IF NOT can_annotate_attempt((SELECT attempt_id FROM annotations WHERE id = p_annotation_id)) THEN
    RAISE EXCEPTION 'Not authorized to move this annotation';
  END IF;

  IF p_criterion_id IS NOT NULL THEN
    SELECT name INTO v_criterion_name FROM rubric_criteria WHERE id = p_criterion_id;
  END IF;

  UPDATE annotations
  SET criterion_id = p_criterion_id,
      criterion_name = v_criterion_name,
      highlight_color = p_highlight_color,
      updated_at = now()
  WHERE id = p_annotation_id;
END;
$function$;
