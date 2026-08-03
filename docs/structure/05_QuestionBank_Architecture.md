# 05 — Question Bank Architecture

**Last Updated:** v0.8.2 (2026-08-03)

## Purpose

Manages the library of IELTS questions. Teachers create, edit, archive, duplicate, and search questions. Questions are categorized by type, category, tags, and response type (text or audio).

## Pages

- `src/pages/teacher/TeacherQuestionLibraryPage.tsx` — main question library page (also used by admin as `admin-question-library`)

## Components

- `src/components/questions/QuestionForm.tsx` — create/edit question form with type-specific fields
- `src/components/questions/QuestionPreview.tsx` — read-only question display
- `src/components/questions/SimilarQuestionsDialog.tsx` — similarity search results dialog

## Library Module

`src/lib/questions.ts` — all question CRUD and search operations.

### Constants

```typescript
QUESTION_TYPE_IDS = {
  WRITING_TASK_1: 1,
  WRITING_TASK_2: 2,
  SPEAKING_PART_1: 3,
  SPEAKING_PART_2: 4,
  SPEAKING_PART_3: 5,
  EXTRA_HOMEWORK: 6,
  CUSTOM: 7,
}
```

- `DEFAULT_RESPONSE_TYPE` — maps type IDs to 'text' or 'audio'
- `IMAGE_CAPABLE_TYPES` — Writing Task 1, Speaking Part 2, Custom (can have images)
- `CATEGORY_OPTIONS` — per-type dropdown category lists
- `DROPDOWN_CATEGORY_TYPES` — types using dropdown + "Others" free text
- `FREE_TEXT_CATEGORY_TYPES` — Extra Homework, Custom (single free-text field)
- `TWO_FIELD_CATEGORY_TYPES` — Speaking Part 1 (two free-text topic fields)
- `SPEAKING_PART_2_META` — preparation time (60s) and speaking time (120s)

### API Functions

| Function | Purpose |
|----------|---------|
| `fetchQuestionTypes()` | Fetch all 7 question types |
| `fetchQuestions(userId, filters)` | Fetch questions with owner/category/type/status/tags/search filters |
| `fetchQuestion(id)` | Fetch single question with type name |
| `createQuestion(input)` | Create new question (status='active') |
| `updateQuestion(id, input)` | Update question fields |
| `archiveQuestion(id)` | Set status='archived', set archived_at |
| `restoreQuestion(id)` | Set status='active', clear archived_at |
| `deleteQuestion(id)` | Hard delete question |
| `duplicateQuestion(source, userId)` | Create copy of a question |
| `fetchCategoriesForType(typeId)` | Distinct categories for a type |
| `fetchAllTags()` | All distinct tags |
| `fetchTagsForType(typeId)` | Tags filtered by type |
| `searchSimilarQuestions(prompt, excludeId)` | pg_trigram similarity search via RPC |
| `uploadQuestionImage(file, userId)` | Upload to `question-images` bucket, return public URL |
| `removeQuestionImage(imageUrl)` | Delete image from storage |
| `fetchTeachersForFilter()` | Fetch teacher profiles for owner filter dropdown |

## Database Tables

| Table | Purpose |
|-------|---------|
| `questions` | Question content, type, category, tags, status, owner |
| `questiontypes` | 7 built-in types (id 1-7) |
| `question_categories` | Category lookup |

## RPCs

| RPC | Purpose |
|-----|---------|
| `search_similar_questions` | pg_trigram similarity search |

## Storage

| Bucket | Path Pattern | Access |
|--------|--------------|--------|
| `question-images` | `{userId}/{timestamp}.{ext}` | Public read; owner-scoped write |

## Question Type System

Each question type has different UI behavior:

| Type | Response | Image | Category Style |
|------|----------|-------|---------------|
| Writing Task 1 | text | Yes | Dropdown (Dynamic Charts, Static Charts, etc.) |
| Writing Task 2 | text | No | Dropdown (Opinion, Discuss Both Views, etc.) |
| Speaking Part 1 | audio | No | Two free-text topic fields |
| Speaking Part 2 | audio | Yes | Dropdown (Person, Place, Object, etc.) |
| Speaking Part 3 | audio | No | Dropdown (Education, Technology, etc.) |
| Extra Homework | text | No | Free text |
| Custom | text | Yes | Free text + custom type name + custom instructions |

## Data Flow

```
TeacherQuestionLibraryPage
  ↓ fetchQuestions(userId, filters)
  ↓ supabase.from('questions').select(...)
  ↓ RLS filters by owner_id
  ↓ Returns QuestionWithDetails[]
  
QuestionForm
  ↓ createQuestion(input) / updateQuestion(id, input)
  ↓ supabase.from('questions').insert/update(...)
  
SimilarQuestionsDialog
  ↓ searchSimilarQuestions(prompt)
  ↓ supabase.rpc('search_similar_questions', ...)
  ↓ Returns SimilarQuestion[]
```

## Known Limitations

1. `owner_display_name` is not populated by `fetchQuestions` — it returns empty string. Owner names are resolved separately where needed.
2. `fetchTeachersForFilter` reads from `profiles` table directly — relies on RLS allowing teachers to see other teacher profiles.
3. Image upload uses `getPublicUrl` (not signed URLs) — images are publicly readable.
4. Similarity search requires at least 10 characters of input.
5. Tags are stored as PostgreSQL text arrays and queried with `overlaps`.
