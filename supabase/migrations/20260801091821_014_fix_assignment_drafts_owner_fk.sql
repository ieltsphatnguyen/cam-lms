/*
# 014 — Fix: add missing FK from assignment_drafts to profiles

## Summary
Adds the foreign key constraint from `assignment_drafts.owner_id` to
`profiles(id)` that was omitted from migration 013.

## Why this migration is required
Migration 013 created the `assignment_drafts` table with an `owner_id`
column (uuid, default auth.uid()) but did not add a foreign key constraint
to `profiles(id)`. The application's `fetchDrafts` function queries
`profiles!assignment_drafts_owner_id_fkey(display_name)` to join the
owner's display name. Without the FK, PostgREST returns a PGRST200 error:
"Could not find a relationship between 'assignment_drafts' and 'profiles'
in the schema cache".

This caused the regression:
1. Assignment Drafts page always shows "Failed to load assignments."
2. Newly created drafts never appear in the list.

## Fix
  1. Add the FK constraint `assignment_drafts_owner_id_fkey`.
  2. Reload the PostgREST schema cache via NOTIFY so all relationships
     are re-cached correctly.

## Notes
  - No data is lost; this only adds a constraint.
  - The FK name matches what the application code expects.
*/

ALTER TABLE assignment_drafts
  ADD CONSTRAINT assignment_drafts_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES profiles(id);

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
