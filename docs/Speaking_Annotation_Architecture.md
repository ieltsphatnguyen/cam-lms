# Speaking Annotation Architecture Review

**Date:** 2026-08-02
**Status:** Canonical reference for the Speaking annotation engine
**Scope:** Architectural investigation of the Speaking annotation workflow

---

## 1. Transcript Flow

### Complete lifecycle

```
Student records audio
  → uploaded to `question-images` bucket at `student-audio/{uid}/{file}.webm`
  → `submit_attempt` RPC stores `audio_path` on the attempt row
  → attempt status becomes `submitted`

Teacher opens grading page
  → AnnotationWorkspace loads
  → fetchAnnotations(attempt.id) → get_attempt_annotations RPC
  → fetchRubricCriteria(item.type_id) → get_rubric_criteria RPC
  → transcript initialised from `attempt.transcript` (may be empty string)

Teacher types/pastes transcript
  → AnnotatableTranscript renders a contentEditable div (Mode A)
  → onInput → onChange → setTranscript → debounced saveTranscript RPC
  → transcript persisted to `attempts.transcript` column

Teacher selects text in transcript
  → handleMouseUp computes character offsets from the contentEditable DOM
  → onSelection callback → AnnotationWorkspace stores selection range
  → FloatingToolbar appears

Teacher assigns criterion or adds comment
  → createAnnotation RPC → annotation row created
  → annotation added to local state
  → AnnotatableTranscript re-renders
  → hasAnnotations flips to true → switches to Mode B (segmented display)
  → contentEditable div is UNMOUNTED, segmented display MOUNTED

Teacher creates comment
  → CommentModal opens
  → saveTextComment / saveAudioComment RPC
  → comment added to annotation in local state
  → re-render

Teacher publishes feedback
  → saveFeedback + saveTranscript + publishFeedback RPCs
  → feedback_published = true on attempt

Student reviews
  → SubmissionReview loads
  → fetchAttemptForItem → gets attempt
  → fetchStudentFeedback → gets feedback + transcript + feedback_published
  → get_attempt_annotations RPC → gets annotations
  → renderAnnotatedText renders transcript with highlights (read-only)
```

### Components involved

| Component | Role |
|---|---|
| `SpeakingWorkspace` | Student recording phase. No annotation involvement. |
| `AnnotationWorkspace` | Teacher grading. Owns annotation state, selection state, comment modal state. Renders either `AnnotatableText` (Writing) or `AnnotatableTranscript` (Speaking). |
| `AnnotatableTranscript` | The problematic component. Dual-mode: editable div when no annotations, segmented read-only display when annotations exist. |
| `AnnotatableText` | Writing counterpart. Single-mode: always segmented read-only display. Reused in SubmissionReview. |
| `FloatingToolbar` | Appears on text selection. Offers criterion assignment, text comment, audio comment, formatting. |
| `CommentModal` | Floating panel for viewing/adding/editing comments on an annotation. |
| `ExaminerNotesPanel` | Sidebar listing all annotations with delete/move actions. |
| `SubmissionReview` | Student-facing review page. Renders annotated transcript (read-only) when feedback is published. |

---

## 2. Rendering Layers

### Speaking — AnnotatableTranscript

**Two rendering modes exist inside one component:**

| Layer | Mode | Owner | Purpose |
|---|---|---|---|
| Editable div | Mode A (no annotations) | `AnnotatableTranscript.editableRef` | Teacher types/pastes transcript. Uses `contentEditable` + `innerText` sync. |
| Segmented display | Mode B (has annotations) | `AnnotatableTranscript.displayRef` | Renders transcript as character segments with highlight spans. Built from `buildSegments(transcript, annotations)`. |

**Mode A** renders a `contentEditable` div. The `handleInput` callback reads `editableRef.current.innerText` and calls `onChange` to update the `transcript` state. A `useEffect` syncs the contentEditable with the `transcript` state when external changes occur (e.g., initial load).

**Mode B** renders a read-only div. It calls `buildSegments(transcript, annotations)` which splits the transcript string at annotation boundaries and renders each segment as a `<span>` with highlight classes. Text selection is handled by `handleMouseUp` which computes character offsets from the DOM using a pre-range technique.

**The critical problem:** these two modes are mutually exclusive. When `hasAnnotations` flips from false to true, the component unmounts the contentEditable div and mounts the segmented display. This is not a smooth transition — it is a full DOM replacement.

### Writing — AnnotatableText

**One rendering mode:**

| Layer | Owner | Purpose |
|---|---|---|
| Segmented display | `AnnotatableText.containerRef` | Always renders segmented display from immutable `text` prop. No editing. |

The Writing component is simple because the text (`attempt.written_response`) is immutable — it was submitted by the student and never changes. There is no editing mode, no contentEditable, no dual-mode switching.

### Student Review — SubmissionReview

| Layer | Owner | Purpose |
|---|---|---|
| Segmented display | `renderAnnotatedText` function | Inline function that duplicates the `buildSegments` + `getSegmentClass` logic. Read-only. Used for both Writing (`written_response`) and Speaking (`transcript`). |

`SubmissionReview` does not use `AnnotatableText` or `AnnotatableTranscript` — it has its own copy of the segmentation logic. This is a third independent implementation of the same rendering algorithm.

### Summary of rendering layer count

There are **three independent implementations** of the segment-building + highlighting logic:

1. `AnnotatableText.buildSegments` + `getSegmentClass` (Writing, teacher grading)
2. `AnnotatableTranscript.buildSegments` + `getSegmentClass` (Speaking, teacher grading)
3. `SubmissionReview.buildSegments` + `getSegmentClass` (Student review, both Writing and Speaking)

---

## 3. Annotation Pipeline

### Selection

```
Teacher drags selection across transcript text
  → handleMouseUp fires
  → window.getSelection() → Range object
  → preRange.selectNodeContents(container)
  → preRange.setEnd(range.startContainer, range.startOffset)
  → start = preRange.toString().length
  → selectedText = range.toString()
  → end = start + selectedText.length
  → onSelection({ start, end, text: selectedText })
```

The offset computation relies on `toString()` of a Range that spans the container contents up to the selection start. This produces character offsets relative to the container's text content.

**Critical issue in Mode A:** The container is a `contentEditable` div. The `innerText` property and `Range.toString()` can differ — `innerText` is layout-aware (includes line breaks from block elements), while `Range.toString()` returns the raw text node content. If the contentEditable contains block-level elements or soft wraps, the offsets may not match the `transcript` string stored in state.

**In Mode B:** The container is the segmented display div. `Range.toString()` and `textContent` are consistent because the content is flat text in spans. Offsets are reliable.

### Highlight

```
FloatingToolbar appears
  → Teacher clicks a criterion
  → handleCreateAnnotation(criterionId)
  → createAnnotation RPC → save_annotation(p_mode := 'create')
  → annotation row inserted with start_offset, end_offset, highlight_color
  → local state updated → re-render
```

### Annotation

The annotation row stores:
- `attempt_id` — links to the student attempt
- `criterion_id` / `criterion_name` — which rubric criterion (nullable for comment-only annotations)
- `start_offset` / `end_offset` — character offsets into the transcript
- `selected_text` — the highlighted text (for display in notes panel)
- `highlight_color` — purple/yellow/green/cyan
- `has_text_comment` / `has_audio_comment` — flags for colour priority
- `format_bold` / `format_italic` / etc. — formatting overlays
- `text_color` — custom text colour

### Comment

```
Teacher clicks "Add Comment" in FloatingToolbar
  → createAnnotationWithoutCriterion()
  → save_annotation RPC with criterion_id := null
  → CommentModal opens
  → Teacher types or records
  → handleSaveTextComment / handleSaveAudioComment
  → save_annotation_comment RPC
  → comment row inserted, has_text_comment/has_audio_comment flag set
  → local state updated → re-render
```

### Storage

- Annotations: `annotations` table (RLS-protected, SECURITY DEFINER `save_annotation` RPC)
- Comments: `annotation_comments` table (RLS-protected, `save_annotation_comment` RPC)
- Audio files: `annotation-audio` storage bucket (private, signed URLs)
- Transcript: `attempts.transcript` column (via `save_transcript` RPC)
- Feedback: `attempts.feedback` column (via `save_feedback` RPC)
- Publication: `attempts.feedback_published` boolean (via `publish_feedback` RPC)

### Rendering (teacher)

`AnnotatableTranscript` rebuilds segments on every render from `transcript` + `annotations`. Each segment gets highlight classes from `getSegmentClass` which applies comment colours first, then criterion colours, then formatting.

### Student review

`SubmissionReview` fetches annotations via `get_attempt_annotations` RPC, builds segments using its own copy of `buildSegments`, and renders read-only highlighted text. Only shown when `feedback_published === true`.

---

## 4. Duplication

### Root cause: dual-mode mode switch

The transcript duplication is caused by the mode switch in `AnnotatableTranscript`.

**When the first annotation is created:**

1. `hasAnnotations` is `false` → contentEditable div is rendered (Mode A)
2. Teacher selects text → offsets computed from contentEditable DOM
3. `createAnnotation` RPC succeeds → annotation added to state
4. `hasAnnotations` flips to `true`
5. Component re-renders → contentEditable div is UNMOUNTED → segmented display is MOUNTED (Mode B)
6. Segmented display renders from `transcript` state string

**The mismatch:**

- In Mode A, `handleInput` sets `transcript = editableRef.current.innerText`
- `innerText` is layout-aware: it inserts `\n` for block boundaries, soft wraps, and `<div>` / `<br>` elements that the browser creates when the teacher presses Enter
- The `transcript` state string may contain `\n` characters that don't match the original text
- When Mode B renders, it slices the `transcript` string: `text.slice(segStart, segEnd)`
- If the offsets were computed from `innerText` (Mode A) but the `transcript` string has been normalised differently, the segments don't align correctly
- Result: text appears duplicated, misaligned, or missing

**Additionally:**

- The `useEffect` that syncs `transcript` to the contentEditable checks `editableRef.current` — but in Mode B, `editableRef` is null (the div is unmounted). This effect silently does nothing.
- When switching back to Mode A (deleting all annotations), the contentEditable is re-mounted and the `useEffect` fires, setting `innerText = transcript`. But `innerText` normalisation may differ from the stored string, causing a visual jump.

### Verdict

The duplication is **not intentional, not required by the architecture, and not an implementation bug in isolation** — it is a **direct consequence of the dual-mode design**. The contentEditable and the segmented display use different text representations (`innerText` vs raw string slicing), and switching between them creates inconsistency.

---

## 5. Comparison with Writing

### Similarities

| Aspect | Writing | Speaking |
|---|---|---|
| Annotation data model | `annotations` + `annotation_comments` | Same |
| Storage RPCs | `save_annotation`, `save_annotation_comment` | Same |
| Selection offset computation | `handleMouseUp` with preRange technique | Same technique |
| Highlight colour priority | Comment > criterion > format | Same logic |
| FloatingToolbar | Used | Same component |
| CommentModal | Used | Same component |
| ExaminerNotesPanel | Used | Same component |
| Student review | `SubmissionReview` with `renderAnnotatedText` | Same component |

### Differences

| Aspect | Writing | Speaking | Reason |
|---|---|---|---|
| Text source | `attempt.written_response` (immutable, student-authored) | `attempt.transcript` (mutable, teacher-authored during grading) | Speaking requires transcription before annotation can begin. |
| Rendering component | `AnnotatableText` — single mode, always segmented display | `AnnotatableTranscript` — dual mode, contentEditable + segmented display | Speaking needs editing; Writing does not. |
| Text mutability | Never changes after submission | Teacher types/pastes, then annotates | Speaking has no written submission to annotate — the transcript IS the annotation surface. |
| Offset reliability | High — text is a stable string, no contentEditable | Low — contentEditable `innerText` may differ from stored string | ContentEditable normalisation is the root cause. |
| White-screen crashes | Not reported | Multiple occurrences | Mode switch during selection creates race conditions. |

### Why they differ

The Writing annotation engine works because the text being annotated is immutable. The student submitted it, it never changes, and the teacher annotates a fixed string. The `AnnotatableText` component always renders in one mode — segmented display — and never has to deal with editing.

The Speaking annotation engine struggles because the transcript is both the text being edited AND the text being annotated. The teacher must first type the transcript, then annotate it. The current design attempts to handle both in one component by switching modes, which creates the problems documented above.

---

## 6. Architecture Evaluation

### Verdict: The current Speaking architecture is NOT fundamentally sound.

The dual-mode design in `AnnotatableTranscript` is the architectural root cause of the repeated bugs. Evidence:

1. **Mode switch causes DOM unmounting** — the contentEditable div is destroyed and replaced with a segmented display on every annotation create/delete cycle. This is not a smooth transition.

2. **Text representation mismatch** — Mode A uses `innerText` (layout-aware, browser-normalised), Mode B uses raw string slicing. Offsets computed in one mode may be invalid in the other.

3. **Teacher lockout** — once annotations exist, the teacher cannot edit the transcript. To fix a typo, they must delete all annotations, edit, then re-annotate. This is a workflow defect, not a bug.

4. **White-screen crashes** — the mode switch during an active text selection creates a race condition. The selection is computed from the contentEditable DOM, then the annotation is created, then the component re-renders and unmounts the contentEditable. If the re-render happens before the selection is fully consumed, the DOM reference becomes null.

5. **Three duplicated implementations** — `buildSegments` + `getSegmentClass` exists in `AnnotatableText`, `AnnotatableTranscript`, and `SubmissionReview`. Each copy has drifted slightly (e.g., `AnnotatableTranscript` lacks the gradient for mixed text+audio comments that `AnnotatableText` has). Fixes must be applied in three places.

6. **Increasing complexity after every fix** — each workaround (the `isInternalEdit` ref, the `useEffect` sync, the `displayRef` vs `editableRef` split) adds state and edge cases without addressing the root cause.

### Conclusion

The architecture has accumulated enough workarounds that it should be redesigned. The dual-mode approach should be replaced with an explicit two-phase workflow.

---

## Recommendation: Option B — Separate editing mode followed by annotation mode

### Rationale

The transcript has two distinct phases in the teacher's workflow:

1. **Transcription phase** — the teacher types or pastes the transcript. No annotations are possible. The text is being created.
2. **Annotation phase** — the transcript is complete and the teacher annotates it. The text is fixed.

These phases should be explicit, not implicit (triggered by the presence/absence of annotations). The teacher should control the transition.

### Design

```
AnnotationWorkspace (Speaking)
  ├── Phase: "editing"
  │   └── Simple textarea or contentEditable for transcript entry
  │       └── "Start Annotating" button → transitions to "annotating"
  │
  └── Phase: "annotating"
      └── AnnotatableText (reused from Writing) with text={transcript}
          └── "Edit Transcript" button → transitions back to "editing"
              └── Warning: "Editing the transcript will invalidate existing annotations"
```

### Why this works

- **No mode switch** — the annotation surface is always `AnnotatableText` (single mode, proven stable). The editing surface is a simple textarea (no annotation logic).
- **No text representation mismatch** — `AnnotatableText` always works with a stable string. No `innerText` normalisation.
- **No white-screen crashes** — no DOM unmounting during selection.
- **No teacher lockout** — the teacher can explicitly switch back to editing mode at any time.
- **No duplicated logic** — `AnnotatableTranscript` is eliminated. `AnnotatableText` is reused for both Writing and Speaking.
- **Student review unchanged** — `SubmissionReview` already renders the transcript as read-only annotated text. No changes needed.

### What is eliminated

- `AnnotatableTranscript` component (deleted entirely)
- The `isInternalEdit` ref workaround
- The `editableRef` / `displayRef` dual-ref pattern
- The `useEffect` contentEditable sync
- The `hasAnnotations` mode switch

---

## Migration Plan

### Components affected

| Component | Change |
|---|---|
| `AnnotatableTranscript` | **Deleted.** All logic replaced by reusing `AnnotatableText`. |
| `AnnotationWorkspace` | Add `transcriptPhase` state (`'editing' | 'annotating'`). When editing: render a textarea + "Start Annotating" button. When annotating: render `AnnotatableText` with `text={transcript}`. Add "Edit Transcript" button to switch back. |
| `AnnotatableText` | No changes needed. Already supports the exact rendering needed. |
| `FloatingToolbar` | No changes needed. Already works with `AnnotatableText`. |
| `CommentModal` | No changes needed. |
| `ExaminerNotesPanel` | No changes needed. |
| `SubmissionReview` | No changes needed. Already renders transcript as read-only annotated text. |
| `SpeakingWorkspace` | No changes needed. Student recording phase is unaffected. |

### Data flow changes

**Current:**
```
transcript state → AnnotatableTranscript
  → Mode A: contentEditable div (innerText ↔ transcript state)
  → Mode B: buildSegments(transcript, annotations) → segmented display
```

**Proposed:**
```
transcriptPhase state
  → 'editing': textarea bound to transcript state → onChange → setTranscript → debounced saveTranscript
  → 'annotating': AnnotatableText text={transcript} annotations={annotations}
    → buildSegments(transcript, annotations) → segmented display (same proven logic as Writing)
```

### Database compatibility

- **No schema changes required.** The `attempts.transcript` column already exists and stores the transcript string.
- Annotations reference character offsets into the transcript string. As long as the transcript string doesn't change during the annotation phase, offsets remain valid.
- If the teacher switches back to editing mode and changes the transcript, existing annotations may have invalid offsets. This is acceptable — the teacher is warned, and the annotations can be deleted or the transcript can be re-edited to match. The database does not enforce offset validity (nor should it).

### Student review compatibility

- `SubmissionReview` already renders the transcript using its own `buildSegments` + `renderAnnotatedText` function.
- No changes needed. The student review page is completely decoupled from the teacher grading components.
- The only improvement would be to eventually consolidate the three `buildSegments` implementations into a shared utility, but that is a refactoring task, not a migration requirement.

### Risks

| Risk | Mitigation |
|---|---|
| Teacher switches to editing mode and loses annotations | Show a confirmation dialog: "Editing the transcript will invalidate N existing annotations. Continue?" |
| Existing annotations have offsets that don't match the transcript | The `selected_text` column stores the original highlighted text. If offsets are invalid, the segment builder will produce incorrect segments. The teacher can see this visually and re-annotate. |
| Teacher expects to edit transcript while annotating | The "Edit Transcript" button is always available. The workflow is: edit → lock → annotate → unlock if needed → re-lock → re-annotate. |
| `AnnotatableText` doesn't support `onChange` for transcript editing | Not needed. In annotation phase, the transcript is read-only. `AnnotatableText` already supports this (it has no `onChange` prop — text is a static prop). |

### Implementation steps

1. Add `transcriptPhase` state to `AnnotationWorkspace` (`'editing' | 'annotating'`)
2. When `isAudio` and `transcriptPhase === 'editing'`: render a textarea bound to `transcript` state + a "Start Annotating" button
3. When `isAudio` and `transcriptPhase === 'annotating'`: render `AnnotatableText` with `text={transcript}` + an "Edit Transcript" button
4. Auto-detect: if annotations already exist on load, default to `'annotating'` phase
5. If no transcript exists yet, default to `'editing'` phase
6. Delete `AnnotatableTranscript.tsx`
7. Remove the `AnnotatableTranscript` import from `AnnotationWorkspace`
8. Build and verify

### What does NOT change

- The annotation database schema
- The annotation RPCs (`save_annotation`, `save_annotation_comment`, etc.)
- The `FloatingToolbar`, `CommentModal`, `ExaminerNotesPanel` components
- The `SubmissionReview` student page
- The `SpeakingWorkspace` student recording page
- The audio storage bucket or signed URL logic
- The feedback publishing flow
