/*
# Add get_profile_display_names function

## Background
fetchPublishedAssignments uses a profiles!published_assignments_owner_id_fkey(display_name)
join to show the publisher's name. But profiles RLS (select_own_profile) blocks teachers
from reading other users' profiles, so the join returns null and the Publisher field
shows "Unknown" for assignments published by other teachers.

## Changes
1. Create SECURITY DEFINER function get_profile_display_names(p_profile_ids uuid[])
   that returns (profile_id, display_name) for the given UUIDs.

## Security
- SECURITY DEFINER with fixed search_path = public.
- Only returns profile_id and display_name — no email, role, or other sensitive data.
- EXECUTE granted to authenticated role.
*/

CREATE OR REPLACE FUNCTION public.get_profile_display_names(p_profile_ids uuid[])
RETURNS TABLE (
  profile_id uuid,
  display_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT id, display_name
FROM profiles
WHERE id = ANY(p_profile_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.get_profile_display_names(uuid[]) TO authenticated;
