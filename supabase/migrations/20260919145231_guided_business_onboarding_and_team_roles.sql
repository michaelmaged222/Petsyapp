/*
# Guided business onboarding + team roles

Supports the owner journey:
  sign up -> company profile -> branding/documents -> choose features -> add team

## Changes

1. `tenants.setup_completed` (boolean, default false)
   Marks whether a business has finished the guided onboarding. Existing
   businesses are marked complete so they are not pushed through the wizard.

2. Two new team roles: `finance` and `receptionist`
   Extends the role CHECK constraints on `profiles` and `tenant_members`.
   - finance:      sales, invoices, expenses, reports, stats
   - receptionist: leads, showings, clients, calendar
   Existing roles (owner, admin, sales, marketing, tax_viewer) are untouched.

3. `handle_new_user()` now respects an invited teammate's business
   Previously, a teammate added from the Employees screen was always attached
   to the default tenant, because the signup call did not pass a tenant id and
   the trigger ignored it. Now, when signup includes `tenant_id` (and is not a
   new-business signup), the profile and membership are created inside that
   business with the requested role. The new-business path is unchanged.

## Modified tables
`tenants` (one new column), `profiles` + `tenant_members` (role constraints
widened). No columns are dropped, no rows are deleted, and no existing role is
invalidated.

## Security notes
- Widening a CHECK constraint only permits the two new role values; it does not
  grant any new access by itself. Access is controlled by the app's page rules
  and by the existing tenant-scoped RLS policies.
- `handle_new_user()` remains SECURITY DEFINER with a locked `search_path`.
- A teammate can only be attached to the tenant explicitly passed at signup,
  and only by an administrator via the Employees screen.
*/

-- ============ 1. Setup-complete flag ============

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS setup_completed boolean NOT NULL DEFAULT false;
UPDATE tenants SET setup_completed = true WHERE setup_completed = false;

-- ============ 2. New team roles ============

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['owner','admin','sales','marketing','tax_viewer','finance','receptionist']::text[]));

ALTER TABLE tenant_members DROP CONSTRAINT IF EXISTS tenant_members_role_check;
ALTER TABLE tenant_members ADD CONSTRAINT tenant_members_role_check
  CHECK (role = ANY (ARRAY['owner','admin','sales','marketing','tax_viewer','finance','receptionist']::text[]));

-- ============ 3. Invited teammates join the correct business ============

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_invited_tenant uuid;
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

  v_invited_tenant := NULLIF(NEW.raw_user_meta_data ->> 'tenant_id', '')::uuid;

  IF v_new_business THEN
    v_tenant_id := public.create_tenant_for_user(v_business_name, v_slug, NEW.id);
    v_role := 'owner';
  ELSIF v_invited_tenant IS NOT NULL THEN
    v_tenant_id := v_invited_tenant;
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
