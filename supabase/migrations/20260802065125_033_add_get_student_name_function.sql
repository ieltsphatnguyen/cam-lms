/*
# Add get_student_name_by_profile function

## Background
The Submission Viewer calls fetchAttemptForGrading() which needs to resolve
a student's profile UUID to their display name. The profiles table has a
restrictive SELECT policy (select_own_profile) that only allows users to
read their own profile. Teachers cannot read other users' profiles, so
the student name comes back null and the submission viewer fails.

## Changes
1. Create SECURITY DEFINER function get_student_name_by_profile(p_profile_id uuid)
   that safely resolves a profile UUID to a student name by joining
   profiles → students. This bypasses profiles RLS (SECURITY DEFINER) but
   only exposes the student name, not any other profile data.

## Security
- The function is SECURITY DEFINER with fixed search_path = public.
- It only returns a single text field (the student name), nothing else.
- It does not expose any sensitive profile data.
- EXECUTE is granted to authenticated role.
*/

CREATE OR REPLACE FUNCTION public.get_student_name_by_profile(p_profile_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT s.name
FROM profiles p
JOIN students s ON s.id = p.student_id
WHERE p.id = p_profile_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_student_name_by_profile(uuid) TO authenticated;
