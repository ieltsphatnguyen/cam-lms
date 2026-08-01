/*
# Add Assignment Item metadata columns to assignment_draft_questions

## Purpose
Each Assignment Item (a draft question row) needs its own scheduling metadata:
available_from, due_date, due_after_days, timed, time_limit. These belong to
the Assignment Item, not to questions, presets, or the draft itself.

## Changes
1. Add available_from (timestamptz, nullable)
2. Add due_date (timestamptz, nullable)
3. Add due_after_days (integer, nullable) — convenience field for auto-calc
4. Add timed (boolean, default false)
5. Add time_limit (interval, nullable)

## Safety
All new columns are nullable with defaults where appropriate. No existing
data is affected — existing rows get NULL for the new columns.
*/

ALTER TABLE assignment_draft_questions
  ADD COLUMN IF NOT EXISTS available_from timestamptz,
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS due_after_days integer,
  ADD COLUMN IF NOT EXISTS timed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS time_limit interval;
