-- Add app logo and contract watermark URL columns to contract_settings
ALTER TABLE contract_settings
  ADD COLUMN IF NOT EXISTS app_logo_url text,
  ADD COLUMN IF NOT EXISTS watermark_url text;
