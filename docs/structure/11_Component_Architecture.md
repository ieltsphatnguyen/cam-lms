# 11 — Component Architecture

**Last Updated:** v0.8.2 (2026-08-03)

## Purpose

Documents all reusable UI components and their composition hierarchy. Components that must not be duplicated are explicitly called out.

## UI Primitives (`src/components/ui/`)

These are the foundational reusable components. They must not be duplicated.

### Button (`src/components/ui/Button.tsx`)

```typescript
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}
```

- Used everywhere across the application
- Do NOT create alternative button components

### Input (`src/components/ui/Input.tsx`)
- Text input with label and error display
- Used in forms across the application

### Modal (`src/components/ui/Modal.tsx`)
- Reusable modal dialog
- Used for confirmation dialogs, forms, etc.

### LoadingSpinner (`src/components/ui/LoadingSpinner.tsx`)
- Loading indicator with size variants
- Used during data fetching

### SmartTooltip (`src/components/ui/SmartTooltip.tsx`)
- Tooltip that auto-positions based on viewport
- Used for icon buttons and compact UI elements

## Layout Components (`src/components/layout/`)

### AppShell (`src/components/layout/AppShell.tsx`)
- Wraps authenticated content with sidebar
- Props: `currentPage`, `onNavigate`, `children`

### Sidebar (`src/components/layout/Sidebar.tsx`)
- Role-based navigation menu with collapsible support (v0.8.4)
- Collapsed: icons only (64px). Expanded: icons + labels (256px)
- Pin/unpin toggle persists in sessionStorage
- Entire sidebar scrolls as one panel
- Profile nav item removed; bottom account section opens profile
- Renders different items based on `profile.role`

## Annotation Components (`src/components/annotations/`)

### AnnotationWorkspace (`src/components/annotations/AnnotationWorkspace.tsx`)
- Main grading workspace
- Two-column layout: question/recording (left) + annotation/feedback (right)
- Owns all annotation state
- Embeds AnnotatableText, FloatingToolbar, CommentModal, RichTextEditor, ExaminerNotesPanel
- Criterion score inputs + overall band display (v0.9.0)
- Request Revision button (v0.9.0)

### SnapshotViewerModal (`src/components/annotations/SnapshotViewerModal.tsx`) (v0.9.1)
- Read-only modal for inspecting historical submission snapshots
- Displays student response, teacher feedback, teacher notes, criterion scores, overall band
- Reuses existing fetchPublished* functions
- Nothing is editable

### AnnotatableText (`src/components/annotations/AnnotatableText.tsx`)
- Renders text as character segments with highlight overlays
- Shared by Writing and Speaking (transcript) annotation
- Exports: `criterionColor()`, `HIGHLIGHT_STYLES`, `SelectionRange` type
- Do NOT create alternative text annotation components

### FloatingToolbar (`src/components/annotations/FloatingToolbar.tsx`)
- Appears at text selection position
- Criterion dropdown (hover-based with delayed close)
- Text comment button (creates annotation with null criterion)
- Audio comment button (creates annotation with null criterion)
- Formatting buttons removed in v0.8.4 (formatting is not annotation)

### CommentModal (`src/components/annotations/CommentModal.tsx`)
- Modal for adding/editing text or audio comments
- Supports `readOnly` prop (v0.8.4) for student-facing use
- Exports `CommentModalAnnotation` type

### RichTextEditor (`src/components/annotations/RichTextEditor.tsx`)
- ContentEditable-based rich text editor
- Supports bold, italic, underline, lists
- Produces HTML output
- Used for teacher feedback

### ExaminerNotesPanel (`src/components/annotations/ExaminerNotesPanel.tsx`)
- Displays annotations grouped by criterion
- No "Uncategorized" section
- Click to flash/scroll to annotation in text

## Question Components (`src/components/questions/`)

### QuestionForm (`src/components/questions/QuestionForm.tsx`)
- Create/edit question form
- Type-specific fields (category dropdown, image upload, custom fields)
- Used by TeacherQuestionLibraryPage

### QuestionPreview (`src/components/questions/QuestionPreview.tsx`)
- Read-only question display
- Shows content, type, category, tags, image

### SimilarQuestionsDialog (`src/components/questions/SimilarQuestionsDialog.tsx`)
- Similarity search results dialog
- Shows matching questions with similarity scores

## Template Components (`src/components/templates/`)

### TemplateForm (`src/components/templates/TemplateForm.tsx`)
- Template creation/editing
- Question selection + random rule configuration

### TemplatePreview (`src/components/templates/TemplatePreview.tsx`)
- Read-only template display
- Shows questions in canonical order

### PresetBrowser (`src/components/templates/PresetBrowser.tsx`)
- Browse and select existing templates
- Favorite toggle

### DuplicateTemplateDialog (`src/components/templates/DuplicateTemplateDialog.tsx`)
- Warning dialog when duplicate template is detected

## Component Hierarchy

```
App
└── AuthProvider
    └── AppRouter
        ├── Auth Pages (unauthenticated)
        │   ├── LoginPage
        │   ├── RegisterPage
        │   ├── ForgotPasswordPage
        │   └── ResetPasswordPage
        └── AppShell (authenticated)
            ├── Sidebar
            └── PageContent
                ├── Admin Pages
                │   ├── AdminDashboard
                │   ├── AdminTeachersPage
                │   ├── AdminAuthPage
                │   └── AdminUsersPage
                ├── Teacher Pages
                │   ├── TeacherDashboard
                │   ├── TeacherClassesPage
                │   ├── TeacherQuestionLibraryPage
                │   │   ├── QuestionForm
                │   │   ├── QuestionPreview
                │   │   └── SimilarQuestionsDialog
                │   ├── TeacherAssignmentTemplatesPage
                │   │   ├── TemplateForm
                │   │   ├── TemplatePreview
                │   │   ├── PresetBrowser
                │   │   └── DuplicateTemplateDialog
                │   ├── TeacherAssignmentsPage
                │   └── TeacherGradingPage
                │       ├── AnnotationWorkspace
                │       │   ├── AnnotatableText
                │       │   ├── FloatingToolbar
                │       │   ├── CommentModal
                │       │   ├── RichTextEditor
                │       │   └── ExaminerNotesPanel
                │       └── SnapshotViewerModal (v0.9.1)
                ├── Student Pages
                │   ├── StudentDashboard
                │   ├── StudentClassesPage
                │   ├── StudentAssignmentsPage
                │   ├── StudentAssignmentDetailPage
                │   └── StudentWorkspace (fullscreen, no AppShell)
                │       ├── WritingWorkspace
                │       └── SpeakingWorkspace
                └── ProfilePage
```

## Components That Must Not Be Duplicated

| Component | Reason |
|-----------|--------|
| Button | Used everywhere — any variant should extend this |
| AnnotatableText | Shared by Writing and Speaking annotation |
| AnnotationWorkspace | Single entry point for grading |
| SnapshotViewerModal | Single read-only snapshot viewer (v0.9.1) |
| RichTextEditor | Only rich text editor in the app |
| Modal | Only modal component in the app |

## Known Limitations

1. `SubmissionReview` has its own segment rendering logic instead of reusing `AnnotatableText` — this is a known duplication that should be addressed in future work.
2. No component-level testing infrastructure.
3. Some components (QuestionForm, TemplateForm) are large and could benefit from decomposition, but are frozen.
4. The `ComingSoonPage` is a placeholder with no real content.
5. `SubmissionReview` now uses `CommentModal` in read-only mode and `getAudioUrl()` from grading lib (v0.8.4).
6. `SnapshotViewerModal` (v0.9.1) has its own text rendering logic instead of reusing `AnnotatableText` — acceptable for read-only display, but could be unified in future work.
7. `NotificationsPanel` (v0.9.0) is a shared component used by both Teacher and Student dashboards.
