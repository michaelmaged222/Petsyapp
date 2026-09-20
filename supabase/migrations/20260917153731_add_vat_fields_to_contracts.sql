/*
# Add VAT fields to contracts table

1. Modified Tables
- `contracts`
  - `vat_enabled` (boolean, default false) — whether 5% VAT is applied to the base price
  - `vat_amount` (numeric(12,2), default 0) — the calculated VAT amount
  - `total_amount` (numeric(12,2), default 0) — purchase price + VAT amount

2. Security
- No RLS policy changes — existing policies already cover all CRUD operations.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'vat_enabled') THEN
    ALTER TABLE contracts ADD COLUMN vat_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'vat_amount') THEN
    ALTER TABLE contracts ADD COLUMN vat_amount numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'total_amount') THEN
    ALTER TABLE contracts ADD COLUMN total_amount numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;
