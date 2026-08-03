/*
# Fix questions.owner_id: Add FK and NOT NULL constraint

## Purpose
The `questions.owner_id` column is used by the application but has no foreign
key to `profiles(id)` and is nullable despite always being populated. This
migration adds the missing FK and makes the column NOT NULL.

## Changes
1. Add foreign key constraint: `questions.owner_id → profiles(id) ON DELETE RESTRICT`
2. Alter `questions.owner_id` to NOT NULL

## Safety
- Verified that no existing rows have NULL owner_id (0 rows).
- Verified that no existing owner_id values are orphaned (0 rows).
- ON DELETE RESTRICT prevents deleting a profile that still owns questions.

## Notes
- The FK uses ON DELETE RESTRICT (not CASCADE) because deleting a user who
  owns questions should not silently remove those questions. The application
  already prevents profile deletion via RLS (no DELETE policy on profiles).
- The existing index `idx_questions_owner_id` remains and now supports the FK.
*/

-- Step 1: Add the foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'questions_owner_id_fkey'
      AND table_name = 'questions'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES profiles(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Step 2: Make owner_id NOT NULL
ALTER TABLE questions ALTER COLUMN owner_id SET NOT NULL;
