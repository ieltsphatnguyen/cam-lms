# Architecture

This document describes the architecture of the implemented modules and the
data pipeline that connects them.

---

## Module Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Authentication & User Management            │
│  profiles · teachers · students · role_audit_log                 │
│  Edge Functions: setup-admin, create-teacher, register-student   │
│  RPC: change_user_role, update_own_profile                       │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Classes                                │
│  classes · teacherclasses · classstudents                        │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Question Bank                             │
│  questions · questiontypes                                       │
│  Storage: question-images                                        │
│  RPC: search_similar_questions                                   │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Assignment Templates                          │
│  assignment_templates                                            │
│  assignment_template_questions                                   │
│  assignment_template_random_rules                                │
│  RPC: check_duplicate_template                                   │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Assignment Drafts                            │
│  assignment_drafts                                               │
│  assignment_draft_questions                                      │
│  RPC: resolve_template_to_draft, resolve_random_rule             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Responsibilities

### Authentication & User Management

**Responsibility:** Manage user identity, roles, and profile data.

**Tables owned:**
- `profiles` — central identity record, shared by all modules
- `teachers` — entity record for teacher role
- `students` — entity record for student role
- `role_audit_log` — immutable audit trail

**What this module is allowed to modify:**
- Create/update profiles (via edge functions and RPC)
- Change user roles (via `change_user_role` RPC)
- Update display name and avatar (via `update_own_profile` RPC)
- Create teacher/student entity records (via edge functions / RPC)

**What this module must never modify:**
- Any table outside its ownership (questions, templates, drafts, classes)
- `role_audit_log` (written only by `change_user_role` RPC, never directly)

**Shared tables:**
- `profiles` is read by all other modules for ownership checks and display names

---

### Classes

**Responsibility:** Manage class entities and enrollment relationships
between teachers, students, and classes.

**Tables owned:**
- `classes` — class entity
- `teacherclasses` — teacher-to-class junction
- `classstudents` — student-to-class junction

**What this module is allowed to modify:**
- Create/update/archive classes (teachers and admins)
- Link teachers to classes (teachers and admins)
- Enroll/unenroll students from classes

**What this module must never modify:**
- `profiles`, `teachers`, `students` (read-only references)
- Any Question Bank, Template, or Draft tables

**Shared tables:**
- `classes` is read by Assignment Drafts (for `class_id` assignment)
- `classstudents` is read by Assignment Drafts (for random rule class-scoped deduplication)

---

### Question Bank

**Responsibility:** Store and manage question content, metadata, and
ownership. Questions are the atomic units that templates and drafts reference.

**Tables owned:**
- `questions` — core question records
- `questiontypes` — lookup table of question types

**What this module is allowed to modify:**
- Create/update/archive/delete questions (teachers own their own; admins can modify all)
- Upload/delete question images (storage bucket `question-images`)

**What this module must never modify:**
- `questiontypes` (read-only lookup; no INSERT/UPDATE/DELETE policies exist)
- Any template, draft, class, or user tables

**Shared tables:**
- `questions` is read by Assignment Templates (for template question references)
- `questions` is read by Assignment Drafts (for draft question references)
- `questiontypes` is read by Assignment Templates (for random rule type selection)

---

### Assignment Templates

**Responsibility:** Create reusable assignment definitions that bundle fixed
questions and random question selection rules. Templates are intermediate
artifacts — they are never directly assigned to students.

**Tables owned:**
- `assignment_templates` — template entity
- `assignment_template_questions` — fixed question references
- `assignment_template_random_rules` — random selection criteria

**What this module is allowed to modify:**
- Create/update/archive templates (teachers own their own; admins can modify all)
- Add/remove fixed questions from templates
- Add/remove random rules from templates

**What this module must never modify:**
- `questions` (read-only references to Question Bank)
- `assignment_drafts` or `assignment_draft_questions` (owned by Assignment Drafts)
- `classes` or user tables

**Shared tables:**
- `assignment_templates` is read by Assignment Drafts (as the source for draft creation)
- `assignment_template_questions` is read by Assignment Drafts (for copying fixed questions)
- `assignment_template_random_rules` is read by Assignment Drafts (for resolving random rules)

---

### Assignment Drafts

**Responsibility:** Create concrete assignment instances from templates,
resolve random rules to fixed question IDs, and manage the resulting draft.
Drafts are the precursor to published assignments (publishing is not yet
implemented).

**Tables owned:**
- `assignment_drafts` — draft entity
- `assignment_draft_questions` — resolved question references

**What this module is allowed to modify:**
- Create drafts (via `resolve_template_to_draft` RPC, which also creates draft questions)
- Delete drafts (owners and admins)
- Read draft questions

**What this module must never modify:**
- `questions` (read-only references)
- `assignment_templates` or its child tables (read-only source)
- `classes` (read-only reference)
- User tables

**Shared tables:**
- Reads `assignment_templates`, `assignment_template_questions`, `assignment_template_random_rules` (all read-only)
- Reads `questions` (read-only)
- Reads `classes` (read-only)
- Reads `profiles` (read-only, for owner display name)

---

## Data Pipeline

```
  Teacher creates Question
          │
          ▼
  ┌─── Question Bank ───┐
  │     questions        │
  │  (content, type,     │
  │   tags, category,    │
  │   response_type,     │
  │   owner_id)          │
  └───────┬──────────────┘
          │
          │ Teacher selects questions
          │ and/or defines random rules
          ▼
  ┌─── Assignment Template ───────────┐
  │  assignment_templates             │
  │  assignment_template_questions    │  ← fixed question references
  │  assignment_template_random_rules │  ← selection criteria only
  └───────┬───────────────────────────┘
          │
          │ Teacher creates draft from template
          │ (resolve_template_to_draft RPC)
          ▼
  ┌─── Assignment Draft ─────────────┐
  │  assignment_drafts                │
  │  assignment_draft_questions       │  ← resolved question IDs
  │  (fixed + randomly resolved)      │
  └───────────────────────────────────┘
```

### Key Design Principle: Separation of Concerns

1. **Question Bank** owns question content. It does not know about templates
   or drafts.

2. **Assignment Templates** store references to questions (by ID) and
   selection criteria for random rules. They never duplicate question content.
   A template is a *blueprint* — it is reusable and not tied to a specific class.

3. **Assignment Drafts** are *concrete instances*. When a draft is created from
   a template, the `resolve_template_to_draft` RPC:
   - Copies all fixed question references from the template
   - Resolves each random rule by selecting a matching question at random
   - Stores the resolved question IDs in `assignment_draft_questions`
   - The draft is now a fixed, immutable set of question IDs

This separation ensures that:
- Editing a template after a draft is created does not affect the draft
- Editing or archiving a question does not retroactively change templates
  (though it may affect future draft creation if the question no longer matches)
- Random rules are resolved at draft creation time, not at publication time

---

## Shared Tables Summary

| Table | Owner Module | Read By | Written By |
|---|---|---|---|
| `profiles` | Auth & User Mgmt | All modules | Edge functions, `change_user_role` RPC, `update_own_profile` RPC |
| `teachers` | User Mgmt | Classes, Admin | `change_user_role` RPC, `create-teacher` EF |
| `students` | User Mgmt | Classes | `register_student` RPC, `register-student` EF |
| `classes` | Classes | Assignment Drafts | TeacherClassesPage (frontend) |
| `questiontypes` | Question Bank | Templates, Drafts | No one (static lookup) |
| `questions` | Question Bank | Templates, Drafts | Question Bank module (frontend via RLS) |
| `assignment_templates` | Templates | Drafts | Templates module (frontend via RLS) |
| `assignment_template_questions` | Templates | Drafts | Templates module (frontend via RLS) |
| `assignment_template_random_rules` | Templates | Drafts | Templates module (frontend via RLS) |

---

## Application Architecture

### Frontend

- **React + TypeScript + Vite** — single-page application
- **Tailwind CSS** — styling
- **Lucide React** — icons
- **Supabase JS client** — direct database access from the browser

### Data Access Pattern

The application uses a **direct-to-database** pattern:
- The browser uses the Supabase JS client with the anon key
- RLS policies enforce all access control at the database level
- Edge functions handle privileged operations (user creation, admin actions)
- RPC functions (SECURITY DEFINER) handle multi-step transactions

### Code Organization

```
src/
  lib/
    supabase.ts          # Supabase client singleton
    questions.ts         # Question Bank data-access layer
    templates.ts         # Templates + Drafts data-access layer
  types/
    database.ts          # TypeScript type definitions
  contexts/
    AuthContext.tsx      # Auth state management
  components/
    ui/                  # Reusable UI primitives
    layout/              # App shell, sidebar
    questions/            # Question Bank components
    templates/            # Template components
  pages/
    auth/                # Login, Register, Forgot/Reset Password
    admin/               # Admin Dashboard, Users, Teachers
    teacher/             # Teacher Dashboard, Classes, Questions, Templates, Drafts
    student/             # Student Dashboard, Classes
    shared/              # Profile page
```

### Security Architecture

1. **RLS is the primary access control mechanism.** Every table used by the
   application has RLS enabled with per-CRUD-verb policies.

2. **SECURITY DEFINER functions** bypass RLS for privileged operations:
   - `change_user_role` — admin-only role changes
   - `resolve_template_to_draft` — creates draft + resolves rules in one transaction
   - `search_similar_questions` — reads all active questions for similarity search
   - `update_own_profile` — user updates own profile
   - `can_current_user_access` — ban check used by all RLS policies
   - `get_my_role` — role lookup used by RLS policies

3. **Edge functions** handle operations requiring service-role access:
   - `setup-admin` — initial admin account setup
   - `create-teacher` — admin creates teacher account
   - `register-student` — student self-registration
   - `admin-user-management` — admin user management (list, disable, restore, reset password)

4. **Ban enforcement** is handled at the RLS level via `can_current_user_access()`,
   which checks `auth.users.banned_until`. Banned users are denied all access.
