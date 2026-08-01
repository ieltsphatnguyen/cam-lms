/*
# Add unique constraints on classstudents and teacherclasses

## Purpose
Prevent duplicate enrollment relationships. Currently there is no unique
constraint on (student_id, class_id) in classstudents or (teacher_id, class_id)
in teacherclasses, meaning the same student or teacher could be linked to the
same class multiple times.

## Changes
1. Add unique constraint on classstudents (student_id, class_id)
2. Add unique constraint on teacherclasses (teacher_id, class_id)

## Safety
- Verified that no duplicate rows currently exist in either table (0 duplicates).
- The constraints can be added without data migration.
*/

-- Unique constraint on classstudents (student_id, class_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'classstudents_student_id_class_id_key'
      AND table_name = 'classstudents'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE classstudents
      ADD CONSTRAINT classstudents_student_id_class_id_key
      UNIQUE (student_id, class_id);
  END IF;
END $$;

-- Unique constraint on teacherclasses (teacher_id, class_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'teacherclasses_teacher_id_class_id_key'
      AND table_name = 'teacherclasses'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE teacherclasses
      ADD CONSTRAINT teacherclasses_teacher_id_class_id_key
      UNIQUE (teacher_id, class_id);
  END IF;
END $$;
