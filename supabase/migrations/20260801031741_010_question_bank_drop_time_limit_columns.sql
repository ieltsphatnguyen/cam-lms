/*
# 010 — Question Bank: drop time limit columns

## Summary
Removes the `time_limit_enabled` and `time_limit_seconds` columns from the
`questions` table. Time limits are delivery settings that belong to Class
Assignments, not to reusable question content.

## Why this migration is required
The Question Bank stores reusable question content only. Time limits are
delivery settings — teachers decide how a particular class completes a
question when creating a Class Assignment. Storing timer fields in the
Question Bank conflates content with delivery. These columns were introduced
only for the Question Bank module and have no consumers outside it.

## Dropped Columns
### questions
  - `time_limit_enabled` (boolean) — removed
  - `time_limit_seconds` (integer) — removed

## Notes
  1. These columns were introduced in migration 008 and have no production data.
  2. No other tables reference these columns.
  3. All other columns are unchanged.
  4. RLS policies are unchanged.
*/

ALTER TABLE questions DROP COLUMN IF EXISTS time_limit_enabled;
ALTER TABLE questions DROP COLUMN IF EXISTS time_limit_seconds;