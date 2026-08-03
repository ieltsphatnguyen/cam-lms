-- Drop legacy grading tables that are confirmed unused.
-- All have 0 rows, no frontend code references, and no active RPC dependencies.
-- Order: children first (FK dependents), then parents.
-- KEEP: rubrics, rubriccriteria (per milestone instructions).

DROP TABLE IF EXISTS public.inlineannotations CASCADE;
DROP TABLE IF EXISTS public.studentsubmissions CASCADE;
DROP TABLE IF EXISTS public.criterionscores CASCADE;
DROP TABLE IF EXISTS public.studentassignmentitems CASCADE;
DROP TABLE IF EXISTS public.publishedassignments CASCADE;
DROP TABLE IF EXISTS public.generalfeedback CASCADE;
