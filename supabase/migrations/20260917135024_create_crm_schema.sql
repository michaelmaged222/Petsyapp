/*
# Puppyfy CRM — Full Schema

## Overview
Creates the complete database schema for the Puppyfy UAE CRM system.
Multi-user, role-based CRM with 4 roles: admin, sales, marketing, tax_viewer.

## New Tables (in dependency order)
1. profiles — extends auth.users with name, role, status, last_login
2. leads — sales leads from WhatsApp/Instagram/Google/Referral
3. contracts — purchase contracts with auto-generated PF-YYMMDD-XXXX numbers
4. clients — registered clients, linked to contracts
5. sales — sales records with VAT tracking
6. expenses — business expense tracking by category
7. calendar_events — scheduled handovers, follow-ups, deadlines
8. email_logs — log of all emails sent
9. activity_logs — audit trail of every user action with IP
10. contract_activity — per-contract view/sign/open log

## Security
- RLS on every table, scoped to authenticated users
- All authenticated users can read/write CRM data (role checks done in UI)
- Activity logs are insert + read for authenticated users

## Notes
- Uses Supabase auth.users for authentication
- Trigger auto-creates profile on signup
- Contract numbers auto-generated as PF-YYMMDD-XXXX
*/

-- ============================================================
-- PROFILES TABLE (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'sales' CHECK (role IN ('admin', 'sales', 'marketing', 'tax_viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_login timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, status)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name', NEW.email, COALESCE(NEW.raw_user_meta_data->>'role', 'sales'), 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- LEADS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  breed_interested text,
  source text NOT NULL DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'instagram', 'google', 'referral')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'lost')),
  quality text NOT NULL DEFAULT 'warm' CHECK (quality IN ('hot', 'warm', 'cold')),
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select_all" ON leads;
CREATE POLICY "leads_select_all" ON leads FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "leads_insert_all" ON leads;
CREATE POLICY "leads_insert_all" ON leads FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "leads_update_all" ON leads;
CREATE POLICY "leads_update_all" ON leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "leads_delete_all" ON leads;
CREATE POLICY "leads_delete_all" ON leads FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- ============================================================
-- CONTRACTS TABLE (before clients — clients references contracts)
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number text UNIQUE,
  client_id uuid,
  buyer_name text NOT NULL,
  buyer_email text,
  buyer_phone text,
  buyer_id_passport text,
  contract_date date NOT NULL DEFAULT CURRENT_DATE,
  puppy_dob date,
  puppy_gender text CHECK (puppy_gender IN ('male', 'female')),
  breed text,
  color text,
  microchip_number text,
  purchase_price numeric(12,2) NOT NULL DEFAULT 0,
  down_payment numeric(12,2) NOT NULL DEFAULT 0,
  remaining_balance numeric(12,2) NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'local' CHECK (type IN ('local', 'imported')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  handover_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed')),
  pdf_url text,
  signature_data text,
  signed_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_select_all" ON contracts;
CREATE POLICY "contracts_select_all" ON contracts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "contracts_insert_all" ON contracts;
CREATE POLICY "contracts_insert_all" ON contracts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "contracts_update_all" ON contracts;
CREATE POLICY "contracts_update_all" ON contracts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "contracts_delete_all" ON contracts;
CREATE POLICY "contracts_delete_all" ON contracts FOR DELETE TO authenticated USING (true);

-- Auto-generate contract number
CREATE OR REPLACE FUNCTION public.generate_contract_number()
RETURNS TRIGGER AS $$
DECLARE
  date_part text;
  seq int;
  new_number text;
BEGIN
  IF NEW.contract_number IS NOT NULL AND NEW.contract_number != '' THEN
    RETURN NEW;
  END IF;
  date_part := to_char(CURRENT_DATE, 'YYMMDD');
  SELECT COUNT(*) + 1 INTO seq FROM contracts WHERE contract_number LIKE 'PF-' || date_part || '-%';
  new_number := 'PF-' || date_part || '-' || lpad(seq::text, 4, '0');
  NEW.contract_number := new_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_number ON contracts;
CREATE TRIGGER trg_contract_number
  BEFORE INSERT ON contracts
  FOR EACH ROW EXECUTE FUNCTION public.generate_contract_number();

CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_handover_date ON contracts(handover_date);

-- Now add FK from contracts.client_id to clients (added after clients table created below)
-- We'll add this constraint after creating clients.

-- ============================================================
-- CLIENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  id_passport text,
  breed text,
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  purchase_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select_all" ON clients;
CREATE POLICY "clients_select_all" ON clients FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "clients_insert_all" ON clients;
CREATE POLICY "clients_insert_all" ON clients FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "clients_update_all" ON clients;
CREATE POLICY "clients_update_all" ON clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "clients_delete_all" ON clients;
CREATE POLICY "clients_delete_all" ON clients FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);

-- Add reverse FK: contracts.client_id -> clients.id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_client_id_fkey') THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- SALES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  breed text,
  sale_type text NOT NULL DEFAULT 'local' CHECK (sale_type IN ('local', 'imported')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  vat_type text NOT NULL DEFAULT 'on_tax' CHECK (vat_type IN ('on_tax', 'off_tax')),
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_select_all" ON sales;
CREATE POLICY "sales_select_all" ON sales FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sales_insert_all" ON sales;
CREATE POLICY "sales_insert_all" ON sales FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sales_update_all" ON sales;
CREATE POLICY "sales_update_all" ON sales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sales_delete_all" ON sales;
CREATE POLICY "sales_delete_all" ON sales FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_sales_client_id ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

-- ============================================================
-- EXPENSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('rent', 'salary', 'marketing', 'utilities', 'veterinary', 'transport', 'other')),
  description text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  added_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select_all" ON expenses;
CREATE POLICY "expenses_select_all" ON expenses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "expenses_insert_all" ON expenses;
CREATE POLICY "expenses_insert_all" ON expenses FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "expenses_update_all" ON expenses;
CREATE POLICY "expenses_update_all" ON expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "expenses_delete_all" ON expenses;
CREATE POLICY "expenses_delete_all" ON expenses FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- ============================================================
-- CALENDAR EVENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL DEFAULT 'follow_up' CHECK (type IN ('handover', 'follow_up', 'overdue')),
  date date NOT NULL,
  linked_id uuid,
  linked_type text CHECK (linked_type IN ('contract', 'lead', 'client')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_select_all" ON calendar_events;
CREATE POLICY "calendar_select_all" ON calendar_events FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "calendar_insert_all" ON calendar_events;
CREATE POLICY "calendar_insert_all" ON calendar_events FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "calendar_update_all" ON calendar_events;
CREATE POLICY "calendar_update_all" ON calendar_events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "calendar_delete_all" ON calendar_events;
CREATE POLICY "calendar_delete_all" ON calendar_events FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_events(date);
CREATE INDEX IF NOT EXISTS idx_calendar_type ON calendar_events(type);

-- ============================================================
-- EMAIL LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  sent_at timestamptz DEFAULT now(),
  sent_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_logs_select_all" ON email_logs;
CREATE POLICY "email_logs_select_all" ON email_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "email_logs_insert_all" ON email_logs;
CREATE POLICY "email_logs_insert_all" ON email_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "email_logs_delete_all" ON email_logs;
CREATE POLICY "email_logs_delete_all" ON email_logs FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);

-- ============================================================
-- ACTIVITY LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  user_name text,
  action text NOT NULL,
  target text,
  target_id text,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_select_all" ON activity_logs;
CREATE POLICY "activity_logs_select_all" ON activity_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "activity_logs_insert_all" ON activity_logs;
CREATE POLICY "activity_logs_insert_all" ON activity_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "activity_logs_delete_all" ON activity_logs;
CREATE POLICY "activity_logs_delete_all" ON activity_logs FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);

-- ============================================================
-- CONTRACT ACTIVITY LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES contracts(id) ON DELETE CASCADE,
  action text NOT NULL,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contract_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contract_activity_select_all" ON contract_activity;
CREATE POLICY "contract_activity_select_all" ON contract_activity FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "contract_activity_insert_all" ON contract_activity;
CREATE POLICY "contract_activity_insert_all" ON contract_activity FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_contract_activity_contract_id ON contract_activity(contract_id);

-- ============================================================
-- UPDATE LAST LOGIN TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_last_login()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles SET last_login = now() WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_login ON auth.users;
CREATE TRIGGER on_auth_login
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at)
  EXECUTE FUNCTION public.update_last_login();