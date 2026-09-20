/*
# Add company contract document column to contract_settings

1. Modified Tables
- `contract_settings` — add `company_contract_url` (text, nullable)
  - Stores the public URL of an uploaded PDF company contract template/document
  - Uploaded to the existing `contract-assets` storage bucket (which already allows PDF uploads)

2. Security
- No new policies needed — the existing RLS policies on `contract_settings` (authenticated read/write) and `contract-assets` storage bucket (public read, authenticated write) already cover this new column.

3. Notes
- The column is nullable so existing settings rows are unaffected.
- The existing `contract-assets` bucket is public for reads and allows authenticated uploads of any file type, so PDF uploads work without storage policy changes.
*/

ALTER TABLE contract_settings
  ADD COLUMN IF NOT EXISTS company_contract_url text;
