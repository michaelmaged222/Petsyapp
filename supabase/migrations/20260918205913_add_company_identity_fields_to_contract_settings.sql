/*
# Add company identity fields to contract_settings

1. New Columns on `contract_settings`
- `company_name` (text, default 'PUPPYFY UAE') — the business name shown in the contract letterhead, footer, and signature block.
- `company_tagline` (text, default 'Premium Puppies · United Arab Emirates') — the tagline line beneath the company name.
- `company_email` (text, default 'puppyfyuae2000@gmail.com') — the contact email shown in the letterhead and signature block.

2. Purpose
Makes the app fully white-label: another business can set its own name, tagline, and email in Settings and every generated contract reflects those values instead of the hardcoded "PUPPYFY UAE" defaults.

3. Security
No RLS changes — contract_settings already has existing policies. No new tables.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contract_settings' AND column_name = 'company_name') THEN
    ALTER TABLE contract_settings ADD COLUMN company_name text NOT NULL DEFAULT 'PUPPYFY UAE';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contract_settings' AND column_name = 'company_tagline') THEN
    ALTER TABLE contract_settings ADD COLUMN company_tagline text NOT NULL DEFAULT 'Premium Puppies · United Arab Emirates';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contract_settings' AND column_name = 'company_email') THEN
    ALTER TABLE contract_settings ADD COLUMN company_email text NOT NULL DEFAULT 'puppyfyuae2000@gmail.com';
  END IF;
END $$;
