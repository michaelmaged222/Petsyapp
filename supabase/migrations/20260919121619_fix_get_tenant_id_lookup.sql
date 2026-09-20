/*
# Fix get_tenant_id to look up from tenant_members instead of JWT

## Problem
Supabase does not inject raw_app_meta_data into the JWT payload.
The original get_tenant_id() used auth.jwt() ->> 'tenant_id' which
always returned NULL, causing all tenant-scoped RLS policies to
block every query — including the profile lookup at login.

## Fix
Rewrite get_tenant_id() as a SECURITY DEFINER function that looks
up the tenant_id from tenant_members using auth.uid(). This is the
correct Supabase pattern for multi-tenant isolation without custom
JWT claims (which require Pro plan auth hooks).
*/

CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1
$$;
