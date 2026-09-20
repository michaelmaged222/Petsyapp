/*
# Marketing Commission Tracking System

1. New Columns
- `contracts.sale_source` (text, nullable) — tracks how the sale was acquired.
  Values: 'new_client_marketing', 'referral', 'returning_client', 'direct_walkin'.
- `sales.sale_source` (text, nullable) — same field on the sales record.

2. New Tables
- `commission_payments` — logs every time a marketing commission is marked as paid.
  - `id` (uuid PK)
  - `period_month` (date, first day of the covered month)
  - `net_profit_aed` (numeric, marketing net profit for that month)
  - `commission_egp` (numeric, commission amount paid in EGP)
  - `paid_by` (uuid, FK to profiles — the admin who marked it paid)
  - `paid_at` (timestamptz, when the payment was recorded)
  - `notes` (text, optional notes)
  - `created_at` (timestamptz)

3. Security
- RLS enabled on `commission_payments`.
- CRUD scoped to `authenticated` (admin/marketing roles enforced in app).
*/

-- Add sale_source to contracts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contracts' AND column_name = 'sale_source'
  ) THEN
    ALTER TABLE contracts ADD COLUMN sale_source text;
  END IF;
END $$;

-- Add sale_source to sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'sale_source'
  ) THEN
    ALTER TABLE sales ADD COLUMN sale_source text;
  END IF;
END $$;

-- Create commission_payments table
CREATE TABLE IF NOT EXISTS commission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,
  net_profit_aed numeric(12,2) NOT NULL DEFAULT 0,
  commission_egp numeric(12,2) NOT NULL DEFAULT 0,
  paid_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_month)
);

ALTER TABLE commission_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_commission_payments" ON commission_payments;
CREATE POLICY "select_commission_payments"
ON commission_payments FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_commission_payments" ON commission_payments;
CREATE POLICY "insert_commission_payments"
ON commission_payments FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_commission_payments" ON commission_payments;
CREATE POLICY "update_commission_payments"
ON commission_payments FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_commission_payments" ON commission_payments;
CREATE POLICY "delete_commission_payments"
ON commission_payments FOR DELETE
TO authenticated USING (true);
