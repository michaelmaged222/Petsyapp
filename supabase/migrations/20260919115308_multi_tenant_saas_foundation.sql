/*
# Multi-Tenant SaaS Foundation

## Overview
Transforms Puppyfy CRM from single-tenant to multi-tenant SaaS. Each pet business
becomes a separate "tenant" (workspace) with full data isolation via tenant_id
columns and row-level security policies keyed on JWT claims.

## New Tables
1. tenants — top-level workspace for each pet business
2. tenant_members — maps auth.users to tenants with per-tenant roles
3. tenant_settings — per-tenant branding (logo, colors, business name)
4. subscription_plans — SaaS pricing tiers (Basic/Pro/Enterprise)
5. tenant_subscriptions — active subscription per tenant
6. audit_logs — compliance audit trail

## Modified Tables
All existing CRM tables get tenant_id column, backfilled to default tenant,
set NOT NULL with DEFAULT get_tenant_id(). All RLS policies rewritten for
tenant isolation.

## Security
- All RLS policies enforce (tenant_id = get_tenant_id()) where get_tenant_id()
  reads from JWT app_metadata
- A trigger syncs tenant_id into auth.users raw_app_meta_data on membership change
- handle_new_user trigger updated for multi-tenant signups
*/

-- ============================================================
-- 1. CREATE ALL NEW TABLES FIRST (no RLS yet)
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  plan_tier text NOT NULL DEFAULT 'basic' CHECK (plan_tier IN ('basic', 'pro', 'enterprise')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled', 'trial')),
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'sales', 'marketing', 'tax_viewer')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON tenant_members(user_id);

CREATE TABLE IF NOT EXISTS tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  business_name text NOT NULL DEFAULT '',
  logo_url text,
  primary_color text DEFAULT '#0f172a',
  accent_color text DEFAULT '#0ea5e9',
  contact_email text,
  contact_phone text,
  address text,
  currency text NOT NULL DEFAULT 'AED',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id int PRIMARY KEY,
  tier text UNIQUE NOT NULL CHECK (tier IN ('basic', 'pro', 'enterprise')),
  name text NOT NULL,
  price_monthly numeric(12,2) NOT NULL DEFAULT 0,
  price_yearly numeric(12,2) NOT NULL DEFAULT 0,
  max_employees int NOT NULL DEFAULT 5,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  stripe_price_id_monthly text,
  stripe_price_id_yearly text
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id int NOT NULL REFERENCES subscription_plans(id),
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'suspended')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================
-- 2. HELPER FUNCTION (needed before policies and defaults)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid
$$;

-- ============================================================
-- 3. SEED SUBSCRIPTION PLANS
-- ============================================================
INSERT INTO subscription_plans (id, tier, name, price_monthly, price_yearly, max_employees, features) VALUES
  (1, 'basic', 'Basic', 29.00, 290.00, 3, '{
    "pipeline": true, "leads": true, "clients": true, "contracts": true,
    "sales": true, "calendar": true, "expenses": true,
    "invoices": false, "inventory": false, "showings": false,
    "marketing": false, "custom_fields": false, "email_logs": false,
    "activity_log": false, "employees": false, "reports": false
  }'::jsonb),
  (2, 'pro', 'Professional', 79.00, 790.00, 10, '{
    "pipeline": true, "leads": true, "clients": true, "contracts": true,
    "sales": true, "calendar": true, "expenses": true,
    "invoices": true, "inventory": true, "showings": true,
    "marketing": true, "custom_fields": true, "email_logs": true,
    "activity_log": true, "employees": true, "reports": true
  }'::jsonb),
  (3, 'enterprise', 'Enterprise', 199.00, 1990.00, 999, '{
    "pipeline": true, "leads": true, "clients": true, "contracts": true,
    "sales": true, "calendar": true, "expenses": true,
    "invoices": true, "inventory": true, "showings": true,
    "marketing": true, "custom_fields": true, "email_logs": true,
    "activity_log": true, "employees": true, "reports": true,
    "audit_logs": true, "api_access": true, "custom_branding": true
  }'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  max_employees = EXCLUDED.max_employees,
  features = EXCLUDED.features;

-- ============================================================
-- 4. CREATE DEFAULT TENANT + SETTINGS + SUBSCRIPTION + MEMBERS
-- ============================================================
INSERT INTO tenants (id, name, slug, plan_tier, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Puppyfy Default', 'default', 'pro', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant_settings (tenant_id, business_name, currency)
VALUES ('00000000-0000-0000-0000-000000000001', 'Puppyfy CRM', 'AED')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, current_period_start)
VALUES ('00000000-0000-0000-0000-000000000001', 2, 'active', now())
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO tenant_members (tenant_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000001', id, 'admin' FROM auth.users
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- Make first user the owner
UPDATE tenant_members SET role = 'owner'
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND user_id = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1);

-- ============================================================
-- 5. ADD tenant_id TO ALL EXISTING TABLES + BACKFILL
-- ============================================================
DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'profiles', 'leads', 'contracts', 'clients', 'sales', 'expenses',
    'calendar_events', 'email_logs', 'activity_logs', 'contract_activity',
    'contract_settings', 'commission_payments', 'business_settings',
    'feature_toggles', 'invoices', 'invoice_items', 'inventory_items',
    'inventory_movements', 'custom_fields', 'sale_payments', 'sale_expenses',
    'showings'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = tbl AND column_name = 'tenant_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN tenant_id uuid', tbl);
    END IF;
    EXECUTE format('UPDATE %I SET tenant_id = ''00000000-0000-0000-0000-000000000001'' WHERE tenant_id IS NULL', tbl);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', tbl);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT public.get_tenant_id()', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_tenant_id ON %I(tenant_id)', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================
-- 6. SYNC tenant_id TO JWT ON MEMBERSHIP CHANGE
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_tenant_to_jwt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_meta jsonb;
BEGIN
  SELECT raw_app_meta_data INTO existing_meta FROM auth.users WHERE id = NEW.user_id;
  IF existing_meta IS NULL THEN
    existing_meta := '{}'::jsonb;
  END IF;
  UPDATE auth.users
    SET raw_app_meta_data = jsonb_set(existing_meta, '{tenant_id}', to_jsonb(NEW.tenant_id::text))
    WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tenant_member_added ON tenant_members;
CREATE TRIGGER on_tenant_member_added
  AFTER INSERT OR UPDATE ON tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_to_jwt();

-- ============================================================
-- 7. ENABLE RLS + POLICIES ON ALL NEW TABLES
-- ============================================================

-- TENANTS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenants_select_member" ON tenants;
CREATE POLICY "tenants_select_member" ON tenants FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = tenants.id)
  );
DROP POLICY IF EXISTS "tenants_update_member" ON tenants;
CREATE POLICY "tenants_update_member" ON tenants FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = tenants.id AND tenant_members.role = 'owner')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = tenants.id AND tenant_members.role = 'owner')
  );

-- TENANT_MEMBERS
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_members_select" ON tenant_members;
CREATE POLICY "tenant_members_select" ON tenant_members FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = tenant_members.tenant_id)
  );
DROP POLICY IF EXISTS "tenant_members_insert" ON tenant_members;
CREATE POLICY "tenant_members_insert" ON tenant_members FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = tenant_members.tenant_id AND tm.role IN ('owner', 'admin'))
  );
DROP POLICY IF EXISTS "tenant_members_update" ON tenant_members;
CREATE POLICY "tenant_members_update" ON tenant_members FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = tenant_members.tenant_id AND tm.role IN ('owner', 'admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = tenant_members.tenant_id AND tm.role IN ('owner', 'admin'))
  );
DROP POLICY IF EXISTS "tenant_members_delete" ON tenant_members;
CREATE POLICY "tenant_members_delete" ON tenant_members FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = tenant_members.tenant_id AND tm.role IN ('owner', 'admin'))
  );

-- TENANT_SETTINGS
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_settings_select" ON tenant_settings;
CREATE POLICY "tenant_settings_select" ON tenant_settings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = tenant_settings.tenant_id)
  );
DROP POLICY IF EXISTS "tenant_settings_update" ON tenant_settings;
CREATE POLICY "tenant_settings_update" ON tenant_settings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = tenant_settings.tenant_id AND tenant_members.role IN ('owner', 'admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = tenant_settings.tenant_id AND tenant_members.role IN ('owner', 'admin'))
  );
DROP POLICY IF EXISTS "tenant_settings_insert" ON tenant_settings;
CREATE POLICY "tenant_settings_insert" ON tenant_settings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = tenant_settings.tenant_id)
  );

-- SUBSCRIPTION_PLANS (readable by all authenticated)
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscription_plans_select" ON subscription_plans;
CREATE POLICY "subscription_plans_select" ON subscription_plans FOR SELECT
  TO authenticated USING (true);

-- TENANT_SUBSCRIPTIONS
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_subscriptions_select" ON tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_select" ON tenant_subscriptions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = tenant_subscriptions.tenant_id)
  );
DROP POLICY IF EXISTS "tenant_subscriptions_update" ON tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_update" ON tenant_subscriptions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = tenant_subscriptions.tenant_id AND tenant_members.role IN ('owner', 'admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = tenant_subscriptions.tenant_id AND tenant_members.role IN ('owner', 'admin'))
  );
DROP POLICY IF EXISTS "tenant_subscriptions_insert" ON tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_insert" ON tenant_subscriptions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = tenant_subscriptions.tenant_id)
  );

-- AUDIT_LOGS (insert + read within tenant)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = audit_logs.tenant_id)
  );
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM tenant_members WHERE tenant_members.user_id = auth.uid() AND tenant_members.tenant_id = audit_logs.tenant_id)
  );

-- ============================================================
-- 8. REWRITE ALL EXISTING RLS POLICIES FOR TENANT ISOLATION
-- ============================================================

-- PROFILES
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own" ON profiles FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- LEADS
DROP POLICY IF EXISTS "leads_select_all" ON leads;
CREATE POLICY "leads_select_all" ON leads FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "leads_insert_all" ON leads;
CREATE POLICY "leads_insert_all" ON leads FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "leads_update_all" ON leads;
CREATE POLICY "leads_update_all" ON leads FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "leads_delete_all" ON leads;
CREATE POLICY "leads_delete_all" ON leads FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- CONTRACTS
DROP POLICY IF EXISTS "contracts_select_all" ON contracts;
CREATE POLICY "contracts_select_all" ON contracts FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "contracts_insert_all" ON contracts;
CREATE POLICY "contracts_insert_all" ON contracts FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "contracts_update_all" ON contracts;
CREATE POLICY "contracts_update_all" ON contracts FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "contracts_delete_all" ON contracts;
CREATE POLICY "contracts_delete_all" ON contracts FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- CLIENTS
DROP POLICY IF EXISTS "clients_select_all" ON clients;
CREATE POLICY "clients_select_all" ON clients FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "clients_insert_all" ON clients;
CREATE POLICY "clients_insert_all" ON clients FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "clients_update_all" ON clients;
CREATE POLICY "clients_update_all" ON clients FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "clients_delete_all" ON clients;
CREATE POLICY "clients_delete_all" ON clients FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- SALES
DROP POLICY IF EXISTS "sales_select_all" ON sales;
CREATE POLICY "sales_select_all" ON sales FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "sales_insert_all" ON sales;
CREATE POLICY "sales_insert_all" ON sales FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "sales_update_all" ON sales;
CREATE POLICY "sales_update_all" ON sales FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "sales_delete_all" ON sales;
CREATE POLICY "sales_delete_all" ON sales FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- EXPENSES
DROP POLICY IF EXISTS "expenses_select_all" ON expenses;
CREATE POLICY "expenses_select_all" ON expenses FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "expenses_insert_all" ON expenses;
CREATE POLICY "expenses_insert_all" ON expenses FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "expenses_update_all" ON expenses;
CREATE POLICY "expenses_update_all" ON expenses FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "expenses_delete_all" ON expenses;
CREATE POLICY "expenses_delete_all" ON expenses FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- CALENDAR_EVENTS
DROP POLICY IF EXISTS "calendar_select_all" ON calendar_events;
CREATE POLICY "calendar_select_all" ON calendar_events FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "calendar_insert_all" ON calendar_events;
CREATE POLICY "calendar_insert_all" ON calendar_events FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "calendar_update_all" ON calendar_events;
CREATE POLICY "calendar_update_all" ON calendar_events FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "calendar_delete_all" ON calendar_events;
CREATE POLICY "calendar_delete_all" ON calendar_events FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- EMAIL_LOGS
DROP POLICY IF EXISTS "email_logs_select_all" ON email_logs;
CREATE POLICY "email_logs_select_all" ON email_logs FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "email_logs_insert_all" ON email_logs;
CREATE POLICY "email_logs_insert_all" ON email_logs FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "email_logs_delete_all" ON email_logs;
CREATE POLICY "email_logs_delete_all" ON email_logs FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- ACTIVITY_LOGS
DROP POLICY IF EXISTS "activity_logs_select_all" ON activity_logs;
CREATE POLICY "activity_logs_select_all" ON activity_logs FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "activity_logs_insert_all" ON activity_logs;
CREATE POLICY "activity_logs_insert_all" ON activity_logs FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "activity_logs_delete_all" ON activity_logs;
CREATE POLICY "activity_logs_delete_all" ON activity_logs FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- CONTRACT_ACTIVITY
DROP POLICY IF EXISTS "contract_activity_select_all" ON contract_activity;
CREATE POLICY "contract_activity_select_all" ON contract_activity FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "contract_activity_insert_all" ON contract_activity;
CREATE POLICY "contract_activity_insert_all" ON contract_activity FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());

-- CONTRACT_SETTINGS
DROP POLICY IF EXISTS "read_contract_settings" ON contract_settings;
CREATE POLICY "read_contract_settings" ON contract_settings FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "insert_contract_settings" ON contract_settings;
CREATE POLICY "insert_contract_settings" ON contract_settings FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "write_contract_settings" ON contract_settings;
CREATE POLICY "write_contract_settings" ON contract_settings FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());

-- COMMISSION_PAYMENTS
DROP POLICY IF EXISTS "select_commission_payments" ON commission_payments;
CREATE POLICY "select_commission_payments" ON commission_payments FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "insert_commission_payments" ON commission_payments;
CREATE POLICY "insert_commission_payments" ON commission_payments FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "update_commission_payments" ON commission_payments;
CREATE POLICY "update_commission_payments" ON commission_payments FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "delete_commission_payments" ON commission_payments;
CREATE POLICY "delete_commission_payments" ON commission_payments FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- BUSINESS_SETTINGS
DROP POLICY IF EXISTS "select_business_settings" ON business_settings;
CREATE POLICY "select_business_settings" ON business_settings FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "insert_business_settings" ON business_settings;
CREATE POLICY "insert_business_settings" ON business_settings FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "update_business_settings" ON business_settings;
CREATE POLICY "update_business_settings" ON business_settings FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "delete_business_settings" ON business_settings;
CREATE POLICY "delete_business_settings" ON business_settings FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- FEATURE_TOGGLES
DROP POLICY IF EXISTS "select_feature_toggles" ON feature_toggles;
CREATE POLICY "select_feature_toggles" ON feature_toggles FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "update_feature_toggles" ON feature_toggles;
CREATE POLICY "update_feature_toggles" ON feature_toggles FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "insert_feature_toggles" ON feature_toggles;
CREATE POLICY "insert_feature_toggles" ON feature_toggles FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());

-- INVOICES
DROP POLICY IF EXISTS "select_invoices" ON invoices;
CREATE POLICY "select_invoices" ON invoices FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "insert_invoices" ON invoices;
CREATE POLICY "insert_invoices" ON invoices FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "update_invoices" ON invoices;
CREATE POLICY "update_invoices" ON invoices FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "delete_invoices" ON invoices;
CREATE POLICY "delete_invoices" ON invoices FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- INVOICE_ITEMS
DROP POLICY IF EXISTS "select_invoice_items" ON invoice_items;
CREATE POLICY "select_invoice_items" ON invoice_items FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "insert_invoice_items" ON invoice_items;
CREATE POLICY "insert_invoice_items" ON invoice_items FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "update_invoice_items" ON invoice_items;
CREATE POLICY "update_invoice_items" ON invoice_items FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "delete_invoice_items" ON invoice_items;
CREATE POLICY "delete_invoice_items" ON invoice_items FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- INVENTORY_ITEMS
DROP POLICY IF EXISTS "select_inventory_items" ON inventory_items;
CREATE POLICY "select_inventory_items" ON inventory_items FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "insert_inventory_items" ON inventory_items;
CREATE POLICY "insert_inventory_items" ON inventory_items FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "update_inventory_items" ON inventory_items;
CREATE POLICY "update_inventory_items" ON inventory_items FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "delete_inventory_items" ON inventory_items;
CREATE POLICY "delete_inventory_items" ON inventory_items FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- INVENTORY_MOVEMENTS
DROP POLICY IF EXISTS "select_inventory_movements" ON inventory_movements;
CREATE POLICY "select_inventory_movements" ON inventory_movements FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "insert_inventory_movements" ON inventory_movements;
CREATE POLICY "insert_inventory_movements" ON inventory_movements FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "update_inventory_movements" ON inventory_movements;
CREATE POLICY "update_inventory_movements" ON inventory_movements FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "delete_inventory_movements" ON inventory_movements;
CREATE POLICY "delete_inventory_movements" ON inventory_movements FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- CUSTOM_FIELDS
DROP POLICY IF EXISTS "select_custom_fields" ON custom_fields;
CREATE POLICY "select_custom_fields" ON custom_fields FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "insert_custom_fields" ON custom_fields;
CREATE POLICY "insert_custom_fields" ON custom_fields FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "update_custom_fields" ON custom_fields;
CREATE POLICY "update_custom_fields" ON custom_fields FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "delete_custom_fields" ON custom_fields;
CREATE POLICY "delete_custom_fields" ON custom_fields FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- SALE_PAYMENTS
DROP POLICY IF EXISTS "sale_payments_select" ON sale_payments;
CREATE POLICY "sale_payments_select" ON sale_payments FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "sale_payments_insert" ON sale_payments;
CREATE POLICY "sale_payments_insert" ON sale_payments FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "sale_payments_update" ON sale_payments;
CREATE POLICY "sale_payments_update" ON sale_payments FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "sale_payments_delete" ON sale_payments;
CREATE POLICY "sale_payments_delete" ON sale_payments FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- SALE_EXPENSES
DROP POLICY IF EXISTS "sale_expenses_select" ON sale_expenses;
CREATE POLICY "sale_expenses_select" ON sale_expenses FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "sale_expenses_insert" ON sale_expenses;
CREATE POLICY "sale_expenses_insert" ON sale_expenses FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "sale_expenses_update" ON sale_expenses;
CREATE POLICY "sale_expenses_update" ON sale_expenses FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "sale_expenses_delete" ON sale_expenses;
CREATE POLICY "sale_expenses_delete" ON sale_expenses FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- SHOWINGS
DROP POLICY IF EXISTS "showings_select" ON showings;
CREATE POLICY "showings_select" ON showings FOR SELECT TO authenticated USING (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "showings_insert" ON showings;
CREATE POLICY "showings_insert" ON showings FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "showings_update" ON showings;
CREATE POLICY "showings_update" ON showings FOR UPDATE TO authenticated USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
DROP POLICY IF EXISTS "showings_delete" ON showings;
CREATE POLICY "showings_delete" ON showings FOR DELETE TO authenticated USING (tenant_id = public.get_tenant_id());

-- ============================================================
-- 9. UPDATE handle_new_user TRIGGER for multi-tenant
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant_id uuid;
BEGIN
  tenant_id := NULLIF(NEW.raw_app_meta_data ->> 'tenant_id', '')::uuid;
  IF tenant_id IS NULL THEN
    tenant_id := '00000000-0000-0000-0000-000000000001';
  END IF;

  INSERT INTO public.profiles (id, name, email, role, status, tenant_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', 'New User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'sales'),
    'active',
    tenant_id
  );

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (tenant_id, NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'role', 'sales'))
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
