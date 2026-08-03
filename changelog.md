# Changelog

All notable changes to the Class Assignment Management (CAM) system are documented here.
This project adheres to a simplified semantic versioning scheme.

## [v0.8.1g] — 2026-08-02

### Annotation Engine Stabilisation & Speaking Workflow

**Criterion dropdown fix:** The criterion hover menu now stays open while the
cursor moves from the button into the dropdown, using a delayed-close timer
and a transparent padding bridge to eliminate the gap that caused premature
closing. Teachers can now select criteria normally.

**Removed "Uncategorized":** The Uncategorized section no longer appears in
the Teacher Notes panel. Annotations without criteria remain internal until
assigned to a criterion.

**Terminology:** "Examiner Notes" renamed to "Teacher Notes" throughout the
grading workspace. "Examiner Transcript" and "Examiner Feedback" renamed to
"Teacher Transcript" and "Teacher Feedback" in the student review page.

**Highlight colour rules:** Highlight colour is now determined only by the
assigned criterion. Adding text or audio comments no longer changes the
highlight colour. Small comment and audio badges appear inline next to
highlighted text to indicate additional feedback.

**Student comment title:** Students now see "Teacher Comment" or "Teacher
Comments" instead of "Uncategorized" when clicking highlighted sections.

**Speaking transcript editor:** The transcript editor now accepts only plain
text. Images, HTML, formatting, tables, and embedded objects are automatically
stripped on paste.

**D1 two-phase speaking workflow:** Replaced the unstable dual-mode
AnnotatableTranscript component with an explicit two-phase workflow:
1. Transcript Editing — teacher types/pastes transcript in a plain-text
   editor with a warning notice.
2. Start Annotation — transcript is saved and locked, the Writing annotation
   engine (AnnotatableText) is reused. No duplicated transcript rendering.
3. Edit Transcript — teacher can unlock the transcript with a confirmation
   warning that all annotations will be removed.

The AnnotatableTranscript component has been deleted. Speaking and Writing
now share the same annotation engine.

**Save Progress button:** Teachers can now save their grading progress
(locked transcript, annotations, comments, feedback) and continue later
without re-entering the transcript.

**Student recording playback:** Added loading state for audio URL fetching
and error logging to diagnose signed URL generation failures.

## [v0.6.0] — 2026-08-01

### Added — Cascading Tag Filter (Global Rule for Resource Browsers)

Implemented a cascading filter rule across all resource browsers in CAM where
Question Type and Tag filters appear together.

**Affected browsers:**
- Question Bank Browser (Teacher Question Library page)
- Assignment Preset Browser (Preset Browser modal in the Assignment Builder)

**Rule summary:**

The Tag filter is now a **child of Question Type** only.

- **Rule 1 — Question Type = All (or none selected):** every available tag
  from the entire Question Bank is displayed.
- **Rule 2 — A specific Question Type is selected:** only tags belonging to
  questions of that Question Type are displayed.

**Behavior guarantees:**

- Changing the Question Type immediately refreshes the Tag list.
- Changing the Tag does **not** reset the selected Question Type.
- Changing Search, Owner, or Favorites does **not** affect the available Tag
  list — the Tag list depends solely on the selected Question Type.
- If a previously selected Tag is no longer available after the Question Type
  changes, the Tag filter is automatically cleared.

**Implementation:**

- Added `fetchTagsForType(typeId)` helper to the questions data layer. When
  `typeId` is provided it queries `SELECT DISTINCT tags FROM questions WHERE
  type_id = <typeId>`; when omitted it returns all tags (equivalent to the
  existing `fetchAllTags`).
- Question Bank Browser: the tag-loading effect now depends only on
  `typeFilter` instead of the full question list, so search/owner/status
  changes no longer trigger a tag refresh.
- Preset Browser: the tag-loading effect now depends only on `typeFilter`
  instead of loading once on mount.
- Both browsers gained a guard effect that clears `tagFilter` when the
  selected tag is absent from the refreshed tag list.

### Fixed — Preset Browser Modal Not Mounting in Assignment Editor

- The "Browse Presets..." button in the Assignment Editor was setting state
  correctly, but the `PresetBrowserModal` was placed inside the **list view**
  render branch. Because the editor uses an early return, the modal was never
  mounted when editing an assignment. Moved the modal into the edit-view
  return block so it renders whenever the editor is open.

---

## [v0.5.0] — 2026-07-31

Baseline release prior to the cascading tag filter work.
