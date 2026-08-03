/*
# Clean up duplicate attempts and enforce one attempt per item per student

There's one duplicate pair (item 22, student a95f1a9d...). Keep the most
recent attempt (highest id), delete the older one.
*/

-- Delete duplicate attempts, keeping the one with the highest id (most recent)
DELETE FROM student_attempts
WHERE id NOT IN (
  SELECT MAX(id) FROM student_attempts
  GROUP BY published_assignment_item_id, student_profile_id
);

-- Now enforce uniqueness: one attempt per student per published item
DROP INDEX IF EXISTS uniq_active_attempt;
CREATE UNIQUE INDEX uniq_one_attempt_per_item
  ON student_attempts (published_assignment_item_id, student_profile_id);
