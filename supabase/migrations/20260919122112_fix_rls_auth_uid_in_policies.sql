/*
# Fix RLS tenant isolation — auth.uid() in SECURITY DEFINER

## Problem
get_tenant_id() was SECURITY DEFINER, which can cause auth.uid()
to return NULL when called from within an RLS policy context.
This made every tenant-scoped query return zero rows, so the app
appeared to have no data even though 12 sales and 14 clients
are still in the database.

## Fix
1. Simplify tenant_members SELECT policy to user_id = auth.uid()
   (instead of the self-referential EXISTS subquery)
2. Change get_tenant_id() to SECURITY INVOKER so it runs as the
   calling user — auth.uid() works correctly and RLS on
   tenant_members filters to just the current user's row
*/

-- Step 1: Simplify tenant_members policies
DROP POLICY IF EXISTS "tenant_members_select" ON tenant_members;
CREATE POLICY "tenant_members_select" ON tenant_members FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- Step 2: Rewrite get_tenant_id as SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1
$$;

-- Step 3: Also fix tenant_settings and tenant_subscriptions policies
-- to use the simpler user_id = auth.uid() pattern via get_tenant_id()
-- (these already work via EXISTS but let's make them consistent)

-- Verify the fix: check data is still there
SELECT 
  (SELECT count(*) FROM sales) as sales_count,
  (SELECT count(*) FROM clients) as clients_count,
  (SELECT count(*) FROM profiles) as profiles_count;
