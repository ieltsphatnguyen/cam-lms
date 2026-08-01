/*
# 012 — Fix: add missing FK from assignment_templates to profiles

## Summary
Adds the foreign key constraint from `assignment_templates.owner_id` to
`profiles.id` that was omitted from migration 011.

## Why this migration is required
Migration 011 created the `assignment_templates` table with an `owner_id`
column (uuid, default auth.uid()) but did not add a foreign key constraint
to `profiles(id)`. The application's `fetchTemplates` function queries
`profiles!assignment_templates_owner_id_fkey(display_name)` to join the
owner's display name. Without the FK, PostgREST returns a PGRST200 error:
"Could not find a relationship between 'assignment_templates' and
'profiles' in the schema cache".

This caused two regressions:
1. Assignment Templates page shows "Failed to load templates."
2. The PostgREST schema cache refresh triggered by migration 011 may
   have left the cache in a state where other joins (e.g. questions →
   questiontypes) are also not resolved, causing the Question Bank to
   display 0 questions.

## Fix
  1. Add the FK constraint `assignment_templates_owner_id_fkey`.
  2. Reload the PostgREST schema cache via NOTIFY so all relationships
     (including the pre-existing questions → questiontypes join) are
     re-cached correctly.

## Notes
  - No data is lost; this only adds a constraint.
  - The FK name matches what the application code expects.
*/

ALTER TABLE assignment_templates
  ADD CONSTRAINT assignment_templates_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES profiles(id);

-- Force PostgREST to reload its schema cache so all relationships
-- (including pre-existing ones like questions → questiontypes) are
-- re-resolved correctly after the DDL change.
NOTIFY pgrst, 'reload schema';