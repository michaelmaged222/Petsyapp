/*
# Add contract settings table and storage bucket for seller signature & stamp

1. New Tables
- `contract_settings` — singleton table (always row id=1) storing the seller's signature and stamp image URLs
  - `id` (int, primary key, always 1)
  - `seller_signature_url` (text, nullable) — public URL of the seller's handwritten signature image
  - `seller_stamp_url` (text, nullable) — public URL of the seller's official company stamp image
  - `updated_at` (timestamptz, auto-updated)
  - `updated_by` (uuid, references auth.users)

2. Storage
- Create public bucket `contract-assets` for uploading signature and stamp images
- Policies: authenticated users can upload/update/delete; public (anon) can read — the contract HTML opens in a separate browser tab and needs public image access

3. Security
- RLS enabled on `contract_settings`
- Authenticated users can read and write the singleton settings row
- Storage bucket allows public read and authenticated write
*/

CREATE TABLE IF NOT EXISTS contract_settings (
  id int PRIMARY KEY DEFAULT 1,
  seller_signature_url text,
  seller_stamp_url text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT singleton CHECK (id = 1)
);

ALTER TABLE contract_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_contract_settings" ON contract_settings;
CREATE POLICY "read_contract_settings" ON contract_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_contract_settings" ON contract_settings;
CREATE POLICY "insert_contract_settings" ON contract_settings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "write_contract_settings" ON contract_settings;
CREATE POLICY "write_contract_settings" ON contract_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-assets', 'contract-assets', true)
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "read_contract_assets" ON storage.objects;
CREATE POLICY "read_contract_assets" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'contract-assets');

DROP POLICY IF EXISTS "upload_contract_assets" ON storage.objects;
CREATE POLICY "upload_contract_assets" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'contract-assets');

DROP POLICY IF EXISTS "update_contract_assets" ON storage.objects;
CREATE POLICY "update_contract_assets" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'contract-assets');

DROP POLICY IF EXISTS "delete_contract_assets" ON storage.objects;
CREATE POLICY "delete_contract_assets" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'contract-assets');