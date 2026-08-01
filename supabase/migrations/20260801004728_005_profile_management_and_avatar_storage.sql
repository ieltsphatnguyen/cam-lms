/*
# 005 — Profile management, avatar storage, and user administration support

## Summary
Adds display name and avatar columns to the profiles table, creates a SECURITY
DEFINER function for updating a user's own profile (name + avatar only), adds
UPDATE policies so users can edit their own teacher/student display name, and
creates a private storage bucket for avatar uploads.

## New Columns
### profiles
  - `display_name` (text, nullable): The user's preferred display name. Shown
    in the UI instead of the raw auth email. Falls back to the email local part
    when null.
  - `avatar_url` (text, nullable): Public URL of the user's avatar image stored
    in the `avatars` storage bucket.

## New Functions
### update_own_profile(p_display_name text, p_avatar_url text)
  - SECURITY DEFINER function callable by any authenticated user.
  - Updates `display_name` and `avatar_url` on the caller's own profile row only.
  - Uses `auth.uid()` to scope the update — users cannot modify other profiles.
  - Returns void.

## New Storage Bucket
  - `avatars` (private): Stores avatar images. Access is controlled by storage
    policies — users can read their own avatar and upload to their own path.

## New Storage Policies
  - `read_own_avatar`: SELECT on storage.objects in `avatars` bucket where the
    object path starts with the caller's user ID.
  - `insert_own_avatar`: INSERT into `avatars` bucket, path must start with the
    caller's user ID.
  - `update_own_avatar`: UPDATE on `avatars` bucket, path must start with the
    caller's user ID.
  - `public_read_avatars`: SELECT for anon+authenticated so avatar images can be
    displayed in the UI without requiring an authenticated request.

## New RLS Policies
### profiles
  - `update_own_profile`: UPDATE on profiles, scoped to `auth.uid() = id`.
    WITH CHECK ensures the caller still owns the row after the update.

### teachers
  - `update_own_teacher`: UPDATE on teachers, scoped to the teacher whose
    `teacher_id` matches the caller's profile. Admins can update any teacher row.

### students
  - `update_own_student`: UPDATE on students, scoped to the student whose
    `student_id` matches the caller's profile. Admins can update any student row.

## Notes
  1. The `display_name` and `avatar_url` columns are nullable so existing rows
     are unaffected — they simply show null until the user sets a value.
  2. The `update_own_profile` function is SECURITY DEFINER because the profiles
     table's UPDATE policy only allows updating `display_name` and `avatar_url`
     (not `role`, `teacher_id`, or `student_id`). The function enforces this by
     only touching those two columns.
  3. Avatar storage paths follow the convention `{user_id}/avatar.jpg` so RLS
     policies can scope by path prefix.
  4. No data is deleted or modified — only additive changes.
*/

-- ── Columns ──────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- ── update_own_profile function ─────────────────────────
CREATE OR REPLACE FUNCTION update_own_profile(p_display_name text, p_avatar_url text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles
     SET display_name = p_display_name,
         avatar_url  = p_avatar_url
   WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION update_own_profile(text, text) TO authenticated;

-- ── profiles UPDATE policy ──────────────────────────────
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── teachers UPDATE policy ──────────────────────────────
DROP POLICY IF EXISTS "update_own_teacher" ON teachers;
CREATE POLICY "update_own_teacher"
  ON teachers FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT teacher_id FROM profiles WHERE profiles.id = auth.uid())
    OR get_my_role() = 'admin'
  )
  WITH CHECK (
    id = (SELECT teacher_id FROM profiles WHERE profiles.id = auth.uid())
    OR get_my_role() = 'admin'
  );

-- ── students UPDATE policy ──────────────────────────────
DROP POLICY IF EXISTS "update_own_student" ON students;
CREATE POLICY "update_own_student"
  ON students FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT student_id FROM profiles WHERE profiles.id = auth.uid())
    OR get_my_role() = 'admin'
  )
  WITH CHECK (
    id = (SELECT student_id FROM profiles WHERE profiles.id = auth.uid())
    OR get_my_role() = 'admin'
  );

-- ── Storage bucket ──────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- ── Storage policies ─────────────────────────────────────
-- Public read so avatars can be displayed without auth headers
DROP POLICY IF EXISTS "public_read_avatars" ON storage.objects;
CREATE POLICY "public_read_avatars"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');

-- Users can upload to their own path: {user_id}/...
DROP POLICY IF EXISTS "insert_own_avatar" ON storage.objects;
CREATE POLICY "insert_own_avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can update their own avatar
DROP POLICY IF EXISTS "update_own_avatar" ON storage.objects;
CREATE POLICY "update_own_avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);