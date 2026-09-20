import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { inviteTeammate, generateTempPassword } from '@/lib/team';
import type { Tenant, TenantSettings, TenantMember, TenantSubscription, SubscriptionPlan, UserRole } from '@/lib/supabase';

interface TenantContextType {
  tenant: Tenant | null;
  settings: TenantSettings | null;
  members: TenantMember[];
  subscription: TenantSubscription | null;
  plan: SubscriptionPlan | null;
  loading: boolean;
  setupComplete: boolean;
  trialDaysLeft: number | null;
  isTrialExpired: boolean;
  refresh: () => Promise<void>;
  markSetupComplete: () => Promise<boolean>;
  updateSettings: (partial: Partial<TenantSettings>) => Promise<boolean>;
  inviteMember: (email: string, role: UserRole) => Promise<{ error: string | null }>;
  updateMemberRole: (memberId: string, role: UserRole) => Promise<boolean>;
  removeMember: (memberId: string) => Promise<boolean>;
  isFeatureAvailable: (feature: string) => boolean;
  maxEmployees: number;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setTenant(null); setSettings(null); setMembers([]); setSubscription(null); setPlan(null);
      setLoading(false);
      return;
    }

    const [memberRes, settingsRes, subRes] = await Promise.all([
      supabase.from('tenant_members').select('*, tenant:tenants(*)').eq('user_id', user.id).maybeSingle(),
      supabase.from('tenant_settings').select('*').eq('tenant_id', user.tenant_id).maybeSingle(),
      supabase.from('tenant_subscriptions').select('*').eq('tenant_id', user.tenant_id).maybeSingle(),
    ]);

    const memberData = memberRes.data as (TenantMember & { tenant: Tenant }) | null;
    if (memberData?.tenant) {
      setTenant(memberData.tenant);
      setSettings(settingsRes.data as TenantSettings | null);

      const [membersRes, planRes] = await Promise.all([
        supabase.from('tenant_members').select('*').eq('tenant_id', memberData.tenant.id).order('created_at', { ascending: true }),
        supabase.from('subscription_plans').select('*').eq('id', subRes.data?.plan_id ?? 2).maybeSingle(),
      ]);
      setMembers((membersRes.data || []) as TenantMember[]);
      setSubscription(subRes.data as TenantSubscription | null);
      setPlan(planRes.data as SubscriptionPlan | null);
    } else if (memberData?.tenant_id) {
      const { data: tenantData } = await supabase.from('tenants').select('*').eq('id', memberData.tenant_id).maybeSingle();
      setTenant(tenantData as Tenant | null);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) refresh();
    else setLoading(false);
  }, [user, refresh]);

  const markSetupComplete = useCallback(async () => {
    if (!tenant) return false;
    const { error } = await supabase
      .from('tenants')
      .update({ setup_completed: true, updated_at: new Date().toISOString() })
      .eq('id', tenant.id);
    if (error) return false;
    setTenant({ ...tenant, setup_completed: true });
    return true;
  }, [tenant]);

  const updateSettings = useCallback(async (partial: Partial<TenantSettings>) => {
    if (!settings || !user?.tenant_id) return false;
    const { error } = await supabase.from('tenant_settings').update({ ...partial, updated_at: new Date().toISOString() }).eq('tenant_id', user.tenant_id);
    if (error) return false;
    setSettings({ ...settings, ...partial });
    return true;
  }, [settings, user?.tenant_id]);

  const inviteMember = useCallback(async (email: string, role: UserRole) => {
    if (!tenant) return { error: 'No tenant' };
    const { error } = await inviteTeammate({ email, name: email, role, password: generateTempPassword() });
    if (error) return { error };
    await refresh();
    return { error: null };
  }, [tenant, refresh]);

  const updateMemberRole = useCallback(async (memberId: string, role: UserRole) => {
    const { error } = await supabase.from('tenant_members').update({ role }).eq('id', memberId);
    if (error) return false;
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
    return true;
  }, []);

  const removeMember = useCallback(async (memberId: string) => {
    const { error } = await supabase.from('tenant_members').delete().eq('id', memberId);
    if (error) return false;
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    return true;
  }, []);

  const isFeatureAvailable = useCallback((feature: string) => {
    if (!plan) return true;
    return plan.features[feature] !== false;
  }, [plan]);

  const maxEmployees = plan?.max_employees ?? 999;

  const trialDaysLeft = tenant?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(tenant.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const isTrialExpired = trialDaysLeft !== null && trialDaysLeft <= 0 && subscription?.status !== 'active';

  return (
    <TenantContext.Provider value={{
      tenant, settings, members, subscription, plan, loading,
      setupComplete: tenant?.setup_completed ?? true,
      trialDaysLeft, isTrialExpired,
      refresh, markSetupComplete, updateSettings, inviteMember, updateMemberRole, removeMember,
      isFeatureAvailable, maxEmployees,
    }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
