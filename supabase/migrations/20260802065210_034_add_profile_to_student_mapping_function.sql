/*
# Add get_profile_to_student_mapping function

## Background
fetchItemStudents() needs to match student_attempts (keyed by student_profile_id uuid)
to class enrollments (keyed by student_id bigint). The link is:
  student_attempts.student_profile_id → profiles.id → profiles.student_id → students.id

But profiles RLS (select_own_profile) blocks teachers from reading other users'
profiles, so the mapping query returns empty and attempts cannot be linked to
enrolled students. This causes all students to appear as "Not Started" even when
they have submitted attempts, and the "Open" button never appears.

## Changes
1. Create SECURITY DEFINER function get_profile_to_student_mapping(p_profile_ids uuid[])
   that returns (profile_id, student_id, student_name) for the given profile UUIDs.
   This bypasses profiles RLS (SECURITY DEFINER) but only exposes the student_id
   and student_name — no sensitive profile data.

## Security
- SECURITY DEFINER with fixed search_path = public.
- Only returns profile_id (uuid), student_id (bigint), and student_name (text).
- Does not expose email, role, or any other profile/auth data.
- EXECUTE granted to authenticated role.
*/

CREATE OR REPLACE FUNCTION public.get_profile_to_student_mapping(p_profile_ids uuid[])
RETURNS TABLE (
  profile_id uuid,
  student_id bigint,
  student_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT p.id, p.student_id, s.name
FROM profiles p
JOIN students s ON s.id = p.student_id
WHERE p.id = ANY(p_profile_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.get_profile_to_student_mapping(uuid[]) TO authenticated;
