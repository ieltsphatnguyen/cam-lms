# 10 — Teacher & Admin Dashboard Architecture

**Last Updated:** v0.8.2 (2026-08-03)

## Purpose

Teachers manage their teaching workflow: classes, courses, question library, assignment templates, assignments, grading, and students. Admins have all teacher capabilities plus user management.

## Pages

### Teacher Pages

| Page | File | Purpose |
|------|------|---------|
| Teacher Dashboard | `src/pages/teacher/TeacherDashboard.tsx` | Overview with stats |
| Teacher Classes | `src/pages/teacher/TeacherClassesPage.tsx` | Class management |
| Teacher Courses | `src/pages/teacher/TeacherCoursesPage.tsx` | Course management |
| Question Library | `src/pages/teacher/TeacherQuestionLibraryPage.tsx` | Question bank CRUD |
| Assignment Templates | `src/pages/teacher/TeacherAssignmentTemplatesPage.tsx` | Template management |
| Assignments | `src/pages/teacher/TeacherAssignmentsPage.tsx` | Draft + publishing management |
| Grading | `src/pages/teacher/TeacherGradingPage.tsx` | Grading hierarchy + annotation |
| Teacher Students | `src/pages/teacher/TeacherStudentsPage.tsx` | Student management |
| Teacher Profile | `src/pages/teacher/TeacherProfilePage.tsx` | Profile settings |
| Coming Soon | `src/pages/teacher/ComingSoonPage.tsx` | Placeholder for unimplemented features |

### Admin Pages

| Page | File | Purpose |
|------|------|---------|
| Admin Dashboard | `src/pages/admin/AdminDashboard.tsx` | Admin overview |
| Admin Teachers | `src/pages/admin/AdminTeachersPage.tsx` | Teacher management (create, ban, unban) |
| Admin Auth | `src/pages/admin/AdminAuthPage.tsx` | Auth settings |
| Admin Users | `src/pages/admin/AdminUsersPage.tsx` | All users list |

Admins also access teacher pages (classes, courses, assignments, grading, etc.) via `admin-` prefixed routes that render the same components.

## Layout Components

### AppShell (`src/components/layout/AppShell.tsx`)

Wraps authenticated content with:
- Sidebar navigation
- Content area
- Receives `currentPage` and `onNavigate` props

### Sidebar (`src/components/layout/Sidebar.tsx`)

Role-based navigation menu. Shows different items based on `profile.role`:
- Admin: Dashboard, Teachers, Auth, Users, Question Library, Classes, Courses, Templates, Assignments, Grading, Students
- Teacher: Dashboard, Classes, Courses, Question Library, Templates, Assignments, Grading, Students, Profile
- Student: Dashboard, Classes, Assignments, Profile

## Library Modules

The teacher dashboard uses all teacher-side library modules:
- `src/lib/questions.ts` — question bank operations
- `src/lib/templates.ts` — template, draft, and publishing operations
- `src/lib/grading.ts` — grading hierarchy and attempt listing
- `src/lib/annotations.ts` — annotation and feedback operations

## Database Tables

| Table | Purpose |
|-------|---------|
| `teachers` | Teacher records |
| `teacherclasses` | Teacher ↔ class mapping |
| `classes` | Class records |
| `classstudents` | Enrollment |
| `profiles` | User profiles (admin reads all) |
| `audit_log` | Admin action audit trail |
| (all question/template/draft/published tables) | Full access |

## RPCs

All teacher-side RPCs are used (see `03_RPC_Architecture.md` for the full list). Admin-specific:
- `admin_user_management` (Edge Function)
- `create_teacher` (Edge Function)

## Storage

| Bucket | Purpose |
|--------|---------|
| `question-images` | Question images |
| `annotation-audio` | Audio comments |
| `avatars` | Profile pictures |

## Data Flow

### Admin User Management Flow

```
1. Admin views AdminTeachersPage → list of teachers
2. Admin clicks "Create Teacher" → form opens
3. create-teacher Edge Function called
   → Creates auth user + profile (role='teacher') + teacher record
4. Admin can ban/unban via admin-user-management Edge Function
   → Sets ban flag → audit_log entry
   → Banned user's RLS denies profile access → user signed out
```

### Teacher Class Management Flow

```
1. Teacher views TeacherClassesPage → list of classes they teach
2. Teacher creates class → classes + teacherclasses records
3. Teacher shares class code with students
4. Student joins via JoinClassModal → classstudents record
```

## Known Limitations

1. Admin role reuses teacher pages for most functionality — the `admin-` prefix routes render the same components.
2. `TeacherProfilePage` exists but profile management is handled by the shared `ProfilePage`.
3. `ComingSoonPage` is a placeholder for features not yet implemented.
4. `TeacherCoursesPage` is a separate page but course management is limited.
5. No real-time updates — all data is fetched on page load.
