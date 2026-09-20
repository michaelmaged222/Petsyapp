/*
# Add importing country to contracts

1. Modified Tables
- `contracts`
  - `importing_country` (text, nullable) — the country of origin shown on Import contracts

2. Security
- No RLS policy changes — the existing contracts CRUD policies continue to apply.

3. Notes
- Existing Local contracts remain unchanged because this field is optional.
- The field is populated only when the Import contract form is selected.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'importing_country') THEN
    ALTER TABLE contracts ADD COLUMN importing_country text;
  END IF;
END $$;
