/*
# Financial Intelligence & Reporting System

1. New Tables
- `business_settings` — single-row table (id=1) holding the monthly cycle start day
  - `monthly_cycle_start_day` (int, default 11) — day of month when each business cycle starts (1-28)
  - `updated_by` (uuid, nullable) — admin who last changed it
  - `updated_at` (timestamptz)

2. Modified Tables
- `expenses` — add `expense_type` column (text, default 'business')
  - Values: 'operating' (deducted in Tier 2 / Net Profit) or 'business' (deducted in Tier 3 / Shareholder Dividends)
  - Existing rows default to 'business' (preserves current behavior since they were all general expenses)
- `sales` — add two columns:
  - `puppy_cost` (numeric, default 0) — acquisition cost of the puppy
  - `delivery_cost` (numeric, default 0) — delivery cost for this sale

3. Security
- `business_settings` — RLS enabled, 4 CRUD policies for authenticated users (admin-managed setting)
- No changes to existing table policies (new columns are accessible under existing policies)

4. Important Notes
- All new columns have safe defaults so existing rows and code continue working
- `expense_type` defaults to 'business' so existing expenses are classified as business expenses (Tier 3)
- `puppy_cost` and `delivery_cost` default to 0 so existing sales have no operating cost from these fields
- The monthly cycle start day defaults to 11 per the business requirement
*/

-- Add expense_type to expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_type text NOT NULL DEFAULT 'business';

-- Add puppy_cost and delivery_cost to sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS puppy_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_cost numeric NOT NULL DEFAULT 0;

-- Create business_settings table
CREATE TABLE IF NOT EXISTS business_settings (
  id int PRIMARY KEY DEFAULT 1,
  monthly_cycle_start_day int NOT NULL DEFAULT 11 CHECK (monthly_cycle_start_day >= 1 AND monthly_cycle_start_day <= 28),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_business_settings" ON business_settings;
CREATE POLICY "select_business_settings" ON business_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_business_settings" ON business_settings;
CREATE POLICY "insert_business_settings" ON business_settings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_business_settings" ON business_settings;
CREATE POLICY "update_business_settings" ON business_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_business_settings" ON business_settings;
CREATE POLICY "delete_business_settings" ON business_settings FOR DELETE
  TO authenticated USING (true);

-- Seed the single row
INSERT INTO business_settings (id, monthly_cycle_start_day) VALUES (1, 11)
  ON CONFLICT (id) DO NOTHING;
