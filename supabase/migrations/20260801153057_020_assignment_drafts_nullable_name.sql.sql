-- Assignment Drafts can now exist before name/class are filled.
-- Only publishing requires these fields, so validation moves to the
-- publish workflow rather than being enforced by the schema.

ALTER TABLE assignment_drafts ALTER COLUMN name DROP NOT NULL;
