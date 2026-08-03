# 01 — System Architecture

**Last Updated:** v0.8.2 (2026-08-03)

## Overview

The Class Assignment Management (CAM) system is a single-page application (SPA) built for IELTS exam preparation. It enables teachers to create question banks, assemble assignments from templates, publish them to classes, and grade student submissions with rich text annotations.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Icons | lucide-react |
| Backend | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Database | PostgreSQL (via Supabase) |
| File Storage | Supabase Storage |
| Auth | Supabase Auth (email/password) |

## Application Entry Point

- `src/main.tsx` — mounts the React app, imports global CSS
- `src/App.tsx` — root component, wraps everything in `AuthProvider`, renders `AppRouter`

## Routing

The application uses a custom client-side router (no React Router). Navigation is state-driven:

```
App
└── AuthProvider
    └── AppRouter
        ├── if loading → LoadingSpinner
        ├── if !user → auth views (login, register, forgot-password, reset-password)
        └── if user → AppShell + PageContent
```

### Page Routing Table

| Page Key | Component | Role Access |
|----------|-----------|-------------|
| `admin-dashboard` | AdminDashboard | admin |
| `admin-teachers` | AdminTeachersPage | admin |
| `admin-auth` | AdminAuthPage | admin |
| `admin-users` | AdminUsersPage | admin |
| `admin-question-library` | TeacherQuestionLibraryPage | admin |
| `admin-classes` | TeacherClassesPage | admin |
| `admin-courses` | TeacherCoursesPage | admin |
| `admin-assignment-templates` | TeacherAssignmentTemplatesPage | admin |
| `admin-assignments` | TeacherAssignmentsPage | admin |
| `admin-grading` | TeacherGradingPage | admin |
| `admin-students` | TeacherStudentsPage | admin |
| `teacher-dashboard` | TeacherDashboard | teacher |
| `teacher-classes` | TeacherClassesPage | teacher |
| `teacher-courses` | TeacherCoursesPage | teacher |
| `teacher-assignment-templates` | TeacherAssignmentTemplatesPage | teacher |
| `teacher-question-library` | TeacherQuestionLibraryPage | teacher |
| `teacher-assignments` | TeacherAssignmentsPage | teacher |
| `teacher-grading` | TeacherGradingPage | teacher |
| `teacher-students` | TeacherStudentsPage | teacher |
| `student-dashboard` | StudentDashboard | student |
| `student-classes` | StudentClassesPage | student |
| `student-assignments` | StudentAssignmentsPage | student |
| `student-assignment-detail` | StudentAssignmentDetailPage | student |
| `student-workspace` | StudentWorkspace | student |
| `profile` | ProfilePage | all |

### Navigation Mechanics

- **State:** `currentPage` (string) and `pageState` (unknown) in `AppRouter`
- **History:** `window.history.pushState` / `popstate` listener for back/forward
- **Role Guard:** `activePage` is validated against `rolePrefix` (admin/teacher/student). If the page key doesn't match the user's role prefix, the default page for that role is shown.
- **Workspace Mode:** When `activePage === 'student-workspace'`, the app renders fullscreen without the sidebar/AppShell.
- **Key-based remount:** `navKey` increments on each navigation to force remount of `PageContent`.

## State Ownership

| State | Owner | Scope |
|-------|-------|-------|
| User session | `AuthContext` | Global |
| User profile | `AuthContext` | Global |
| Current page | `AppRouter` (useState) | Global |
| Page state | `AppRouter` (useState) | Global |
| Annotation state | `AnnotationWorkspace` (useState) | Local |
| Attempt state | `StudentWorkspace` / `WritingWorkspace` / `SpeakingWorkspace` | Local |
| Question library filters | `TeacherQuestionLibraryPage` | Local |

## Data Flow

```
Browser (React SPA)
    ↓ supabase-js (anon key)
Supabase API Gateway
    ↓
PostgreSQL (RLS-protected tables)
    ↓
Edge Functions (Deno) — for admin/teacher/student creation
```

All database access from the browser uses the Supabase JS client with the anon key. Row-Level Security (RLS) policies enforce data access rules. SECURITY DEFINER functions handle privileged operations that RLS cannot express.

## File Organization

```
src/
├── App.tsx                    — root router
├── main.tsx                   — entry point
├── index.css                  — global styles + Tailwind
├── contexts/
│   └── AuthContext.tsx        — auth provider
├── lib/
│   ├── supabase.ts            — Supabase client
│   ├── annotations.ts         — annotation API functions
│   ├── attempts.ts            — student attempt API functions
│   ├── grading.ts             — grading API functions
│   ├── questions.ts           — question bank API functions
│   ├── templates.ts           — template/draft/publishing API functions
│   ├── format.ts              — formatting utilities
│   └── rpc-errors.ts          — RPC error handling
├── types/
│   └── database.ts            — all TypeScript types
├── components/
│   ├── ui/                    — reusable UI primitives
│   ├── layout/                — AppShell, Sidebar
│   ├── annotations/           — annotation engine components
│   ├── questions/             — question form/preview components
│   └── templates/             — template form/preview components
├── pages/
│   ├── admin/                 — admin pages
│   ├── auth/                   — auth pages
│   ├── shared/                 — shared pages (profile)
│   ├── student/               — student pages
│   └── teacher/                — teacher pages
└── supabase/
    ├── migrations/            — SQL migrations (applied via Supabase MCP)
    └── functions/             — Edge Functions (Deno)
```

## Supabase Client

`src/lib/supabase.ts` exports a single Supabase client instance:

```typescript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

All lib modules import this client. No other Supabase client instances exist in the application.

## Known Limitations

1. No real-time subscriptions — all data is fetched via polling/refresh.
2. No code splitting — the entire app is one JS bundle (~630KB minified).
3. No server-side rendering — the app is a pure SPA.
4. Browser history is manually managed (no React Router).
5. Admin role reuses teacher pages for most functionality (classes, assignments, grading, etc.).
