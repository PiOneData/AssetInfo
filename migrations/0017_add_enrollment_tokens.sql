-- Migration: Add enrollment_tokens table
-- Description: Creates table for managing device enrollment tokens
-- Date: 2025-12-09

CREATE TABLE IF NOT EXISTS enrollment_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,
  token VARCHAR NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_enrollment_tokens_tenant ON enrollment_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_tokens_token ON enrollment_tokens(token);
CREATE INDEX IF NOT EXISTS idx_enrollment_tokens_active ON enrollment_tokens(tenant_id, is_active);

-- Add comments
COMMENT ON TABLE enrollment_tokens IS 'Enrollment tokens for secure device enrollment';
COMMENT ON COLUMN enrollment_tokens.token IS 'Unique token string used in enrollment URLs';
COMMENT ON COLUMN enrollment_tokens.max_uses IS 'Maximum number of times token can be used (NULL = unlimited)';
COMMENT ON COLUMN enrollment_tokens.used_count IS 'Number of times token has been used';
