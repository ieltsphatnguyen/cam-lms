# 14 — Development Rules

**Last Updated:** v0.8.3 (2026-08-03)

## Purpose

These are the permanent development rules for the CAM project. All future development must follow these rules. A feature is not complete until the architecture documentation has been updated.

---

## 1. Never Create Duplicate Tables

- Before creating a new table, check if an existing table can serve the purpose.
- Do not create "v2" versions of tables. Extend the existing table with `ALTER TABLE` via migration.
- Never `DROP` a table or `DELETE` a column — those operations lose user data.
- Never change a column type or rename a table — these are destructive operations.
- Never create tables with suffixes such as `_v2`, `_new`, `_temp`, `_copy`, `_backup`, or similar.
- If an existing table is insufficient, extend it with a migration rather than introducing a parallel table.

## 2. Never Create Duplicate Reusable Components

- Before creating a new component, check if an existing one can be extended.
- Do not create "V2" versions of components. Modify the existing component.
- The following components must never be duplicated:
  - `Button` (`src/components/ui/Button.tsx`)
  - `Input` (`src/components/ui/Input.tsx`)
  - `Modal` (`src/components/ui/Modal.tsx`)
  - `LoadingSpinner` (`src/components/ui/LoadingSpinner.tsx`)
  - `SmartTooltip` (`src/components/ui/SmartTooltip.tsx`)
  - `AnnotatableText` (`src/components/annotations/AnnotatableText.tsx`)
  - `AnnotationWorkspace` (`src/components/annotations/AnnotationWorkspace.tsx`)
  - `RichTextEditor` (`src/components/annotations/RichTextEditor.tsx`)
  - `FloatingToolbar` (`src/components/annotations/FloatingToolbar.tsx`)
  - `FloatingCommentModal` (`src/components/annotations/FloatingToolbar.tsx`)
  - `CommentModal` (`src/components/annotations/CommentModal.tsx`)
  - `AnnotatableTranscript` (deleted in v0.8.1g — must never be recreated)
  - `SubmissionReview` (`src/pages/student/SubmissionReview.tsx`)
  - `TeacherGradingPage` (`src/pages/teacher/TeacherGradingPage.tsx`)
- These components must never have V2 versions. Repair existing implementations instead.

## 3. Reuse Existing Architecture

- Use the existing Supabase client from `src/lib/supabase.ts`. Do not create additional clients.
- Use existing lib modules (`questions.ts`, `templates.ts`, `attempts.ts`, `annotations.ts`, `grading.ts`) for data operations.
- Use existing RPCs for privileged operations. Do not add direct table writes that bypass RPCs for privileged operations.
- Use existing types from `src/types/database.ts`. Do not create parallel type definitions.

## 4. Never Bypass Existing RPCs

- All annotation operations must go through the existing RPCs (`save_annotation`, `delete_annotation`, etc.).
- All attempt operations must go through `start_attempt` and `submit_attempt` RPCs.
- All publishing operations must go through `publish_draft` and `unpublish_draft` RPCs.
- All template resolution must go through `resolve_template_to_draft` and `resolve_random_rule` RPCs.
- Do not create alternative RPCs that duplicate existing functionality.
- If an existing RPC is incorrect, repair it. Do not create another RPC providing similar behaviour.

## 5. Never Modify Frozen Modules

- See `13_Frozen_Modules.md` for the full list of frozen modules.
- Frozen modules must not be refactored, restructured, or have their APIs changed.
- Bug fixes to frozen modules require explicit instruction.
- Do not add new dependencies to frozen modules.

## 6. Investigate Before Implementing Fixes

- Before fixing a bug, read the relevant architecture document to understand the intended design.
- Before fixing a bug, read the actual code — do not assume behavior from documentation alone.
- If a bug appears to be in a frozen module, report it rather than fixing it without instruction.
- Diagnose root causes before applying fixes. Do not apply workarounds.
- If the root cause is uncertain, STOP. Document the investigation before implementing a fix. Do not implement speculative fixes.

## 7. Prefer Repairing Over Replacing

- When something is broken, fix the existing code rather than replacing it with new code.
- Do not create parallel implementations of existing functionality.
- Do not introduce abstractions unless there are at least two concrete call sites with a clear shared shape.
- Three similar lines is better than a premature abstraction.
- Repair the existing implementation. Do not replace a component merely because repairing it appears more difficult.

## 8. Database Rules

- Always enable RLS on new tables: `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;`
- Write 4 separate policies (one per CRUD verb) — do NOT use `FOR ALL`.
- Use `auth.uid()` for ownership checks — never `current_user`.
- Use `apply_migration` MCP tool for all DDL operations. Never raw SQL outside that tool.
- Never use transaction control statements (`BEGIN`, `COMMIT`, `ROLLBACK`).
- SECURITY DEFINER functions must have `SET search_path = public` or an explicit schema.

## 9. Storage Rules

- Use existing buckets (`question-images`, `annotation-audio`, `avatars`).
- Do not create new storage buckets without explicit instruction.
- Student audio goes to `question-images` bucket at `student-audio/{uid}/` paths.
- Teacher audio comments go to `annotation-audio` bucket.
- Question images use `getPublicUrl` (public read). Audio uses `createSignedUrl` (1-hour expiry).

## 10. Edge Function Rules

- All Edge Function responses must include CORS headers (see `04_Authentication_Architecture.md`).
- Write the function source to `supabase/functions/<slug>/index.ts` before deploying.
- Deploy via the `deploy_edge_function` MCP tool.
- Edge Functions use the service role key for privileged operations.

## 11. Code Style Rules

- Import every symbol you reference. No implicit imports.
- Use the `@/` path alias for project imports (maps to `src/`).
- Use lucide-react for icons. Do not install other icon libraries.
- Use Tailwind CSS for styling. Do not install other CSS frameworks.
- Default to writing no comments. Only add comments for non-obvious WHY.
- Do not write multi-paragraph docstrings or multi-line comment blocks.
- Do not change working UI layouts unless explicitly requested.
- Bug fixes should preserve existing layouts whenever possible.

## 12. Architecture Documentation Rules

- Whenever any future milestone changes database tables, RPCs, reusable components, workflows, routing, permissions, storage, or architecture, you must also update:
  - The affected architecture document in `docs/structure/`
  - `docs/structure/PROJECT_ARCHITECTURE.md` (master index)
  - `docs/structure/CHANGELOG.md`
- The architecture documentation must always match the current implementation.
- A feature is not considered complete until the architecture documentation has been updated.
- Architecture documents are the source of truth. Future development must conform to the documented architecture. Do not silently diverge from documented architecture.

## 13. Build Verification

- After any code change, run `npm run build` to verify the project compiles.
- Fix any build failures before reporting the task as complete.
- Do not report success if the build fails.

## 14. No Backwards-Compatibility Hacks

- Do not rename unused variables with `_` prefixes.
- Do not re-export types for backwards compatibility.
- Do not add `// removed` comments for deleted code.
- If something is unused, delete it completely (after verifying no call sites).

## 15. File Organization

- Organize files by cohesion, not by line count.
- Place new files where a reader would expect them based on the existing directory structure.
- Do not invent parallel directory hierarchies.
- A file should have one clear purpose.

## 16. Freeze Existing Architecture

- Do not redesign a module while fixing bugs.
- If a redesign appears necessary, STOP. Explain:
  - why the current architecture cannot support the requested behaviour
  - what would need to change
  - what risks the redesign introduces
- Wait for approval before redesigning.

## 17. UI Consistency

- Existing user workflows have priority.
- When fixing a bug, preserve:
  - layouts
  - navigation
  - terminology
  - interaction patterns
- unless explicitly instructed otherwise.

## 18. One Source of Truth

- Every responsibility must have exactly one owner.
- Examples:
  - Annotation creation → `save_annotation` RPC
  - Feedback publishing → `publish_feedback` RPC
  - Attempt submission → `submit_attempt` RPC
  - Template resolution → `resolve_template_to_draft` RPC
- Do not create parallel implementations for responsibilities already owned elsewhere.
