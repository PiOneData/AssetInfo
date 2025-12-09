-- Migration: Add access_type column to user_app_access
-- Description: Adds the access_type column to track the type of access (admin, member, viewer, etc.)
-- Date: 2025-12-09

-- Add access_type column to user_app_access table
ALTER TABLE user_app_access ADD COLUMN IF NOT EXISTS access_type TEXT;

-- Add index for access_type queries
CREATE INDEX IF NOT EXISTS idx_user_app_access_access_type ON user_app_access(tenant_id, access_type);

-- Add comment explaining the column
COMMENT ON COLUMN user_app_access.access_type IS 'Type of access granted: admin, member, viewer, etc.';
