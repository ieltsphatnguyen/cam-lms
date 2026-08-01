# Milestone 5B — Assignment Editor State Synchronization Report

## Single Source of Truth

**`draftItems: AssignmentItem[]`** is the single source of truth for the
Assignment editor's question list. It is a React state variable held in the
`TeacherAssignmentsPage` component.

Every component that displays, edits, or depends on the assignment's
contents reads from this one array. No secondary list of "preset questions"
or "wizard selection" drives the editor — those are transient views that
sync back to `draftItems`.

---

## Components That Read `draftItems`

| Component / UI element | How it reads |
|---|---|
| **Assignment Items Panel** (right column) | Renders `draftItems.map(...)` directly. Every item card is produced from this array. |
| **Question count** (`Assignment Items (N)`) | Computed inline as `draftItems.length`. |
| **Publish button** | `disabled={draftItems.length === 0}`. No other state influences this. |
| **Question Bank wizard** (on open) | `openAddQuestionWizard` initializes `selectedBankIds` from `draftItems.map(item => item.question_id)`. Every existing item appears checked. |
| **Save as Draft button** | Reads `draftItems` indirectly via `loadDraftItems` after save. |
| **PresetContentsPreview** | Reads `presetQuestions` / `presetRules` (left-column preview only — NOT the editor's source of truth). |

---

## Components That Write `draftItems`

| Operation | How it writes |
|---|---|
| **Selecting a preset** (draft exists) | `handleSelectPreset` calls `replaceDraftFromTemplate(draftId, presetId, classId)` which clears old questions, resolves the template, and returns the new items. `setDraftItems(items)` updates the array immediately. |
| **Selecting a preset** (draft not yet created) | `handleSelectPreset` stores the preset in `pendingPreset`. When `ensureDraftCreated` runs (triggered by Add Question or Save), it resolves the pending preset via `resolveTemplateToDraft`, then calls `loadDraftItems` which populates `draftItems`. |
| **Clearing a preset** (draft exists) | `handleClearPreset` calls `clearDraftQuestions(draftId)` then `setDraftItems([])`. |
| **Clearing a preset** (draft not yet created) | `handleClearPreset` clears `pendingPreset`. `draftItems` is already empty. |
| **Question Bank wizard → Done** | `handleAddSelectedQuestions` diffs `selectedBankIds` against `draftItems`: adds newly checked questions, removes newly unchecked questions, then calls `loadDraftItems` to refresh `draftItems` from the database. |
| **Remove question (X button)** | `handleRemoveQuestion` calls `removeQuestionFromDraft(draftId, questionId)` then `loadDraftItems(draftId)`. |
| **Edit existing draft** | `handleEditDraft` calls `loadDraftItems(d.id)` which populates `draftItems` from the database. |
| **Schedule update** | `handleUpdateItem` calls `updateAssignmentItem` then `loadDraftItems` to refresh. |

---

## Duplicated State Removed

| Duplicated state | Before | After |
|---|---|---|
| **`presetQuestions` / `presetRules`** | Treated as a second hidden list of assignment contents. Selecting a preset populated these but did NOT populate `draftItems`. | Still exists, but ONLY drives the left-column `PresetContentsPreview` (a visual preview of what the preset contains). It never feeds the Assignment Items panel or Publish button. `draftItems` is populated separately via `replaceDraftFromTemplate`. |
| **`selectedBankIds`** | Reset to empty on wizard open. Existing assignment items were not reflected as checked. | Initialized from `draftItems` on open. Done syncs the full diff (adds + removals) back to `draftItems`. |
| **Publish button condition** | `disabled={!draftId}` — depended on whether a draft row existed, not on whether it had questions. | `disabled={draftItems.length === 0}` — depends solely on Assignment Items. |

---

## Data Flow Verification

### 1. Preset Selection

```
Teacher selects preset
  ↓
handleSelectPreset(p)
  ↓
  presetQuestions/presetRules loaded → left-column preview updates
  ↓
  Draft exists?
    YES → replaceDraftFromTemplate(draftId, presetId, classId)
           → clears old questions, resolves template, returns items
           → setDraftItems(items) → panel + count + publish update immediately
    NO  → pendingPreset = p (deferred until draft is created)
```

### 2. Question Addition (via Question Bank wizard)

```
Wizard opens → selectedBankIds = new Set(draftItems.map(i => i.question_id))
  ↓
Teacher checks/unchecks questions → selectedBankIds updates
  ↓
Teacher clicks Done
  ↓
handleAddSelectedQuestions()
  ↓
  ensureDraftCreated() → creates draft row (resolves pendingPreset if any)
  ↓
  Diff: selectedBankIds vs existing draftItems
    → toAdd:   checked but not in draft  → addQuestionToDraft
    → toRemove: in draft but unchecked   → removeQuestionFromDraft
  ↓
  loadDraftItems(id) → setDraftItems refreshed
  ↓
  Panel + count + publish update immediately
```

### 3. Question Removal (via X button on item card)

```
Teacher clicks X on item
  ↓
handleRemoveQuestion(questionId)
  ↓
  removeQuestionFromDraft(draftId, questionId)
  ↓
  loadDraftItems(draftId) → setDraftItems refreshed
  ↓
  Panel + count + publish update immediately
```

### 4. Draft Loading (Edit existing draft)

```
Teacher clicks Edit on draft card
  ↓
handleEditDraft(d)
  ↓
  setDraftId(d.id)
  setAssignmentName(d.name), setAssignmentDescription(d.description)
  setSelectedClassId(d.class_id)
  ↓
  loadDraftItems(d.id) → fetchDraftItems → setDraftItems
  ↓
  If d.template_id → find preset → setSelectedPreset + load preview
  ↓
  Panel + count + publish update immediately
```

### 5. Draft Saving

```
Teacher clicks Save as Draft
  ↓
  ensureDraftCreated() → creates row if needed (resolves pendingPreset)
  ↓
  updateDraftMeta() → updates name, description, class_id
  ↓
  loadDrafts() → refreshes list page
  setView('list')
```

---

## Duplicate ID Prevention

Duplicate question IDs are prevented at two levels:

1. **Database constraint**: The `assignment_draft_questions` table has a
   `UNIQUE (draft_id, question_id)` constraint (migration 013). Attempting
   to insert a duplicate raises a PostgreSQL error.

2. **Application-level diff**: `handleAddSelectedQuestions` computes
   `toAdd = targetIds - existingIds` before inserting. Only questions not
   already in the draft are added. This prevents the constraint from ever
   being triggered.

---

## Summary

- **Single source of truth**: `draftItems` (React state in `TeacherAssignmentsPage`)
- **Readers**: Items panel, question count, Publish button, Question Bank wizard initialization
- **Writers**: Preset selection, Question Bank wizard Done, item removal, schedule update, draft loading
- **Duplicated state removed**: `presetQuestions`/`presetRules` demoted to preview-only; `selectedBankIds` now syncs from `draftItems`; Publish condition changed from `!draftId` to `draftItems.length === 0`
- **New functions added**: `clearDraftQuestions`, `replaceDraftFromTemplate`, `resolveRandomRule`
- **Build status**: Passes cleanly with no errors
