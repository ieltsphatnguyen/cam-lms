/*
# Restrict role_audit_log to administrators only

## Purpose
The current `select_audit_log` RLS policy on `role_audit_log` uses only
`can_current_user_access()` (ban check) without verifying the caller's role.
This means any authenticated, non-banned user — including students — can read
the entire audit log via the API. This migration restricts SELECT access to
administrators only.

## Changes
1. Drop the existing `select_audit_log` policy
2. Create a new policy that requires `get_my_role() = 'admin'` AND
   `can_current_user_access()`

## Security
- Only administrators can read the audit log.
- Banned admins are still denied access via `can_current_user_access()`.
- No changes to how the audit log is written (still via `change_user_role` RPC).
- The admin UI continues to work exactly as before.
*/

DROP POLICY IF EXISTS "select_audit_log" ON role_audit_log;

CREATE POLICY "select_audit_log"
ON role_audit_log FOR SELECT
TO authenticated
USING (get_my_role() = 'admin' AND can_current_user_access());
