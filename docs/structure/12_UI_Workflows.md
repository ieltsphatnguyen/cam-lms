# 12 — UI Workflows

**Last Updated:** v0.8.2 (2026-08-03)

## Purpose

Documents the primary user-facing workflows (golden paths) through the application.

## Authentication Workflows

### Login
1. User enters email and password on LoginPage
2. Supabase Auth validates credentials
3. AuthContext fetches profile from `profiles` table
4. Router redirects to role-specific default page
5. If profile is null (banned), user is signed out and shown "account disabled" message

### Student Registration
1. Student clicks "Register" on LoginPage → RegisterPage
2. Student enters name, email, password
3. `register-student` Edge Function creates auth user + profile + student record
4. Student is signed in and redirected to StudentDashboard

### Password Recovery
1. User clicks "Forgot Password" → ForgotPasswordPage
2. User enters email → Supabase sends reset email
3. User clicks reset link → `PASSWORD_RECOVERY` event fires
4. AuthContext switches to ResetPasswordPage
5. User enters new password → Supabase updates credentials

## Teacher Workflows

### Create Question
1. Teacher navigates to Question Library
2. Teacher clicks "New Question" → QuestionForm opens
3. Teacher selects question type (1-7)
4. Type-specific fields appear:
   - Category dropdown or free text (depends on type)
   - Response type (text or audio, pre-set by type)
   - Image upload (if type supports images)
   - Content, description, IELTS band, tags
5. Teacher clicks "Save" → `createQuestion()` inserts to `questions` table
6. Question appears in library list

### Create Assignment Template
1. Teacher navigates to Assignment Templates
2. Teacher clicks "New Template" → TemplateForm opens
3. Teacher names the template
4. Teacher selects questions from the question library
5. Teacher optionally adds random question rules
6. Teacher clicks "Save" → `createTemplate()` checks for duplicates, then inserts
7. If duplicate detected → DuplicateTemplateDialog shows existing template
8. Template appears in template list

### Create and Publish Assignment
1. Teacher navigates to Assignments page
2. Teacher creates a new draft (from template or empty)
3. If from template: `resolveTemplateToDraft()` RPC resolves template + random rules
4. Teacher configures scheduling per item (available_from, due_date, time limits)
5. Teacher assigns draft to a class
6. Teacher clicks "Publish" → `publishDraft()` RPC creates immutable published assignment
7. Published assignment appears in student assignment lists

### Grade Student Submission
1. Teacher navigates to Grading page
2. Teacher sees hierarchy: Classes → Assignments → Items
3. Teacher clicks an item → sees student list with submission status
4. Teacher clicks a student's attempt → AnnotationWorkspace opens
5. For Writing: student's written response is displayed in AnnotatableText
6. For Speaking:
   a. Phase 1 (Transcript Editing): Teacher types/pastes transcript in plain-text editor
   b. Teacher clicks "Start Annotation" → transcript is saved and locked
   c. Phase 2 (Annotation): AnnotatableText renders the transcript
7. Teacher selects text → FloatingToolbar appears
8. Teacher picks a criterion → annotation created with highlight color
9. Teacher optionally adds formatting (bold, italic, etc.)
10. Teacher clicks annotation to add text or audio comment
11. Teacher writes feedback in RichTextEditor
12. Teacher clicks "Save Draft" / "Save Progress" to save without publishing
13. Teacher clicks "Publish Feedback" → feedback visible to student

## Student Workflows

### Join Class
1. Student navigates to Classes page
2. Student clicks "Join Class" → JoinClassModal opens
3. Student enters class code
4. `classstudents` record created
5. Class appears in student's class list

### Complete Writing Assignment
1. Student navigates to Assignments page
2. Student sees assignments from enrolled classes with status badges
3. Student clicks an assignment → sees items with status (locked/available/completed/overdue)
4. Student clicks an available item → StudentWorkspace opens (fullscreen)
5. StudentWorkspace routes to WritingWorkspace
6. Student clicks "Start" → `startAttempt()` RPC creates attempt
7. Question content is revealed (the only way content becomes available)
8. Student types response in textarea (word count tracked)
9. If timed: countdown timer runs
10. Student clicks "Submit" → `submitAttempt()` RPC saves response
11. Item status changes to 'completed'

### Complete Speaking Assignment
1. Student navigates to assignment item → StudentWorkspace → SpeakingWorkspace
2. Student clicks "Start" → `startAttempt()` RPC creates attempt
3. If prep time: preparation countdown runs first
4. Student records audio via MediaRecorder API
5. Recording timer counts down (if recording_time_seconds set)
6. Student reviews recording (playback)
7. Student clicks "Submit" → audio uploaded to `question-images/student-audio/{uid}/`
8. `submitAttempt()` RPC saves audio_path

### Review Graded Feedback
1. Student sees assignment status as 'graded'
2. Student opens SubmissionReview
3. `fetchStudentFeedback()` RPC returns feedback, transcript, annotations (only if published)
4. Student sees:
   - Their text/transcript with teacher's highlights
   - "Teacher Comment(s)" for each annotation
   - Teacher feedback (rendered HTML)
   - Teacher transcript (for speaking)

## Admin Workflows

### Create Teacher Account
1. Admin navigates to Admin Teachers page
2. Admin clicks "Create Teacher" → form opens
3. Admin enters teacher name, email, password
4. `create-teacher` Edge Function creates auth user + profile + teacher record
5. Teacher appears in list and can sign in

### Ban/Unban User
1. Admin navigates to Admin Teachers or Admin Users page
2. Admin clicks "Ban" next to a user
3. `admin-user_management` Edge Function sets ban flag
4. Audit log entry created
5. Banned user's next request returns null profile → signed out
6. Admin can "Unban" to reverse

## Navigation Patterns

### Standard Navigation
- Sidebar items call `onNavigate(pageKey)` 
- `AppRouter` updates `currentPage` and pushes to browser history
- `PageContent` switch renders the appropriate page component

### Detail Navigation (with state)
- Some navigations pass state (e.g., `student-assignment-detail` with `assignmentId`)
- State is passed via `onNavigate(page, state)` and stored in `pageState`
- Browser history stores the state object

### Back/Forward
- Browser back/forward triggers `popstate` event
- `AppRouter` reads `window.history.state` and restores page + state
- `navKey` increments to force remount

### Workspace Mode
- `student-workspace` page renders fullscreen (no AppShell/Sidebar)
- Back button returns to assignment detail page
