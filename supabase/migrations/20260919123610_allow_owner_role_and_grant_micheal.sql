/*
# Allow 'owner' role in profiles and grant micheal full access

The profiles table had a CHECK constraint that only allowed admin/sales/marketing/tax_viewer.
The multi-tenant system uses 'owner' in tenant_members but the profiles.role constraint
was never updated. This adds 'owner' to the allowed roles.
*/

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'sales'::text, 'marketing'::text, 'tax_viewer'::text]));

-- Now set micheal as owner + platform admin
UPDATE profiles SET is_platform_admin = true, role = 'owner' WHERE email = 'micheal@puppyfy.ae';
UPDATE tenant_members SET role = 'owner' WHERE user_id = 'f2a55ca7-a0d4-4cc4-ac86-431068f6bd1a';

-- Verify
SELECT p.email, p.role, p.is_platform_admin, tm.role as tenant_role
FROM profiles p
JOIN tenant_members tm ON tm.user_id = p.id
WHERE p.email = 'micheal@puppyfy.ae';
