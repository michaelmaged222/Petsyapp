/*
# Platform admins can toggle features for any business

## Problem
Feature toggles are stored per business (`feature_toggles.tenant_id`), but the
policies only allowed a user to read and change the row belonging to their OWN
tenant:

    USING (tenant_id = get_tenant_id())

A platform admin (super-admin) therefore could not see or change another
business's feature switches, so the Platform Admin screen had no way to toggle
features per business.

## Changes

1. Auto-create a toggle row for every business that is currently missing one,
   so the admin screen always has a row to edit.

2. Replace the three `feature_toggles` policies so they grant access when
   EITHER:
   - the row belongs to the signed-in user's own tenant (unchanged behaviour),
     OR
   - the signed-in user is a platform admin (`public.is_platform_admin()`).

## Modified tables
`feature_toggles` — policies only. No columns, types, or rows are removed.

## Security notes
- Still scoped to the `authenticated` role; anonymous access remains blocked.
- Normal members can still only read and edit their own business's features.
- Only platform admins get cross-business access, which is the intent of that
  role and matches how the Platform Admin screen already treats tenants.
- `is_platform_admin()` was already restricted to signed-in users in the
  previous migration.
*/

-- ============ 1. Backfill a toggle row for any business missing one ============

INSERT INTO feature_toggles (
  tenant_id, showings_enabled, pipeline_enabled, invoices_enabled,
  inventory_enabled, custom_fields_enabled, marketing_enabled,
  expenses_enabled, calendar_enabled, activity_log_enabled, email_logs_enabled
)
SELECT t.id, true, true, true, true, true, true, true, true, true, true
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM feature_toggles ft WHERE ft.tenant_id = t.id)
ON CONFLICT (tenant_id) DO NOTHING;

-- ============ 2. Policies: own tenant OR platform admin ============

DROP POLICY IF EXISTS "select_feature_toggles" ON feature_toggles;
CREATE POLICY "select_feature_toggles" ON feature_toggles FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_tenant_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS "insert_feature_toggles" ON feature_toggles;
CREATE POLICY "insert_feature_toggles" ON feature_toggles FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_tenant_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS "update_feature_toggles" ON feature_toggles;
CREATE POLICY "update_feature_toggles" ON feature_toggles FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_tenant_id() OR public.is_platform_admin())
  WITH CHECK (tenant_id = public.get_tenant_id() OR public.is_platform_admin());
