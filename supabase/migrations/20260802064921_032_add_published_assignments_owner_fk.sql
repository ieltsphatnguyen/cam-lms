/*
# Add missing FK: published_assignments.owner_id → profiles.id

## Background
v0.8.0 added a `profiles!published_assignments_owner_id_fkey(display_name)` join
to fetchPublishedAssignments and related queries. However, no actual foreign key
constraint exists from published_assignments.owner_id to profiles.id, so PostgREST
cannot resolve the embedded join and the query fails with an error, causing
"Failed to load assignments." for both teachers and admins.

## Changes
1. Add FK constraint `published_assignments_owner_id_fkey` referencing profiles(id).
   - Verified: 0 orphaned rows (all owner_id values match a profiles.id).
   - Uses ON DELETE SET NULL is NOT used because owner_id is NOT NULL; instead
     we use ON DELETE RESTRICT to prevent deleting a profile that owns published
     assignments.

## Security
- No RLS policy changes. Existing policies remain unchanged.
- This is a pure schema integrity fix to restore existing behaviour.
*/

ALTER TABLE published_assignments
  ADD CONSTRAINT published_assignments_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE RESTRICT;
