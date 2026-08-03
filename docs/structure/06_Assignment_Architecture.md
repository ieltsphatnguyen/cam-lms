# 06 — Assignment Architecture

**Last Updated:** v0.8.2 (2026-08-03)

## Purpose

Covers the full assignment lifecycle: templates → drafts → publishing → student attempts → submission. This is the largest subsystem, spanning four phases.

## Phases

```
Phase 1: Template Creation
  Teacher selects questions → saves as reusable template

Phase 2: Draft Creation
  Teacher creates draft from template or from scratch → configures scheduling → assigns to class

Phase 3: Publishing
  Teacher publishes draft → immutable snapshot created → visible to enrolled students

Phase 4: Student Attempt
  Student starts attempt → answers (text or audio) → submits
```

## Pages

- `src/pages/teacher/TeacherAssignmentTemplatesPage.tsx` — template management
- `src/pages/teacher/TeacherAssignmentsPage.tsx` — draft management and publishing
- `src/pages/student/StudentAssignmentsPage.tsx` — student assignment list
- `src/pages/student/StudentAssignmentDetailPage.tsx` — assignment items with status
- `src/pages/student/StudentWorkspace.tsx` — routes to Writing or Speaking workspace
- `src/pages/student/WritingWorkspace.tsx` — writing response editor
- `src/pages/student/SpeakingWorkspace.tsx` — audio recording interface
- `src/pages/student/PreFlightCheck.tsx` — pre-submission checklist
- `src/pages/student/JoinClassModal.tsx` — join class via code

## Components

- `src/components/templates/TemplateForm.tsx` — template creation/editing
- `src/components/templates/TemplatePreview.tsx` — template read-only preview
- `src/components/templates/PresetBrowser.tsx` — browse and select templates
- `src/components/templates/DuplicateTemplateDialog.tsx` — duplicate detection dialog

## Library Module

`src/lib/templates.ts` — all template, draft, and publishing operations.

### Template API Functions

| Function | Purpose |
|----------|---------|
| `fetchTemplates(userId, filters)` | Fetch templates with owner/status/search filters |
| `fetchTemplate(id)` | Fetch single template |
| `fetchTemplateQuestions(templateId)` | Fetch questions for a template in canonical order |
| `createTemplate(input, questionIds)` | Create template with questions (checks duplicates) |
| `updateTemplate(id, input)` | Update template metadata |
| `updateTemplateQuestions(templateId, questionIds)` | Full replace of template questions |
| `archiveTemplate(id)` | Archive template |
| `restoreTemplate(id)` | Restore archived template |
| `duplicateTemplate(source, questionIds, newName)` | Create copy of template |
| `checkDuplicateTemplate(sortedIds, excludeId)` | Check for identical question set |
| `fetchFavoriteTemplateIds(userId)` | Get user's favorited template IDs |
| `toggleTemplateFavorite(templateId, userId)` | Toggle favorite status |
| `fetchTemplateRandomRules(templateId)` | Fetch random rules for a template |
| `setTemplateRandomRules(templateId, rules)` | Replace all random rules |

### Draft API Functions

| Function | Purpose |
|----------|---------|
| `fetchDrafts(userId, filters)` | Fetch drafts with owner/status/class/search filters |
| `fetchDraft(id)` | Fetch single draft |
| `fetchDraftWithDetails(id)` | Fetch draft with owner name, class name, template name |
| `fetchDraftQuestions(draftId)` | Fetch questions for a draft in canonical order |
| `fetchDraftItems(draftId)` | Fetch draft items with scheduling metadata |
| `createEmptyDraft(classId, name, description)` | Create empty draft (no template) |
| `addQuestionToDraft(draftId, questionId)` | Add a question to a draft |
| `removeQuestionFromDraft(draftId, questionId)` | Remove a question from a draft |
| `clearDraftQuestions(draftId)` | Clear all questions from a draft |
| `replaceDraftFromTemplate(draftId, templateId, classId)` | Replace draft questions with resolved template |
| `updateAssignmentItem(draftId, questionId, update)` | Update scheduling metadata for a draft item |
| `resolveTemplateToDraft(templateId, classId, name, description)` | Resolve template into new draft via RPC |
| `saveDraftAsPreset(draftId, name, description)` | Save draft questions as a new template |
| `deleteDraft(id)` | Delete a draft |
| `duplicateDraft(source, newName)` | Duplicate a draft with all metadata |

### Publishing API Functions

| Function | Purpose |
|----------|---------|
| `publishDraft(draftId)` | Publish draft → creates published assignment + items |
| `unpublishDraft(publishedId)` | Remove published assignment, revert draft to 'draft' |
| `fetchPublishedAssignments(userId, isAdmin)` | Fetch all published assignments for teacher/admin |
| `fetchPublishedAssignment(id)` | Fetch single published assignment with details |
| `fetchPublishedItems(publishedAssignmentId)` | Fetch items for a published assignment |
| `duplicatePublishedToDraft(publishedId)` | Create a draft copy from a published assignment |

### Student Assignment API Functions

| Function | Purpose |
|----------|---------|
| `fetchStudentAssignments(studentId, profileId)` | Fetch assignments for student's enrolled classes |
| `fetchStudentAssignmentItems(publishedAssignmentId)` | Fetch items with attempt status for current student |

### Attempt API Functions (`src/lib/attempts.ts`)

| Function | Purpose |
|----------|---------|
| `startAttempt(publishedItemId)` | Start/resume attempt via RPC |
| `submitAttempt(attemptId, payload)` | Submit written or audio response via RPC |
| `fetchAttempt(attemptId)` | Fetch single attempt |
| `fetchMyAttempts()` | Fetch all attempts for current student |
| `fetchAttemptsForItems(itemIds)` | Fetch attempts for specific items |
| `fetchAttemptForItem(publishedItemId)` | Fetch most recent attempt for an item |
| `computeItemStatus(item, attempt, now)` | Compute item status (locked/available/completed/overdue) |
| `countWords(text)` | Word count for written responses |

### Utility Functions

| Function | Purpose |
|----------|---------|
| `canonicalTypeRank(typeId)` | Returns canonical ordering rank for a type |
| `applyCanonicalOrder(questions)` | Sort questions by canonical type order |
| `parseIntervalToSeconds(intervalStr)` | Parse PostgreSQL interval string to seconds |

## Canonical Type Order

Questions are displayed in this canonical order regardless of selection order:

1. Speaking Part 1 (3)
2. Speaking Part 2 (4)
3. Speaking Part 3 (5)
4. Writing Task 1 (1)
5. Writing Task 2 (2)
6. Extra Homework (6)
7. Custom (7)

## Database Tables

| Table | Phase | Purpose |
|-------|-------|---------|
| `assignment_templates` | Template | Template metadata |
| `assignment_template_questions` | Template | Junction: template ↔ questions |
| `assignment_template_random_rules` | Template | Random question selection rules |
| `assignment_template_favorites` | Template | User favorites |
| `assignment_drafts` | Draft | Working assignment documents |
| `assignment_draft_questions` | Draft | Junction: draft ↔ questions with scheduling |
| `published_assignments` | Published | Immutable assignment snapshots |
| `published_assignment_items` | Published | Immutable item snapshots |
| `student_attempts` | Attempt | Student responses |

## RPCs

| RPC | Purpose |
|-----|---------|
| `check_duplicate_template` | Detect identical question sets |
| `resolve_template_to_draft` | Resolve template (with random rules) into draft |
| `resolve_random_rule` | Resolve a single random rule to a question |
| `publish_draft` | Create published assignment from draft |
| `unpublish_draft` | Remove published assignment |
| `start_attempt` | Create/resume attempt, return question content |
| `submit_attempt` | Submit student response |

## Storage

| Bucket | Path Pattern | Purpose |
|--------|--------------|---------|
| `question-images` | `student-audio/{uid}/{filename}` | Student audio recordings |

## Data Flow

### Template → Draft → Publish Flow

```
1. Teacher creates template with questions + random rules
   → assignment_templates + assignment_template_questions + assignment_template_random_rules

2. Teacher creates draft from template (resolve_template_to_draft RPC)
   → assignment_drafts + assignment_draft_questions (with scheduling metadata)

3. Teacher configures scheduling per item (updateAssignmentItem)
   → available_from, due_date, due_after_days, timed, time_limit, prep_time, recording_time

4. Teacher publishes draft (publish_draft RPC)
   → published_assignments + published_assignment_items (immutable snapshot)
   → draft status → 'published'
```

### Student Attempt Flow

```
1. Student views enrolled classes → published assignments
   → classstudents → published_assignments (via class_id)

2. Student opens assignment → sees items with status
   → published_assignment_items + student_attempts (via fetchStudentAssignmentItems)

3. Student starts attempt (start_attempt RPC)
   → student_attempts (status='in_progress')
   → Returns question content (the ONLY way content becomes available)

4. Student answers:
   Writing: types in textarea → word count
   Speaking: records audio → uploads to question-images/student-audio/{uid}/

5. Student submits (submit_attempt RPC)
   → student_attempts (status='submitted' or 'auto_submitted')
```

## Item Status Logic

`computeItemStatus(item, attempt, now)` returns:

| Status | Condition |
|--------|-----------|
| `completed` | Attempt exists with status 'submitted' or 'auto_submitted' |
| `available` | Attempt is 'in_progress', OR no attempt and item is available |
| `locked` | No attempt and `available_from` is in the future |
| `overdue` | No attempt and `due_date` has passed |

## Scheduling Metadata

Each draft item can have:

| Field | Type | Purpose |
|-------|------|---------|
| `available_from` | timestamp | When the item becomes accessible |
| `due_date` | timestamp | When the item is overdue |
| `due_after_days` | int | Alternative: due N days after assignment publish |
| `timed` | bool | Whether the item has a time limit |
| `time_limit` | interval | Time limit for the attempt |
| `prep_time_seconds` | int | Speaking Part 2 prep time (default 60s) |
| `recording_time_seconds` | int | Speaking Part 2 recording time (default 120s) |

## Known Limitations

1. Published items are denormalized snapshots — if the original question changes, the published item does not update.
2. `due_after_days` is resolved at publish time into a concrete `due_date` in the published items.
3. One attempt per item is enforced at the database level (unique constraint).
4. Random rules are resolved at draft creation time — the resolved questions are fixed in the draft.
5. Draft names are nullable — drafts can be created without a name and named later.
