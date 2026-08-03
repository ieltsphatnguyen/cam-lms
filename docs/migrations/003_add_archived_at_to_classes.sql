/*
# 003 — Add archived_at to classes (soft-archive support)

## Summary
Adds a single nullable timestamp column to the classes table that tracks
when a class was archived. This is a non-destructive, additive-only change.
No rows, columns, or policies are removed.

## Modified Tables
### classes
  - archived_at  timestamptz  DEFAULT NULL
    NULL  = the class is active (visible to teachers and students).
    NOT NULL = the class is archived. The timestamp records when it was archived.
    Archived classes are hidden from normal views and cannot be joined by students.
    All existing rows are unaffected (they implicitly become active with NULL).

## Application behaviour
  - Teachers can archive or restore any class they own.
  - Students can only join classes where archived_at IS NULL.
  - Existing student enrollments and any future assignment data are fully preserved.
  - This is soft-delete only. No data is ever physically deleted.

## Notes
  1. No RLS policy changes are required. The existing UPDATE policy already
     covers all column updates on classes owned by the teacher.
  2. Uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS for idempotency.
*/

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
