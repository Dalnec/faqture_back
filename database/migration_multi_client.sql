-- Migration: Add multi-client support to faqture monitoring
-- Run this on the VPS PostgreSQL database (faqture_back)

-- Add client_id and client_name columns to faqture_errors
ALTER TABLE faqture_errors ADD COLUMN IF NOT EXISTS client_id VARCHAR(36);
ALTER TABLE faqture_errors ADD COLUMN IF NOT EXISTS client_name VARCHAR(255);

-- Add client_id to config_updates
ALTER TABLE config_updates ADD COLUMN IF NOT EXISTS client_id VARCHAR(36);

-- Add client_id to faqture_config
ALTER TABLE faqture_config ADD COLUMN IF NOT EXISTS client_id VARCHAR(36);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_errors_client ON faqture_errors(client_id);
CREATE INDEX IF NOT EXISTS idx_updates_client ON config_updates(client_id);
CREATE INDEX IF NOT EXISTS idx_config_client ON faqture_config(client_id);

-- Optional: Update existing rows with a default client_id if needed
-- Uncomment and modify the client_id value as needed:
-- UPDATE faqture_errors SET client_id = 'default-client-id' WHERE client_id IS NULL;
-- UPDATE config_updates SET client_id = 'default-client-id' WHERE client_id IS NULL;
-- UPDATE faqture_config SET client_id = 'default-client-id' WHERE client_id IS NULL;
