-- Fix compute_overall_band to use project rounding rules
-- .00 → .0, .25 → .0, .50 → .5, .75 → .5
-- (truncate, not IELTS round-up)

CREATE OR REPLACE FUNCTION public.compute_overall_band(p_attempt_id bigint)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_avg numeric;
  v_count integer;
  v_scores numeric[];
  v_floor numeric;
  v_remainder numeric;
  v_result numeric;
BEGIN
  SELECT array_agg(score), count(*)
  INTO v_scores, v_count
  FROM criterion_scores
  WHERE attempt_id = p_attempt_id
  AND score IS NOT NULL;

  IF v_count = 0 OR v_count < 4 THEN
    RETURN NULL;
  END IF;

  SELECT avg(x) INTO v_avg FROM unnest(v_scores) AS x;

  v_floor := floor(v_avg);
  v_remainder := v_avg - v_floor;

  IF v_remainder < 0.25 THEN
    v_result := v_floor;
  ELSIF v_remainder < 0.75 THEN
    v_result := v_floor + 0.5;
  ELSE
    v_result := v_floor + 1.0;
  END IF;

  RETURN v_result;
END;
$function$;
