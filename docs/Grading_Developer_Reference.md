# Grading Developer Reference

**Date:** 2026-08-02
**Scope:** Annotation engine architecture, runtime flow, database contract, RLS map, component map, RPC inventory, and legacy map.
**This document describes the CURRENT implementation — not the intended design.**

---

## Table of Contents

1. [Annotation Engine Architecture](#1-annotation-engine-architecture)
2. [Grading Runtime Flow](#2-grading-runtime-flow)
3. [Grading Database Contract](#3-grading-database-contract)
4. [Grading RLS Map](#4-grading-rls-map)
5. [React Component Map](#5-react-component-map)
6. [RPC Inventory](#6-rpc-inventory)
7. [Legacy Map](#7-legacy-map)

---

## 1. Annotation Engine Architecture

### 1.1 Writing Annotation Flow

#### Component Hierarchy

```
AnnotationWorkspace
├── AnnotatableText          ← renders student essay text, captures selection
├── FloatingToolbar           ← appears on selection, criterion dropdown + comment buttons
├── ExaminerNotesPanel        ← right panel, tags grouped by criterion, drag-to-move
├── CommentModal              ← modal for text/audio comments
│   └── RichTextEditor        ← used in text-comment mode
└── RichTextEditor            ← feedback editor at bottom of right column
```

#### Text Rendering Component

`AnnotatableText` renders the student's `written_response` as a plain `<div>` with `whitespace-pre-wrap`. It splits the text into segments at annotation boundaries and wraps annotated segments in `<span>` elements with highlight CSS classes. Unannotated segments are plain `<span>` elements.

Highlights use 4 colors:
- `green` — `bg-emerald-200/60 border-b-2 border-emerald-500`
- `blue` — `bg-blue-200/60 border-b-2 border-blue-500`
- `red` — `bg-red-200/60 border-b-2 border-red-500`
- `black` — `bg-slate-300/60 border-b-2 border-slate-600`

If an annotation has a text comment, the highlight switches to `bg-pink-200/70 border-b-2 border-pink-500`.
If it has an audio comment, it switches to `bg-sky-200/70 border-b-2 border-sky-500`.

#### Selection Handler

`AnnotatableText` attaches an `onMouseUp` handler to the container `<div>`. When the mouse is released:

1. It calls `window.getSelection()`.
2. If the selection is collapsed or outside the container, it calls `onSelection(null)`.
3. Otherwise, it creates a `Range` from the start of the container to the start of the selection (`preRange`), measures its string length to get the character offset, and calls `onSelection({ start, end, text })`.

This produces a `SelectionRange` with absolute character offsets into the original text string.

#### Floating Toolbar

`FloatingToolbar` receives the `selection` prop. When it becomes non-null, the toolbar reads `window.getSelection().getRangeAt(0).getBoundingClientRect()` to position itself at `position: fixed` above the selection, centered horizontally.

The toolbar contains:
- **Criterion dropdown** — lists all `RubricCriterion` entries for the question type. Clicking a criterion calls `onCreateAnnotation(criterionId, selectedColor)`.
- **Color buttons** — 4 colors (red, blue, black, green). Selecting a color sets `selectedColor` state; the next criterion click uses that color.
- **Formatting buttons** — Bold, Italic, Underline, Strikethrough. These call `document.execCommand()` and affect the `RichTextEditor`'s contentEditable, not the annotation system.
- **Text Comment button** — calls `onAddTextComment()`.
- **Audio Comment button** — calls `onAddAudioComment()`.

The toolbar opens upward by default. If there isn't enough space above (estimated dropdown height ~200px), it opens downward.

#### Annotation Creation

When a criterion is clicked in the toolbar:

1. `FloatingToolbar` calls `onCreateAnnotation(criterionId, color)`.
2. `AnnotationWorkspace.handleCreateAnnotation` runs.
3. It looks up the criterion name from the `criteria` array.
4. It calls `createAnnotation()` from `src/lib/annotations.ts`.
5. `createAnnotation` calls `supabase.rpc('save_annotation', { p_mode: 'create', p_attempt_id, p_criterion_id, p_criterion_name, p_start_offset, p_end_offset, p_selected_text, p_highlight_color })`.
6. On success, it returns the new annotation ID.
7. `AnnotationWorkspace` appends the new annotation to its `annotations` state array.
8. It clears the selection and removes the browser's visual selection range.
9. `AnnotatableText` re-renders with the new annotation, producing the highlight.

#### RPC

`save_annotation(p_mode text, p_annotation_id bigint, p_attempt_id bigint, p_criterion_id bigint, p_criterion_name text, p_start_offset integer, p_end_offset integer, p_selected_text text, p_highlight_color text)` → returns `bigint`

The function is `SECURITY DEFINER`. It calls `can_annotate_attempt(v_attempt_id)` to verify the caller owns the assignment. If authorized and `p_mode = 'create'`, it does:

```sql
INSERT INTO annotations (attempt_id, criterion_id, criterion_name, start_offset, end_offset, selected_text, highlight_color)
VALUES (p_attempt_id, p_criterion_id, p_criterion_name, p_start_offset, p_end_offset, p_selected_text, p_highlight_color)
RETURNING id;
```

#### Database Write

- **Table:** `annotations`
- **FK used:** `attempt_id` → `student_attempts.id`, `criterion_id` → `rubric_criteria.id`
- **RLS bypassed:** Yes (SECURITY DEFINER)
- **Authorization:** `can_annotate_attempt()` checks `published_assignments.owner_id = auth.uid()`

---

### 1.2 Speaking Annotation Flow

#### Transcript Component

For speaking items (`item.response_type === 'audio'`), `AnnotationWorkspace` renders a `<textarea>` instead of `AnnotatableText`. The textarea is bound to the `transcript` state, initialized from `attempt.transcript`. The teacher can type, paste, and edit the transcript text.

Below the textarea, if annotations exist and the transcript is non-empty, an `AnnotatableText` component renders a read-only preview of the transcript with highlights overlaid.

#### Selection Handler

The textarea has an `onMouseUp` handler that:
1. Reads `e.currentTarget.selectionStart` and `e.currentTarget.selectionEnd`.
2. Extracts the selected text via `ta.value.substring(ta.selectionStart, ta.selectionEnd)`.
3. If the text is non-empty, calls `setSelection({ start, end, text })`.
4. Otherwise calls `setSelection(null)`.

This uses the native HTML textarea selection API, NOT `window.getSelection()`. This is a different selection mechanism from the writing flow.

#### Floating Toolbar

The same `FloatingToolbar` component is rendered. It receives the same `selection` prop. However, there is a critical difference in how the toolbar positions itself (see section 1.6 below).

#### Annotation Creation

The same `handleCreateAnnotation` handler is used. It calls the same `createAnnotation()` function, which calls the same `save_annotation` RPC. The database write is identical.

#### RPC

Same as writing: `save_annotation` with `p_mode = 'create'`.

#### Database Write

Same as writing: `INSERT INTO annotations`.

---

### 1.3 Shared Components

| Component | File | Role |
|-----------|------|------|
| `AnnotationWorkspace` | `src/components/annotations/AnnotationWorkspace.tsx` | Orchestrator. Owns all annotation state. Renders both writing and speaking flows. |
| `AnnotatableText` | `src/components/annotations/AnnotatableText.tsx` | Renders text with highlight overlays. Captures mouse-based text selection via `window.getSelection()`. |
| `FloatingToolbar` | `src/components/annotations/FloatingToolbar.tsx` | Positioned toolbar on selection. Criterion dropdown, color picker, formatting buttons, comment/audio buttons. |
| `ExaminerNotesPanel` | `src/components/annotations/ExaminerNotesPanel.tsx` | Right panel listing annotation tags grouped by rubric criterion. Supports drag-and-drop to move annotations between criteria. |
| `CommentModal` | `src/components/annotations/CommentModal.tsx` | Modal for creating text or audio comments. Uses `MediaRecorder` API for audio. |
| `RichTextEditor` | `src/components/annotations/RichTextEditor.tsx` | ContentEditable rich text editor. Used for both feedback and text comments. |

#### Duplicated Implementations

There is **no separate `HighlightRenderer` or `AnnotationProvider`**. All rendering is done inline in `AnnotatableText`. There is no context provider — all state lives in `AnnotationWorkspace` and is passed via props.

The transcript flow uses the same `AnnotatableText` component but only as a read-only preview below the textarea. The actual editable surface is a native `<textarea>`, which is a **different text surface** from the `AnnotatableText` component.

---

### 1.4 Event Flow

#### Writing

```
Teacher selects text in student essay
  ↓
AnnotatableText.onMouseUp
  ↓
window.getSelection() → Range
  ↓
Calculate character offsets (preRange technique)
  ↓
onSelection({ start, end, text })
  ↓
AnnotationWorkspace.setSelection(range)
  ↓
FloatingToolbar receives selection prop
  ↓
Toolbar reads getBoundingClientRect() → positions itself
  ↓
Teacher clicks a criterion in dropdown
  ↓
onCreateAnnotation(criterionId, color)
  ↓
AnnotationWorkspace.handleCreateAnnotation
  ↓
createAnnotation() → supabase.rpc('save_annotation', { p_mode: 'create', ... })
  ↓
PostgREST → save_annotation() SQL function
  ↓
can_annotate_attempt(p_attempt_id) → checks owner_id = auth.uid()
  ↓
INSERT INTO annotations
  ↓
Return new annotation id
  ↓
setAnnotations(prev => [...prev, newAnnotation])
  ↓
AnnotatableText re-renders with new highlight
```

#### Speaking

```
Teacher types/pastes transcript in <textarea>
  ↓
Teacher selects text inside textarea
  ↓
textarea.onMouseUp
  ↓
Read e.currentTarget.selectionStart / selectionEnd
  ↓
setSelection({ start, end, text })
  ↓
FloatingToolbar receives selection prop
  ↓
Toolbar reads window.getSelection().getRangeAt(0).getBoundingClientRect()
  ↓
... (same as writing from here on)
```

---

### 1.5 State Management

#### Where annotation state lives

All annotation state lives in `AnnotationWorkspace` via `useState`:

| State | Type | Purpose |
|-------|------|---------|
| `annotations` | `Annotation[]` | Array of all annotations for this attempt |
| `criteria` | `RubricCriterion[]` | Rubric criteria for this question type |
| `selection` | `SelectionRange \| null` | Current text selection range |
| `flashId` | `number \| null` | Annotation ID to flash (when clicked in notes panel) |
| `commentModal` | `{ open, mode, pendingAnnotationId }` | Comment modal state |
| `feedback` | `string` | Feedback editor content |
| `transcript` | `string` | Transcript textarea content |
| `published` | `boolean` | Whether feedback is published |
| `savedToast` | `boolean` | "Saved" toast visibility |
| `publishing` | `boolean` | Publish button loading state |

There is no React Context, no Redux, no Zustand. State is passed down via props.

#### How highlights are rendered

`AnnotatableText` receives `text` and `annotations` as props. It:
1. Sorts annotations by `start_offset`.
2. Iterates through the text, splitting it into segments at annotation boundaries.
3. Renders unannotated segments as plain `<span>` elements.
4. Renders annotated segments as `<span>` elements with highlight CSS classes based on `highlight_color` or comment type.

#### How comments are linked

Each `Annotation` object has a `comments: AnnotationComment[]` array. Comments are fetched as part of the `get_attempt_annotations` RPC return value (nested JSON). The `has_text_comment` and `has_audio_comment` boolean flags on the annotation control the highlight color. Comments are not rendered inline in the text — they are only visible in the `ExaminerNotesPanel` tags (as T/A indicators) and in the `CommentModal` flow.

#### How toolbar visibility is controlled

`FloatingToolbar` returns `null` when `position` is null. The `position` state is set in a `useEffect` that watches the `selection` prop. When `selection` becomes non-null, it reads `window.getSelection()` and positions the toolbar. When `selection` becomes null, `position` is set to null and the toolbar disappears.

---

### 1.6 The Difference: Writing vs Speaking Toolbar

**Question:** Why does the Writing workspace open the floating toolbar when selecting text, but the Speaking transcript does not?

**Answer:** The toolbar appears in BOTH cases when `selection` is non-null. The difference is in **how the selection is captured**, which affects whether the toolbar can position itself.

In **Writing**, `AnnotatableText` uses `window.getSelection()` and the DOM Range API. The `FloatingToolbar` also reads `window.getSelection().getRangeAt(0).getBoundingClientRect()` to position itself. Since the selection is a real DOM Range with real coordinates, the toolbar positions correctly.

In **Speaking**, the `<textarea>` uses `e.currentTarget.selectionStart/selectionEnd` to capture the selection. This produces a `SelectionRange` object with correct offsets, so `selection` becomes non-null and the toolbar renders. However, the `FloatingToolbar`'s `useEffect` calls `window.getSelection()` — which returns **null or a collapsed selection** because a native textarea selection does NOT create a DOM Range that `window.getSelection()` can see. The toolbar's `useEffect` exits early at `if (!sel || sel.isCollapsed) { setPosition(null); return; }`, so `position` stays null and the toolbar never appears.

**The actual implementation difference:** Writing uses `window.getSelection()` for both selection capture and toolbar positioning. Speaking uses the textarea's native `selectionStart/selectionEnd` for selection capture, but the toolbar positioning code still calls `window.getSelection()`, which returns nothing for a textarea selection. The toolbar component does not have a fallback positioning path for textarea-based selections.

---

### 1.7 RPC Usage

| RPC | Used by Writing | Used by Speaking | Notes |
|-----|:---:|:---:|-------|
| `save_annotation` | Yes | Yes | Same RPC, same parameters for both flows |
| `get_attempt_annotations` | Yes | Yes | Same RPC for both flows |
| `delete_annotation` | Yes | Yes | Same RPC for both flows |
| `move_annotation` | Yes | Yes | Same RPC for both flows |
| `save_annotation_comment` | Yes | Yes | Same RPC for both flows |
| `save_feedback` | Yes | Yes | Same RPC for both flows |
| `save_transcript` | No* | Yes | Only called when `isAudio && transcript` — writing items never call this |
| `publish_feedback` | Yes | Yes | Same RPC for both flows |
| `get_rubric_criteria` | Yes | Yes | Same RPC for both flows |

*`save_transcript` is conditionally called: `if (isAudio && transcript)`. For writing items, `isAudio` is false, so it is skipped. Both writing and speaking use the exact same RPCs for annotation operations. There is no separate "speaking annotation RPC" or "writing annotation RPC."

---

## 2. Grading Runtime Flow

### 2.1 Create Annotation

```
Teacher highlights text in student essay (or transcript textarea)
  ↓
AnnotatableText.onMouseUp  (or textarea.onMouseUp for speaking)
  ↓
SelectionRange { start, end, text } set in AnnotationWorkspace state
  ↓
FloatingToolbar renders at selection position
  ↓
Teacher clicks a criterion in the dropdown
  ↓
FloatingToolbar.handleCriterionSelect(criterionId)
  ↓
onCreateAnnotation(criterionId, selectedColor)
  ↓
AnnotationWorkspace.handleCreateAnnotation(criterionId, color)
  ↓
Looks up criterion name from criteria array
  ↓
createAnnotation({ attempt_id, criterion_id, criterion_name, start_offset, end_offset, selected_text, highlight_color })
  ↓
supabase.rpc('save_annotation', { p_mode: 'create', p_attempt_id, p_criterion_id, p_criterion_name, p_start_offset, p_end_offset, p_selected_text, p_highlight_color })
  ↓
PostgREST receives RPC call
  ↓
save_annotation() SQL function executes
  ↓
can_annotate_attempt(p_attempt_id) called
  ↓
  JOIN student_attempts → published_assignment_items → published_assignments
  WHERE pa.owner_id = auth.uid()
  ↓
  If false → RAISE EXCEPTION 'Not authorized to annotate this attempt'
  → Frontend catches error → alert('Failed to create annotation:\n' + message)
  → EXECUTION STOPS HERE
  ↓
  If true → INSERT INTO annotations (...)
  ↓
  RETURNING id → new annotation ID returned to frontend
  ↓
setAnnotations(prev => [...prev, { id, ...newAnnotation }])
  ↓
setSelection(null) → window.getSelection()?.removeAllRanges()
  ↓
FloatingToolbar disappears
  ↓
AnnotatableText re-renders with new highlight segment
  ↓
ExaminerNotesPanel re-renders with new tag under the criterion
```

**Where execution can stop:**
1. `can_annotate_attempt()` returns false → exception, no INSERT
2. FK violation on `attempt_id` or `criterion_id` → exception, no INSERT
3. PostgREST function resolution failure (previously caused by duplicate overloads — now fixed)

---

### 2.2 Delete Annotation

```
Teacher clicks the X button on an annotation tag in ExaminerNotesPanel
  ↓
ExaminerNotesPanel calls onDeleteAnnotation(annotationId)
  ↓
AnnotationWorkspace.handleDeleteAnnotation(annotationId)
  ↓
deleteAnnotation(annotationId)
  ↓
supabase.rpc('delete_annotation', { p_annotation_id })
  ↓
PostgREST → delete_annotation() SQL function
  ↓
can_annotate_attempt((SELECT attempt_id FROM annotations WHERE id = p_annotation_id))
  ↓
  If false → RAISE EXCEPTION → alert with real error
  → EXECUTION STOPS HERE
  ↓
  If true → DELETE FROM annotations WHERE id = p_annotation_id
  ↓
  (annotation_comments rows cascade-delete via FK ON DELETE CASCADE)
  ↓
Return void
  ↓
setAnnotations(prev => prev.filter(a => a.id !== annotationId))
  ↓
AnnotatableText re-renders — highlight removed
  ↓
ExaminerNotesPanel re-renders — tag removed
```

**Where execution can stop:**
1. `can_annotate_attempt()` returns false → exception
2. Annotation ID not found → `can_annotate_attempt(NULL)` → subquery returns NULL → function returns false → exception

---

### 2.3 Save Draft

```
Teacher clicks "Save Draft" button
  ↓
AnnotationWorkspace.handleSaveDraft()
  ↓
saveFeedback(attempt.id, feedback)
  ↓
supabase.rpc('save_feedback', { p_attempt_id, p_feedback })
  ↓
PostgREST → save_feedback() SQL function
  ↓
can_annotate_attempt(p_attempt_id)
  ↓
  If false → RAISE EXCEPTION → alert with real error
  → EXECUTION STOPS HERE
  ↓
  If true → UPDATE student_attempts SET feedback = p_feedback WHERE id = p_attempt_id
  ↓
Return void
  ↓
  (If speaking and transcript is non-empty):
  saveTranscript(attempt.id, transcript)
  ↓
  supabase.rpc('save_transcript', { p_attempt_id, p_transcript })
  ↓
  save_transcript() → can_annotate_attempt() → UPDATE student_attempts SET transcript = p_transcript
  ↓
setSavedToast(true) → "Saved" indicator appears for 1.5s
```

**Where execution can stop:**
1. `save_feedback` fails → `can_annotate_attempt()` returns false, or RLS blocks the SECURITY DEFINER context
2. `save_transcript` fails → same check

**Note:** `feedback_published` is NOT set to true. It remains false. The grading record is NOT created or updated.

---

### 2.4 Publish Feedback

```
Teacher clicks "Publish Feedback" button
  ↓
AnnotationWorkspace.handlePublishFeedback()
  ↓
setPublishing(true) → button shows "Publishing…"
  ↓
Step 1: saveFeedback(attempt.id, feedback)
  ↓
  save_feedback() → can_annotate_attempt() → UPDATE student_attempts SET feedback = p_feedback
  ↓
  If fails → alert with real error → EXECUTION STOPS HERE
  ↓
Step 2: (If speaking) saveTranscript(attempt.id, transcript)
  ↓
  save_transcript() → can_annotate_attempt() → UPDATE student_attempts SET transcript = p_transcript
  ↓
  If fails → alert with real error → EXECUTION STOPS HERE
  ↓
Step 3: publishFeedback(attempt.id)
  ↓
  supabase.rpc('publish_feedback', { p_attempt_id })
  ↓
  PostgREST → publish_feedback() SQL function
  ↓
  can_annotate_attempt(p_attempt_id)
  ↓
  If false → RAISE EXCEPTION → alert → EXECUTION STOPS HERE
  ↓
  If true:
  1. Resolve teacher_id:
     SELECT p.teacher_id FROM student_attempts
     JOIN published_assignment_items → published_assignments → profiles
     WHERE sa.id = p_attempt_id
  ↓
  2. UPDATE student_attempts SET feedback_published = true WHERE id = p_attempt_id
  ↓
  3. Check if grading record exists:
     SELECT id FROM grading WHERE submission_id = p_attempt_id
  ↓
  4a. If exists → UPDATE grading SET grading_status = 'completed', grading_timestamp = now(), teacher_id = v_teacher_id
  4b. If not → INSERT INTO grading (submission_id, teacher_id, grading_status, grading_timestamp) VALUES (p_attempt_id, v_teacher_id, 'completed', now())
  ↓
  Return void
  ↓
setPublished(true) → "Published" badge appears
  ↓
setPublishing(false) → button reverts to "Publish Feedback"
```

**Where execution can stop:**
1. `save_feedback` fails → feedback not saved, publish aborted
2. `save_transcript` fails → transcript not saved, publish aborted
3. `publish_feedback` → `can_annotate_attempt()` returns false → exception
4. `publish_feedback` → `teacher_id` resolves to NULL → exception "Could not resolve teacher"
5. `publish_feedback` → INSERT into `grading` fails (FK violation on `submission_id` or `teacher_id`)

---

## 3. Grading Database Contract

### 3.1 Canonical Tables

#### `student_attempts`

| Field | Value |
|-------|-------|
| **Purpose** | Stores each student's attempt at a published assignment item, including response, feedback, transcript, and publish state |
| **Primary key** | `id` (bigint, auto-increment) |
| **Owner** | The student (`student_profile_id` references `auth.users.id` via `profiles`) |
| **Written by** | `start_attempt` RPC (INSERT), `submit_attempt` RPC (UPDATE), `save_feedback` RPC (UPDATE feedback), `save_transcript` RPC (UPDATE transcript), `publish_feedback` RPC (UPDATE feedback_published) |
| **Read by** | Teacher grading page (direct SELECT via RLS), `can_annotate_attempt` RPC, `owns_attempt` RPC, `get_student_feedback` RPC, `get_assignment_status` RPC, student pages (direct SELECT via RLS) |
| **Referenced by** | `annotations.attempt_id` (FK), `grading.submission_id` (FK) |
| **Row count** | 5 |
| **RLS enabled** | Yes |

**Important columns:** `id`, `published_assignment_item_id`, `student_profile_id`, `status`, `written_response`, `audio_path`, `word_count`, `feedback`, `transcript`, `feedback_published`, `submitted_at`

**Foreign keys:**
- `published_assignment_item_id` → `published_assignment_items.id`
- `student_profile_id` → `profiles.id`

---

#### `grading`

| Field | Value |
|-------|-------|
| **Purpose** | Records grading status for a submission |
| **Primary key** | `id` (bigint, auto-increment) |
| **Owner** | The teacher (`teacher_id` references `teachers.id`) |
| **Written by** | `publish_feedback` RPC (INSERT or UPDATE) |
| **Read by** | Teacher grading page (direct SELECT via RLS — counts graded submissions), `get_assignment_status` RPC |
| **Referenced by** | None |
| **Row count** | 0 |
| **RLS enabled** | Yes |

**Important columns:** `id`, `submission_id`, `teacher_id`, `grading_status`, `grading_timestamp`

**Foreign keys:**
- `submission_id` → `student_attempts.id`
- `teacher_id` → `teachers.id`

**Note:** `teacher_id` is `NOT NULL` with no default. The `publish_feedback` RPC resolves it from the attempt → item → assignment → owner → profiles.teacher_id chain.

---

#### `annotations`

| Field | Value |
|-------|-------|
| **Purpose** | Stores text highlights created by teachers on student submissions |
| **Primary key** | `id` (bigint, auto-increment) |
| **Owner** | The teacher (via the attempt → item → assignment → owner chain) |
| **Written by** | `save_annotation` RPC (INSERT/UPDATE), `delete_annotation` RPC (DELETE), `move_annotation` RPC (UPDATE) |
| **Read by** | `get_attempt_annotations` RPC, `delete_annotation` RPC (reads attempt_id), `move_annotation` RPC (reads attempt_id), `save_annotation_comment` RPC (reads attempt_id) |
| **Referenced by** | `annotation_comments.annotation_id` (FK with ON DELETE CASCADE) |
| **Row count** | 0 |
| **RLS enabled** | Yes |

**Important columns:** `id`, `attempt_id`, `criterion_id`, `criterion_name`, `start_offset`, `end_offset`, `selected_text`, `highlight_color`, `has_text_comment`, `has_audio_comment`

**Foreign keys:**
- `attempt_id` → `student_attempts.id`
- `criterion_id` → `rubric_criteria.id` (nullable)

---

#### `annotation_comments`

| Field | Value |
|-------|-------|
| **Purpose** | Stores text or audio comments attached to annotations |
| **Primary key** | `id` (bigint, auto-increment) |
| **Owner** | The teacher (via annotation → attempt → item → assignment → owner chain) |
| **Written by** | `save_annotation_comment` RPC (INSERT/UPDATE), `delete_annotation_comment` RPC (DELETE) |
| **Read by** | `get_attempt_annotations` RPC (nested in JSON return), `delete_annotation_comment` RPC (reads annotation_id) |
| **Referenced by** | None |
| **Row count** | 0 |
| **RLS enabled** | Yes |

**Important columns:** `id`, `annotation_id`, `type` ('text' \| 'audio'), `content`, `audio_path`

**Foreign keys:**
- `annotation_id` → `annotations.id` (ON DELETE CASCADE)

---

#### `rubric_criteria`

| Field | Value |
|-------|-------|
| **Purpose** | Stores rubric criteria per question type (e.g., Task Achievement, Coherence) |
| **Primary key** | `id` (bigint, auto-increment) |
| **Owner** | System (managed via migrations, not user-editable) |
| **Written by** | Migrations only (no RPC writes) |
| **Read by** | `get_rubric_criteria` RPC, teacher grading page (via RPC), `move_annotation` RPC (reads criterion name) |
| **Referenced by** | `annotations.criterion_id` (FK) |
| **Row count** | 24 |
| **RLS enabled** | Yes (SELECT only, publicly readable) |

**Important columns:** `id`, `question_type_id`, `name`, `display_order`

**Foreign keys:**
- `question_type_id` → `questiontypes.id`

---

### 3.2 RPC → Tables Map

This shows every grading-related RPC and exactly which tables it reads from and writes to. **No RPC writes to any table outside this list.**

| RPC | Reads | Writes |
|-----|-------|--------|
| `save_annotation` | `student_attempts`, `published_assignment_items`, `published_assignments`, `annotations` | `annotations` |
| `get_attempt_annotations` | `annotations`, `annotation_comments` | — |
| `delete_annotation` | `annotations` | `annotations` |
| `move_annotation` | `annotations`, `rubric_criteria` | `annotations` |
| `save_annotation_comment` | `annotations`, `student_attempts`, `published_assignment_items`, `published_assignments` | `annotation_comments`, `annotations` (updates has_text_comment/has_audio_comment) |
| `delete_annotation_comment` | `annotation_comments`, `annotations` | `annotation_comments`, `annotations` (clears has_text_comment/has_audio_comment) |
| `can_annotate_attempt` | `student_attempts`, `published_assignment_items`, `published_assignments` | — |
| `owns_attempt` | `student_attempts` | — |
| `save_feedback` | `student_attempts`, `published_assignment_items`, `published_assignments` | `student_attempts` |
| `save_transcript` | `student_attempts`, `published_assignment_items`, `published_assignments` | `student_attempts` |
| `publish_feedback` | `student_attempts`, `published_assignment_items`, `published_assignments`, `profiles`, `grading` | `student_attempts`, `grading` |
| `unpublish_feedback` | `student_attempts`, `published_assignment_items`, `published_assignments` | `student_attempts` |
| `get_student_feedback` | `student_attempts` | — |
| `get_rubric_criteria` | `rubric_criteria` | — |
| `get_assignment_status` | `student_attempts`, `grading` | — |
| `start_attempt` | `student_attempts`, `published_assignment_items`, `published_assignments` | `student_attempts` |
| `submit_attempt` | `student_attempts` | `student_attempts` |
| `get_student_name_by_profile` | `profiles`, `students` | — |
| `get_profile_to_student_mapping` | `profiles`, `students` | — |
| `get_profile_display_names` | `profiles`, `students`, `teachers` | — |

**Verification:** No grading RPC writes to `rubrics`, `rubriccriteria`, `inlineannotations`, `criterionscores`, `generalfeedback`, `studentsubmissions`, `studentassignmentitems`, or `publishedassignments`. All writes go to canonical tables only.

---

## 4. Grading RLS Map

### 4.1 annotations

```
Teacher
  ↓
  SELECT    → YES  (can_annotate_attempt(attempt_id) = true)
  INSERT    → YES  (can_annotate_attempt(attempt_id) = true)
  UPDATE    → YES  (can_annotate_attempt(attempt_id) = true)
  DELETE    → YES  (can_annotate_attempt(attempt_id) = true)

Student
  ↓
  SELECT    → YES  (owns_attempt(attempt_id) = true)
  INSERT    → NO
  UPDATE    → NO
  DELETE    → NO

Admin
  ↓
  All actions → YES (via can_annotate_attempt which checks owner_id)
```

### 4.2 annotation_comments

```
Teacher
  ↓
  SELECT    → YES  (EXISTS annotation WHERE can_annotate_attempt(attempt_id))
  INSERT    → YES  (EXISTS annotation WHERE can_annotate_attempt(attempt_id))
  UPDATE    → YES  (EXISTS annotation WHERE can_annotate_attempt(attempt_id))
  DELETE    → YES  (EXISTS annotation WHERE can_annotate_attempt(attempt_id))

Student
  ↓
  SELECT    → YES  (EXISTS annotation WHERE can_annotate_attempt OR owns_attempt)
  INSERT    → NO
  UPDATE    → NO
  DELETE    → NO
```

### 4.3 student_attempts

```
Teacher
  ↓
  SELECT    → YES  (select_attempts_for_teachers: item belongs to assignment they own)
  INSERT    → NO   (no INSERT policy — only start_attempt SECURITY DEFINER can INSERT)
  UPDATE    → NO   (update_own_attempts: student_profile_id = auth.uid() OR admin)
  DELETE    → NO   (no DELETE policy)

Student
  ↓
  SELECT    → YES  (select_own_attempts: student_profile_id = auth.uid())
  INSERT    → NO   (no INSERT policy)
  UPDATE    → YES  (update_own_attempts: student_profile_id = auth.uid())
  DELETE    → NO   (no DELETE policy)

Admin
  ↓
  SELECT    → YES
  UPDATE    → YES
  INSERT    → NO
  DELETE    → NO
```

**Critical:** Teachers CANNOT directly UPDATE `student_attempts`. The `save_feedback`, `save_transcript`, and `publish_feedback` RPCs bypass RLS via SECURITY DEFINER to write feedback/transcript/feedback_published.

### 4.4 grading

```
Teacher
  ↓
  SELECT    → YES  (submission_id IN attempts they own via assignment owner_id)
  INSERT    → YES  (same check)
  UPDATE    → YES  (same check)
  DELETE    → NO   (no DELETE policy)

Student
  ↓
  SELECT    → NO   (no student policy on grading)
  INSERT    → NO
  UPDATE    → NO
  DELETE    → NO

Admin
  ↓
  SELECT    → YES
  INSERT    → YES
  UPDATE    → YES
  DELETE    → NO
```

### 4.5 rubric_criteria

```
All authenticated roles
  ↓
  SELECT    → YES  (USING true — publicly readable)
  INSERT    → NO   (no INSERT policy)
  UPDATE    → NO   (no UPDATE policy)
  DELETE    → NO   (no DELETE policy)
```

### 4.6 Quick Reference Matrix

| Table | Teacher SELECT | Teacher INSERT | Teacher UPDATE | Teacher DELETE | Student SELECT | Student INSERT | Student UPDATE | Student DELETE |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `annotations` | YES | YES | YES | YES | YES (own) | NO | NO | NO |
| `annotation_comments` | YES | YES | YES | YES | YES (own) | NO | NO | NO |
| `student_attempts` | YES | NO | NO | NO | YES (own) | NO | YES (own) | NO |
| `grading` | YES | YES | YES | NO | NO | NO | NO | NO |
| `rubric_criteria` | YES | NO | NO | NO | YES | NO | NO | NO |

**Key takeaway:** Teachers cannot directly UPDATE `student_attempts`. All feedback/transcript/publish writes go through SECURITY DEFINER RPCs that bypass RLS.

---

## 5. React Component Map

### 5.1 Teacher Grading Flow

```
TeacherGradingPage
├── Class/Assignment/Item navigation (inline)
├── Student list (inline)
└── AnnotationWorkspace
    ├── AnnotatableText              ← writing: renders student essay
    │   └── (no children — leaf component)
    ├── <textarea>                   ← speaking: editable transcript (NOT a component)
    │   └── AnnotatableText          ← speaking: read-only preview below textarea
    ├── FloatingToolbar
    │   └── (no children — leaf component)
    ├── ExaminerNotesPanel
    │   └── (renders annotation tags, no child components)
    ├── CommentModal
    │   └── RichTextEditor           ← used in text-comment mode
    └── RichTextEditor               ← feedback editor
```

### 5.2 Student Review Flow

```
StudentAssignmentDetailPage
└── SubmissionReview
    ├── (inline question rendering — no annotation components)
    ├── (inline audio player — native <audio> element)
    └── (inline feedback rendering — dangerouslySetInnerHTML)
```

### 5.3 Writing vs Speaking — Are They Sharing Components?

```
Writing flow:
  AnnotationWorkspace
  └── AnnotatableText          ← DIRECT — renders student essay text

Speaking flow:
  AnnotationWorkspace
  ├── <textarea>               ← NATIVE HTML — teacher edits transcript
  └── AnnotatableText          ← INDIRECT — only renders read-only preview below textarea
```

**Shared:** `AnnotationWorkspace`, `AnnotatableText`, `FloatingToolbar`, `ExaminerNotesPanel`, `CommentModal`, `RichTextEditor` are all shared.

**Not shared:** The speaking flow adds a native `<textarea>` that does not exist in the writing flow. The writing flow renders `AnnotatableText` as the primary annotation surface. The speaking flow renders it only as a secondary preview.

**Student review:** `SubmissionReview` does NOT use `AnnotatableText` or any annotation component. It renders feedback as raw HTML via `dangerouslySetInnerHTML` and lists annotations as text cards.

---

## 6. RPC Inventory

### 6.1 Annotation RPCs

#### `save_annotation`

```
save_annotation
  ↓
Parameters:
  p_mode           text       ('create' or 'update')
  p_annotation_id  bigint     (null for create, ID for update)
  p_attempt_id     bigint
  p_criterion_id   bigint
  p_criterion_name text
  p_start_offset   integer
  p_end_offset     integer
  p_selected_text  text
  p_highlight_color text
  ↓
Returns: bigint (annotation ID)
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): Indirectly via can_annotate_attempt()
  ↓
Used by:
  - Transcript (create)     ← AnnotationWorkspace.handleCreateAnnotation
  - Transcript (update)     ← annotations.ts updateAnnotation() [not called from UI]
  - Writing (create)        ← AnnotationWorkspace.handleCreateAnnotation
  - Writing (for comment)   ← AnnotationWorkspace.createAnnotationWithFirstCriterion
```

#### `get_attempt_annotations`

```
get_attempt_annotations
  ↓
Parameters:
  p_attempt_id  bigint
  ↓
Returns: json (array of annotation objects with nested comments)
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): No (RLS on annotations/annotation_comments enforces access)
  ↓
Used by:
  - Teacher: Transcript   ← AnnotationWorkspace.loadData → fetchAnnotations
  - Teacher: Writing      ← AnnotationWorkspace.loadData → fetchAnnotations
  - Student: Review       ← SubmissionReview useEffect → supabase.rpc directly
```

#### `delete_annotation`

```
delete_annotation
  ↓
Parameters:
  p_annotation_id  bigint
  ↓
Returns: void
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): Indirectly via can_annotate_attempt()
  ↓
Used by:
  - Transcript  ← AnnotationWorkspace.handleDeleteAnnotation
  - Writing     ← AnnotationWorkspace.handleDeleteAnnotation
```

#### `move_annotation`

```
move_annotation
  ↓
Parameters:
  p_annotation_id  bigint
  p_criterion_id   bigint
  p_highlight_color text
  ↓
Returns: void
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): Indirectly via can_annotate_attempt()
  ↓
Used by:
  - Transcript  ← AnnotationWorkspace.handleMoveAnnotation (drag-and-drop)
  - Writing     ← AnnotationWorkspace.handleMoveAnnotation (drag-and-drop)
```

### 6.2 Comment RPCs

#### `save_annotation_comment`

```
save_annotation_comment
  ↓
Parameters:
  p_comment_id    bigint  (null for create, ID for update)
  p_annotation_id bigint
  p_type          text    ('text' or 'audio')
  p_content       text    (for text comments)
  p_audio_path    text    (for audio comments)
  ↓
Returns: bigint (comment ID)
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): Indirectly via can_annotate_attempt()
  ↓
Used by:
  - Transcript  ← AnnotationWorkspace.handleSaveTextComment / handleSaveAudioComment
  - Writing     ← AnnotationWorkspace.handleSaveTextComment / handleSaveAudioComment
```

#### `delete_annotation_comment`

```
delete_annotation_comment
  ↓
Parameters:
  p_comment_id  bigint
  ↓
Returns: void
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): Indirectly via can_annotate_attempt()
  ↓
Used by:
  - Not called from any UI component (dead code — exists in annotations.ts as deleteComment but never invoked)
```

### 6.3 Feedback RPCs

#### `save_feedback`

```
save_feedback
  ↓
Parameters:
  p_attempt_id  bigint
  p_feedback    text
  ↓
Returns: void
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): Indirectly via can_annotate_attempt()
  ↓
Used by:
  - Transcript  ← AnnotationWorkspace auto-save + handleSaveDraft + handlePublishFeedback
  - Writing     ← AnnotationWorkspace auto-save + handleSaveDraft + handlePublishFeedback
```

#### `save_transcript`

```
save_transcript
  ↓
Parameters:
  p_attempt_id   bigint
  p_transcript   text
  ↓
Returns: void
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): Indirectly via can_annotate_attempt()
  ↓
Used by:
  - Transcript  ← AnnotationWorkspace auto-save + handleSaveDraft + handlePublishFeedback
  - Writing     ← NOT USED (isAudio is false, so saveTranscript is skipped)
```

#### `publish_feedback`

```
publish_feedback
  ↓
Parameters:
  p_attempt_id  bigint
  ↓
Returns: void
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): Indirectly via can_annotate_attempt()
  ↓
Tables read:  student_attempts, published_assignment_items, published_assignments, profiles, grading
Tables write: student_attempts (feedback_published = true), grading (INSERT or UPDATE)
  ↓
Used by:
  - Transcript  ← AnnotationWorkspace.handlePublishFeedback
  - Writing     ← AnnotationWorkspace.handlePublishFeedback
```

#### `unpublish_feedback`

```
unpublish_feedback
  ↓
Parameters:
  p_attempt_id  bigint
  ↓
Returns: void
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): Indirectly via can_annotate_attempt()
  ↓
Used by:
  - Not called from any UI component (dead code — exists in annotations.ts but never invoked)
```

#### `get_student_feedback`

```
get_student_feedback
  ↓
Parameters:
  p_attempt_id  bigint
  ↓
Returns: TABLE(feedback text, transcript text, feedback_published boolean)
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): Yes — student_profile_id = auth.uid() AND feedback_published = true
  ↓
Used by:
  - Student Review  ← SubmissionReview useEffect → fetchStudentFeedback
```

### 6.4 Authorization Helper RPCs

#### `can_annotate_attempt`

```
can_annotate_attempt
  ↓
Parameters:
  p_attempt_id  bigint
  ↓
Returns: boolean
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): Yes — pa.owner_id = auth.uid()
  ↓
Used by:
  - Not called directly from frontend
  - Called by: save_annotation, delete_annotation, move_annotation, save_annotation_comment,
    delete_annotation_comment, save_feedback, save_transcript, publish_feedback, unpublish_feedback
  - Called by RLS policies on: annotations, annotation_comments
```

#### `owns_attempt`

```
owns_attempt
  ↓
Parameters:
  p_attempt_id  bigint
  ↓
Returns: boolean
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): Yes — student_profile_id = auth.uid()
  ↓
Used by:
  - Not called directly from frontend
  - Called by RLS policies on: annotations (SELECT), annotation_comments (SELECT)
```

### 6.5 Rubric RPC

#### `get_rubric_criteria`

```
get_rubric_criteria
  ↓
Parameters:
  p_question_type_id  bigint
  ↓
Returns: TABLE(id bigint, name text, display_order integer)
  ↓
Security: SECURITY DEFINER
  ↓
auth.uid(): No
  ↓
Used by:
  - Transcript  ← AnnotationWorkspace.loadData → fetchRubricCriteria
  - Writing     ← AnnotationWorkspace.loadData → fetchRubricCriteria
```

---

## 7. Legacy Map

All legacy tables have **RLS disabled**, **0 rows**, and are **not referenced by any frontend code or RPC**.

| Legacy Table | Row Count | RLS | Columns | What It Was | What Replaced It |
|---|---|---|---|---|---|
| `rubrics` | 0 | Disabled | `id (bigint), name (text)` | Old two-level rubric system (rubric → criteria) | `rubric_criteria` — flat list keyed on `question_type_id` directly |
| `rubriccriteria` | 0 | Disabled | `id (bigint), rubric_id (bigint), name (text)` | Old camelCase version of rubric criteria | `rubric_criteria` — snake_case version with `question_type_id` and `display_order` |
| `publishedassignments` | 0 | Disabled | `id, class_id, instance_id, status, published_at, archived_at` | Old camelCase published assignment table | `published_assignments` — snake_case with `owner_id`, `draft_id` |
| `inlineannotations` | 0 | Disabled | `id, submission_id, annotation_type, annotation_content, annotation_position` | Old single-table annotation system (type + content + position in one row) | `annotations` + `annotation_comments` — two-table system with offsets, criterion linking, and separate comment storage |
| `criterionscores` | 0 | Disabled | `id, grading_id, criterion_id, score` | Old per-criterion scoring system | Nothing — band scores are not implemented. `ExaminerNotesPanel` shows a "Band Score —" placeholder with no backing database column. |
| `generalfeedback` | 0 | Disabled | `id, grading_id, strengths, weaknesses, overall_comments, rich_text_feedback, suggestions` | Old structured feedback model (separate fields for strengths, weaknesses, suggestions) | `student_attempts.feedback` — single free-text HTML column |
| `studentsubmissions` | 0 | Disabled | `id, assignment_item_id, student_id, content, file_path, file_type, status, submitted_at` | Old submission model | `student_attempts` — includes `written_response`, `audio_path`, `word_count`, `feedback`, `transcript` |
| `studentassignmentitems` | 0 | Disabled | `id, assignment_id, question_id, student_id, snapshot_id, status, start_time, end_time, due_at, available_from, time_limit` | Old per-student assignment tracking | `student_attempts` — one attempt per student per item, with timing columns on `published_assignment_items` |

### Legacy RPCs

| Legacy RPC | Status | Notes |
|---|---|---|
| `unpublish_feedback` | Dead code — exists in database and `annotations.ts` but never called from UI | Could be wired to an "Unpublish" button if needed |
| `delete_annotation_comment` | Dead code — exists in database and `annotations.ts` (`deleteComment`) but never called from UI | Could be wired to a delete-comment button in comment display |
| `updateAnnotation` (in `annotations.ts`) | Dead code — calls `save_annotation` with `p_mode: 'update'` but never called from any component | The `handleCreateAnnotation` flow only creates, never updates |
| `get_profile_display_names` | Not used in grading flow | May be used elsewhere in the app; exists alongside `get_student_name_by_profile` and `get_profile_to_student_mapping` as a third name-resolution RPC |

### Legacy Storage

| Storage Bucket | Status | Notes |
|---|---|---|
| `question-images` | Active but misnamed | Stores student speaking audio recordings (`student-audio/<profile_id>/attempt-<id>-<timestamp>.webm`) despite being named `question-images`. Also stores question images. |
| `annotation-audio` | Active | Stores teacher audio comments (`annotation-<id>-<timestamp>.webm`) |
