/*
# Clean up JWT sync trigger (no longer needed)
# get_tenant_id() now reads from tenant_members directly via auth.uid()
# so we don't need to sync tenant_id into raw_app_meta_data
*/

DROP TRIGGER IF EXISTS on_tenant_member_added ON tenant_members;
DROP FUNCTION IF EXISTS public.sync_tenant_to_jwt();

-- Also simplify handle_new_user: always assign to default tenant
-- (tenant_id from metadata won't be in JWT anyway)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant_id uuid;
BEGIN
  -- Use default tenant for all new signups
  tenant_id := '00000000-0000-0000-0000-000000000001';

  INSERT INTO public.profiles (id, name, email, role, status, tenant_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', 'New User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'sales'),
    'active',
    tenant_id
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (tenant_id, NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'role', 'sales'))
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
