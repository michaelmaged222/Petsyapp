/*
# Fix infinite recursion in RLS policies (login "Profile not found")

## Problem
Signing in succeeded but the app reported "Profile not found. Please contact
an administrator." The real database error was:

    infinite recursion detected in policy for relation "profiles"

The `profiles_select_own` policy looked up whether the current user is a
platform admin by running a subquery against `profiles` from inside the
`profiles` policy itself. Postgres detects this at query planning time and
refuses to run the query at all, so EVERY profile read failed — including the
simple `id = auth.uid()` case.

The same self-referencing anti-pattern existed in `tenant_members`, and
`get_tenant_id()` (used by most tables) queried `tenant_members`, whose SELECT
policy recursed into `tenant_members`. That meant tenant-scoped tables
(sales, clients, leads, contracts, expenses, and more) were also unable to
read their data.

## Fix
1. New helper functions, all SECURITY DEFINER with `row_security = off` so
   they can inspect membership/admin tables WITHOUT re-triggering the
   policies that call them — this is what breaks the recursion cycle:
   - `is_platform_admin()`                 -> is the current user a platform admin?
   - `is_tenant_member(p_tenant_id uuid)`  -> is the current user in this tenant?
   - `is_tenant_admin(p_tenant_id uuid)`   -> is the current user owner/admin of this tenant?
   - `is_tenant_owner(p_tenant_id uuid)`   -> is the current user the owner of this tenant?
   Each only ever answers questions about `auth.uid()`, so it leaks nothing.

2. `get_tenant_id()` rewritten as SECURITY DEFINER with `row_security = off`
   and a locked `search_path`. It returns the calling user's tenant id. This
   fixes every table whose policy calls it.

3. Policies rewritten to call the helpers instead of embedding self-subqueries:
   - profiles:            select / update / delete / insert
   - tenant_members:      select / insert / update / delete
   - tenants:             select / update
   - tenant_settings:     select / insert / update
   - tenant_subscriptions:select / insert / update
   - audit_logs:          select / insert

## Modified tables
`profiles`, `tenant_members`, `tenants`, `tenant_settings`,
`tenant_subscriptions`, `audit_logs` — policies only. No columns, types, or
rows are changed, and no data is dropped.

## Security notes
- All policies remain scoped to the `authenticated` role; nothing is opened
  to anonymous access.
- Tenant isolation is preserved: reads stay limited to the user's own tenant,
  and membership/admin management stays limited to that tenant's owner/admin.
- Platform admins retain the cross-tenant read access they had before.
- The helpers are `STABLE` and only read `auth.uid()`, so they cannot be used
  to probe other users' data.
*/

-- ============ 1. Helper functions (break the recursion cycle) ============

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT COALESCE(
    (SELECT p.is_platform_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid() AND tm.tenant_id = p_tenant_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id = p_tenant_id
      AND tm.role IN ('owner', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_owner(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id = p_tenant_id
      AND tm.role = 'owner'
  )
$$;

-- ============ 2. get_tenant_id: no longer depends on tenant_members RLS ============

CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT tm.tenant_id FROM public.tenant_members tm
  WHERE tm.user_id = auth.uid()
  LIMIT 1
$$;

-- ============ 3. Rewritten policies ============

-- profiles
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_platform_admin() OR tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_tenant_id())
  WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own" ON profiles FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_tenant_id());

-- tenant_members
DROP POLICY IF EXISTS "tenant_members_select" ON tenant_members;
CREATE POLICY "tenant_members_select" ON tenant_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_tenant_member(tenant_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_members_insert" ON tenant_members;
CREATE POLICY "tenant_members_insert" ON tenant_members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS "tenant_members_update" ON tenant_members;
CREATE POLICY "tenant_members_update" ON tenant_members FOR UPDATE
  TO authenticated
  USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS "tenant_members_delete" ON tenant_members;
CREATE POLICY "tenant_members_delete" ON tenant_members FOR DELETE
  TO authenticated
  USING (public.is_tenant_admin(tenant_id));

-- tenants
DROP POLICY IF EXISTS "tenants_select_member" ON tenants;
CREATE POLICY "tenants_select_member" ON tenants FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "tenants_update_member" ON tenants;
CREATE POLICY "tenants_update_member" ON tenants FOR UPDATE
  TO authenticated
  USING (public.is_tenant_owner(id) OR public.is_platform_admin())
  WITH CHECK (public.is_tenant_owner(id) OR public.is_platform_admin());

-- tenant_settings
DROP POLICY IF EXISTS "tenant_settings_select" ON tenant_settings;
CREATE POLICY "tenant_settings_select" ON tenant_settings FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_settings_insert" ON tenant_settings;
CREATE POLICY "tenant_settings_insert" ON tenant_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "tenant_settings_update" ON tenant_settings;
CREATE POLICY "tenant_settings_update" ON tenant_settings FOR UPDATE
  TO authenticated
  USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));

-- tenant_subscriptions
DROP POLICY IF EXISTS "tenant_subscriptions_select" ON tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_select" ON tenant_subscriptions FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_subscriptions_insert" ON tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_insert" ON tenant_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "tenant_subscriptions_update" ON tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_update" ON tenant_subscriptions FOR UPDATE
  TO authenticated
  USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));

-- audit_logs
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
