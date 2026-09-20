/*
# Add contract_id column to sales table

1. Changes
- Adds `contract_id` (uuid, nullable) to the `sales` table.
- Adds a foreign key from `sales.contract_id` to `contracts(id)` with ON DELETE SET NULL.
- Adds an index on `sales.contract_id` for faster lookups.
2. Security
- No RLS policy changes. Existing sales policies already allow authenticated CRUD.
3. Notes
- This fixes the "Failed to create sale" error when sending a contract to sale.
- The column is nullable so existing sale records are unaffected.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'contract_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN contract_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_contract_id_fkey'
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_contract_id_fkey
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_contract_id ON sales(contract_id);
