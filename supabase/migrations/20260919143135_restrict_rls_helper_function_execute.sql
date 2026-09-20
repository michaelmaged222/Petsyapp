/*
# Restrict RLS helper functions to signed-in users

## Changes
The five helper functions added to fix the recursive RLS policies were
callable by the `anon` role through the REST API. They only ever report
things about `auth.uid()` (which is null when signed out), so there was no
data leak — but they have no reason to be reachable without a session.

`EXECUTE` is revoked from `anon` (and from `PUBLIC`, the implicit grant) on:
- `is_platform_admin()`
- `is_tenant_member(uuid)`
- `is_tenant_admin(uuid)`
- `is_tenant_owner(uuid)`
- `get_tenant_id()`

`authenticated` and `service_role` keep `EXECUTE`, because the RLS policies
that call these helpers run as the signed-in user's role. No policy logic,
table, column, or row is changed.
*/

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_tenant_id() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_id() TO authenticated, service_role;
