ALTER TABLE assets
ADD COLUMN IF NOT EXISTS added_via_enrollment boolean NOT NULL DEFAULT false;

UPDATE assets
SET added_via_enrollment = true
WHERE specifications -> 'agent' IS NOT NULL;
