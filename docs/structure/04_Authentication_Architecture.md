# 04 — Authentication Architecture

**Last Updated:** v0.8.2 (2026-08-03)

## Purpose

Handles user authentication (email/password), session management, role-based access, profile management, and ban enforcement.

## Roles

| Role | Prefix | Default Page |
|------|--------|-------------|
| admin | `admin-` | `admin-dashboard` |
| teacher | `teacher-` | `teacher-dashboard` |
| student | `student-` | `student-dashboard` |

## Components

### AuthContext (`src/contexts/AuthContext.tsx`)

The single auth provider for the entire application. Wrapped around the app in `App.tsx`.

**State:**
- `user: User | null` — Supabase Auth user
- `profile: Profile | null` — application profile (role, display_name, etc.)
- `session: Session | null` — Supabase session
- `loading: boolean` — initial load state
- `authView: AuthView` — current auth view ('login', 'register', 'forgot-password', 'reset-password')
- `sessionExpired: boolean` — shown when session ends unexpectedly
- `accountDisabled: boolean` — shown when user is banned

**Key Behaviors:**

1. **Initialization:** On mount, calls `supabase.auth.getSession()`. If a session exists, fetches the user's profile from the `profiles` table.

2. **Profile Fetching:** `fetchProfile(userId)` queries `profiles` via RLS. If no profile is returned despite having a session, the user is banned (RLS denies access for banned users). The user is signed out and `accountDisabled` is set to true.

3. **Session Changes:** `supabase.auth.onAuthStateChange` listener handles:
   - `PASSWORD_RECOVERY` → switches to reset-password view
   - `SIGNED_OUT` → flags session expired if previously had session, clears profile
   - `TOKEN_REFRESHED` → clears session expired flag
   - Any event with user → fetches profile

4. **Sign Out:** `signOut()` clears session expired flag, calls `supabase.auth.signOut()`, and resets auth view to login.

5. **Refresh Profile:** `refreshProfile()` re-fetches the profile (used after profile updates like avatar upload).

## Auth Pages

### LoginPage (`src/pages/auth/LoginPage.tsx`)
- Email/password sign-in
- Links to register and forgot-password

### RegisterPage (`src/pages/auth/RegisterPage.tsx`)
- Student self-registration
- Calls `register-student` Edge Function
- Links back to login

### ForgotPasswordPage (`src/pages/auth/ForgotPasswordPage.tsx`)
- Sends password reset email via Supabase Auth

### ResetPasswordPage (`src/pages/auth/ResetPasswordPage.tsx`)
- Sets new password after recovery
- Triggered by `PASSWORD_RECOVERY` auth event

## Profile Page (`src/pages/shared/ProfilePage.tsx`)
- Shared by all roles
- Displays and edits display_name and avatar
- Avatar uploaded to `avatars` storage bucket

## User Creation Flows

### Admin
- Created via `setup-admin` Edge Function (one-time setup)
- Creates auth user + profile (role='admin')

### Teacher
- Created by admin via `create-teacher` Edge Function
- Creates auth user + profile (role='teacher') + teacher record
- Email confirmation is OFF

### Student
- Self-registers via `register-student` Edge Function
- Creates auth user + profile (role='student') + student record
- Email confirmation is OFF

## Ban Enforcement

Banned users are detected when `fetchProfile()` returns null despite having a valid session. This works because RLS policies on `profiles` deny SELECT for banned users. The flow:

1. User has a valid Supabase session
2. `fetchProfile()` queries `profiles` → returns null (RLS denies)
3. AuthContext signs out the user and sets `accountDisabled = true`
4. LoginPage shows "Your account has been disabled" message

## Admin User Management

Admins manage users via the `admin-user-management` Edge Function:
- Ban/unban users (sets a flag that RLS checks)
- Change user roles
- Delete users
- All actions are logged to `audit_log`

## Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User role, display name, avatar, teacher/student links |
| `teachers` | Teacher records |
| `students` | Student records |
| `audit_log` | Admin action audit trail |

## Storage

| Bucket | Purpose |
|--------|---------|
| `avatars` | User profile pictures |

## Security Model

1. **Email/Password only** — no magic links, no social providers.
2. **Email confirmation OFF** — users can sign in immediately after registration.
3. **RLS-enforced** — all profile access is controlled by RLS policies.
4. **Ban via RLS** — banned users cannot read their own profile, effectively locking them out.
5. **Role-based routing** — the router validates page keys against the user's role prefix.

## Known Limitations

1. No session refresh on tab focus — sessions may expire without immediate detection.
2. No multi-tab sync — signing out in one tab doesn't immediately sign out other tabs.
3. No password strength enforcement on the frontend.
4. Profile fetching on every auth state change may cause redundant queries.
