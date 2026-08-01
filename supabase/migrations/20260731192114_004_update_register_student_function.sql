/*
# 004 — Update register_student to accept a user ID

## Summary
Modifies the `register_student` SECURITY DEFINER function to accept an explicit
`p_user_id` parameter instead of relying on `auth.uid()`. This allows the new
`register-student` edge function (which creates the auth user with the service
role key and email pre-confirmed) to pass the newly-created user's ID directly.

## Changes
### register_student(p_user_id uuid, p_name text)
  - `p_user_id` (new): The UUID of the auth user just created by the edge function.
  - `p_name` (unchanged): The student's display name.
  - Inserts the student row, then inserts the profile row with the provided ID.
  - Granted to the `authenticated` and `anon` roles so the edge function can
    call it via the service role key.

## Notes
  1. The old signature `register_student(text)` is replaced. The edge function
     is the only caller, so no application code depends on the old signature.
  2. Email confirmation stays OFF — the edge function sets `email_confirm: true`
     when creating the auth user, so no confirmation email is ever sent.
*/

DROP FUNCTION IF EXISTS register_student(text);

CREATE OR REPLACE FUNCTION register_student(p_user_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id bigint;
BEGIN
  INSERT INTO students (name) VALUES (p_name) RETURNING id INTO v_student_id;
  INSERT INTO profiles (id, role, student_id)
    VALUES (p_user_id, 'student', v_student_id);
END;
$$;

GRANT EXECUTE ON FUNCTION register_student(uuid, text) TO authenticated, anon;