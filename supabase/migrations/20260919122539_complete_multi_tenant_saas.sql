/*
# Multi-tenant SaaS completion: trial enforcement, platform admin, per-tenant feature toggles, signup automation

## What this migration does

1. **Platform admin role**: adds `is_platform_admin` to profiles so a super-admin
   can manage all tenants. Promotes mina@puppyfy.ae to platform admin.

2. **Per-tenant feature_toggles**: switches PK from id=1 to tenant_id so each
   tenant has its own toggle row. Auto-creates via trigger on tenants.

3. **Trial enforcement**: `is_tenant_active()` function checks trial + subscription.

4. **create_tenant_for_user()**: SECURITY DEFINER function that atomically creates
   a tenant, settings, subscription (14-day trial), and owner membership.

5. **log_audit_action()**: helper for inserting audit logs.

6. **handle_new_user()**: updated to support new-business signup (creates a new
   tenant) vs joining the default tenant.

7. **RLS**: platform admin can read all profiles, tenants, members, subscriptions,
   settings, and audit_logs.
*/

-- ============ 1. Platform admin ============
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;
UPDATE profiles SET is_platform_admin = true WHERE email = 'mina@puppyfy.ae';

-- ============ 2. Per-tenant feature toggles ============
ALTER TABLE feature_toggles DROP CONSTRAINT IF EXISTS feature_toggles_pkey;
ALTER TABLE feature_toggles DROP CONSTRAINT IF EXISTS feature_toggles_id_check;
ALTER TABLE feature_toggles ADD CONSTRAINT feature_toggles_tenant_unique UNIQUE (tenant_id);

CREATE OR REPLACE FUNCTION public.ensure_feature_toggles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO feature_toggles (tenant_id, showings_enabled, pipeline_enabled, invoices_enabled, inventory_enabled, custom_fields_enabled, marketing_enabled, expenses_enabled, calendar_enabled, activity_log_enabled, email_logs_enabled)
  VALUES (NEW.id, true, true, true, true, true, true, true, true, true, true)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tenant_created_feature_toggles ON tenants;
CREATE TRIGGER on_tenant_created_feature_toggles
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION ensure_feature_toggles();

INSERT INTO feature_toggles (tenant_id, showings_enabled, pipeline_enabled, invoices_enabled, inventory_enabled, custom_fields_enabled, marketing_enabled, expenses_enabled, calendar_enabled, activity_log_enabled, email_logs_enabled)
SELECT t.id, true, true, true, true, true, true, true, true, true, true
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM feature_toggles ft WHERE ft.tenant_id = t.id)
ON CONFLICT (tenant_id) DO NOTHING;

-- ============ 3. Trial enforcement ============
ALTER TABLE tenants ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');
UPDATE tenants SET trial_ends_at = now() + interval '365 days'
WHERE id = '00000000-0000-0000-0000-000000000001' AND trial_ends_at IS NULL;

CREATE OR REPLACE FUNCTION public.is_tenant_active(tenant_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS(SELECT 1 FROM tenants WHERE id = tenant_uuid AND status = 'active')
    AND (
      EXISTS(
        SELECT 1 FROM tenant_subscriptions
        WHERE tenant_id = tenant_uuid
        AND status IN ('active', 'trialing')
      )
      OR EXISTS(
        SELECT 1 FROM tenants
        WHERE id = tenant_uuid
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at > now()
      )
    )
$$;

-- ============ 4. create_tenant_for_user ============
CREATE OR REPLACE FUNCTION public.create_tenant_for_user(
  p_name text,
  p_slug text,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id uuid;
BEGIN
  INSERT INTO tenants (name, slug, plan_tier, status, trial_ends_at)
  VALUES (p_name, p_slug, 'pro', 'active', now() + interval '14 days')
  RETURNING id INTO new_tenant_id;

  INSERT INTO tenant_settings (tenant_id, business_name, currency, primary_color)
  VALUES (new_tenant_id, p_name, 'AED', 'sage')
  ON CONFLICT (tenant_id) DO NOTHING;

  INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
  VALUES (new_tenant_id, 2, 'trialing', now(), now() + interval '14 days')
  ON CONFLICT (tenant_id) DO NOTHING;

  INSERT INTO tenant_members (tenant_id, user_id, role)
  VALUES (new_tenant_id, p_user_id, 'owner')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  UPDATE profiles SET tenant_id = new_tenant_id WHERE id = p_user_id;
  RETURN new_tenant_id;
END;
$$;

-- ============ 5. Audit log helper ============
CREATE OR REPLACE FUNCTION public.log_audit_action(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_action text,
  p_entity text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (tenant_id, actor_id, action, entity, entity_id, details)
  VALUES (p_tenant_id, p_actor_id, p_action, p_entity, p_entity_id, p_details);
END;
$$;

-- ============ 6. RLS updates for platform admin ============
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (
    id = auth.uid()
    OR EXISTS(SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
  );

DROP POLICY IF EXISTS "tenants_select_member" ON tenants;
CREATE POLICY "tenants_select_member" ON tenants FOR SELECT
  TO authenticated USING (
    EXISTS(SELECT 1 FROM tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = tenants.id)
    OR EXISTS(SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
  );

DROP POLICY IF EXISTS "tenants_update_member" ON tenants;
CREATE POLICY "tenants_update_member" ON tenants FOR UPDATE
  TO authenticated USING (
    (EXISTS(SELECT 1 FROM tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = tenants.id AND tm.role = 'owner'))
    OR EXISTS(SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
  )
  WITH CHECK (
    (EXISTS(SELECT 1 FROM tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = tenants.id AND tm.role = 'owner'))
    OR EXISTS(SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
  );

DROP POLICY IF EXISTS "tenant_members_select" ON tenant_members;
CREATE POLICY "tenant_members_select" ON tenant_members FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS(SELECT 1 FROM tenant_members tm2 WHERE tm2.user_id = auth.uid() AND tm2.tenant_id = tenant_members.tenant_id)
    OR EXISTS(SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
  );

DROP POLICY IF EXISTS "tenant_subscriptions_select" ON tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_select" ON tenant_subscriptions FOR SELECT
  TO authenticated USING (
    EXISTS(SELECT 1 FROM tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = tenant_subscriptions.tenant_id)
    OR EXISTS(SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
  );

DROP POLICY IF EXISTS "tenant_settings_select" ON tenant_settings;
CREATE POLICY "tenant_settings_select" ON tenant_settings FOR SELECT
  TO authenticated USING (
    EXISTS(SELECT 1 FROM tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = tenant_settings.tenant_id)
    OR EXISTS(SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
  );

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  TO authenticated USING (
    EXISTS(SELECT 1 FROM tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = audit_logs.tenant_id)
    OR EXISTS(SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
  );

-- ============ 7. Updated handle_new_user ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_role text;
  v_name text;
  v_new_business boolean;
  v_business_name text;
  v_slug text;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data ->> 'name', 'New User');
  v_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'sales');
  v_new_business := COALESCE((NEW.raw_user_meta_data ->> 'new_business')::boolean, false);
  v_business_name := COALESCE(NEW.raw_user_meta_data ->> 'business_name', v_name || '''s Business');
  v_slug := COALESCE(NEW.raw_user_meta_data ->> 'business_slug', regexp_replace(lower(v_business_name), '[^a-z0-9]', '-', 'g'));

  IF v_new_business THEN
    v_tenant_id := public.create_tenant_for_user(v_business_name, v_slug, NEW.id);
    v_role := 'owner';
  ELSE
    v_tenant_id := '00000000-0000-0000-0000-000000000001';
  END IF;

  INSERT INTO public.profiles (id, name, email, role, status, tenant_id, is_platform_admin)
  VALUES (NEW.id, v_name, NEW.email, v_role, 'active', v_tenant_id, false)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    tenant_id = EXCLUDED.tenant_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_id, NEW.id, v_role)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
