import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Shield, Building2, DollarSign, TrendingUp, Search, Check, X, ToggleLeft, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/Toast';
import { FEATURE_LIST, DEFAULT_FEATURE_TOGGLES, countEnabledFeatures } from '@/lib/features';
import type { FeatureToggles } from '@/lib/useFeatureToggles';
import type { Tenant, TenantSubscription, SubscriptionPlan } from '@/lib/supabase';

interface TenantWithDetails extends Tenant {
  member_count: number;
  subscription?: TenantSubscription | null;
  plan?: SubscriptionPlan | null;
}

export default function PlatformAdmin() {
  const [tenants, setTenants] = useState<TenantWithDetails[]>([]);
  const [featureRows, setFeatureRows] = useState<Record<string, FeatureToggles>>({});
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, active: 0, trial: 0, mrr: 0 });

  const featuresRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [tenantRes, subRes, planRes, memberRes, togglesRes] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at', { ascending: false }),
      supabase.from('tenant_subscriptions').select('*'),
      supabase.from('subscription_plans').select('*'),
      supabase.from('tenant_members').select('tenant_id'),
      supabase.from('feature_toggles').select('*'),
    ]);

    const tenantsData = (tenantRes.data || []) as Tenant[];
    const subsData = (subRes.data || []) as TenantSubscription[];
    const plansData = (planRes.data || []) as SubscriptionPlan[];
    const membersData = memberRes.data || [];

    const combined: TenantWithDetails[] = tenantsData.map((t) => {
      const sub = subsData.find((s) => s.tenant_id === t.id);
      const plan = plansData.find((p) => p.id === sub?.plan_id);
      const memberCount = membersData.filter((m) => m.tenant_id === t.id).length;
      return { ...t, member_count: memberCount, subscription: sub, plan };
    });

    const rows: Record<string, FeatureToggles> = {};
    for (const row of togglesRes.data || []) {
      const { tenant_id, ...rest } = row as FeatureToggles & { tenant_id: string };
      rows[tenant_id] = rest;
    }

    setTenants(combined);
    setFeatureRows(rows);
    setSelectedTenantId((prev) => prev ?? combined[0]?.id ?? null);

    const active = combined.filter((t) => t.status === 'active').length;
    const trialSubs = combined.filter((t) => t.subscription?.status === 'trialing').length;
    const mrr = combined
      .filter((t) => t.subscription?.status === 'active')
      .reduce((sum, t) => sum + (t.plan?.price_monthly || 0), 0);

    setStats({ total: combined.length, active, trial: trialSubs, mrr });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleTenantStatus = async (tenant: Tenant) => {
    const newStatus = tenant.status === 'active' ? 'suspended' : 'active';
    const { error } = await supabase.from('tenants').update({ status: newStatus }).eq('id', tenant.id);
    if (error) { toast('error', 'Failed to update tenant'); return; }
    toast('success', `${tenant.name} ${newStatus === 'active' ? 'activated' : 'suspended'}`);
    fetchData();
  };

  const togglesFor = useCallback(
    (tenantId: string): FeatureToggles => featureRows[tenantId] ?? { ...DEFAULT_FEATURE_TOGGLES },
    [featureRows],
  );

  const toggleFeature = async (tenantId: string, key: keyof FeatureToggles, value: boolean) => {
    const previous = togglesFor(tenantId);
    const next = { ...previous, [key]: value };
    setFeatureRows((prev) => ({ ...prev, [tenantId]: next }));
    setSavingKey(`${tenantId}:${key}`);

    const { error } = await supabase
      .from('feature_toggles')
      .upsert({ tenant_id: tenantId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });

    setSavingKey(null);
    if (error) {
      setFeatureRows((prev) => ({ ...prev, [tenantId]: previous }));
      toast('error', 'Failed to update feature');
    }
  };

  const manageFeatures = (tenantId: string) => {
    setSelectedTenantId(tenantId);
    window.requestAnimationFrame(() => {
      featuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const filtered = tenants.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  );

  const selectedTenant = useMemo(
    () => tenants.find((t) => t.id === selectedTenantId) ?? null,
    [tenants, selectedTenantId],
  );

  const selectedToggles = selectedTenant ? togglesFor(selectedTenant.id) : null;

  if (loading) {
    return <div className="p-6 text-gray-400">Loading platform data...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-7 h-7 text-accent-400" />
          Platform Admin Dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage all tenants, control their features, monitor revenue, and oversee the platform</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <Building2 className="w-5 h-5 text-accent-400" />
            <span className="text-xs text-gray-500">Total</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
          <p className="text-xs text-gray-400 mt-1">Tenants</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <Check className="w-5 h-5 text-success-400" />
            <span className="text-xs text-gray-500">Active</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.active}</p>
          <p className="text-xs text-gray-400 mt-1">Paying tenants</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-warning-400" />
            <span className="text-xs text-gray-500">Trial</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.trial}</p>
          <p className="text-xs text-gray-400 mt-1">On free trial</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-5 h-5 text-success-400" />
            <span className="text-xs text-gray-500">MRR</span>
          </div>
          <p className="text-2xl font-bold text-success-400">${stats.mrr.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-1">Monthly revenue</p>
        </div>
      </div>

      {/* Per-business feature management */}
      <div className="card p-6" ref={featuresRef}>
        <div className="flex items-center gap-2 mb-1">
          <ToggleLeft className="w-5 h-5 text-accent-400" />
          <h2 className="text-lg font-semibold text-white">Business Features</h2>
        </div>
        <p className="text-sm text-gray-500 mb-6">Choose a business, then switch optional modules on or off. Disabled modules disappear from that business's sidebar.</p>

        {tenants.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">No businesses yet.</div>
        ) : (
          <div className="grid lg:grid-cols-[280px_1fr] gap-6">
            {/* Business list */}
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {tenants.map((t) => {
                const active = t.id === selectedTenantId;
                const enabledCount = countEnabledFeatures(togglesFor(t.id));
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTenantId(t.id)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${
                      active
                        ? 'border-accent-500/50 bg-accent-500/10'
                        : 'border-primary-800 bg-primary-950/40 hover:bg-primary-800/30'
                    }`}
                  >
                    <p className={`text-sm font-medium truncate ${active ? 'text-white' : 'text-gray-300'}`}>{t.name}</p>
                    <p className="text-xs text-gray-500 truncate">{t.slug}</p>
                    <p className={`text-[11px] mt-1 ${enabledCount === FEATURE_LIST.length ? 'text-success-400' : 'text-warning-400'}`}>
                      {enabledCount}/{FEATURE_LIST.length} features on
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Feature switches */}
            <div>
              {selectedTenant && selectedToggles ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-sage to-secondary-600 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{selectedTenant.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {countEnabledFeatures(selectedToggles)} of {FEATURE_LIST.length} features enabled
                      </p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    {FEATURE_LIST.map((feature) => {
                      const enabled = selectedToggles[feature.key];
                      const Icon = feature.icon;
                      const saving = savingKey === `${selectedTenant.id}:${feature.key}`;
                      return (
                        <div
                          key={feature.key}
                          className="flex items-start justify-between gap-3 rounded-xl border border-primary-800 bg-primary-950/40 p-4"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${enabled ? 'bg-accent-500/10 text-accent-400' : 'bg-primary-800 text-gray-600'}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-white">{feature.label}</h4>
                              <p className="text-xs text-gray-500 mt-0.5">{feature.description}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleFeature(selectedTenant.id, feature.key, !enabled)}
                            disabled={saving}
                            className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-60 ${
                              enabled ? 'bg-accent-500' : 'bg-primary-700'
                            }`}
                            aria-label={enabled ? `Disable ${feature.label}` : `Enable ${feature.label}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-6' : ''}`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                  <SlidersHorizontal className="w-8 h-8 mb-3 text-gray-600" />
                  <p className="text-sm">Select a business to manage its features</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tenants by name or slug..."
          className="input pl-10"
        />
      </div>

      {/* Tenant Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-primary-800 text-left">
                <th className="px-4 py-3 font-medium text-gray-400">Business</th>
                <th className="px-4 py-3 font-medium text-gray-400">Plan</th>
                <th className="px-4 py-3 font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 font-medium text-gray-400">Members</th>
                <th className="px-4 py-3 font-medium text-gray-400">Features</th>
                <th className="px-4 py-3 font-medium text-gray-400">Trial Ends</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const enabledCount = countEnabledFeatures(togglesFor(t.id));
                return (
                  <tr key={t.id} className="border-b border-primary-800/50 hover:bg-primary-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-sage to-secondary-600 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-white truncate">{t.name}</p>
                          <p className="text-xs text-gray-500 truncate">{t.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-primary-800 text-gray-300 capitalize">
                        {t.plan?.name || t.plan_tier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                        t.status === 'active' ? 'bg-success-500/15 text-success-400' :
                        t.status === 'suspended' ? 'bg-error-500/15 text-error-400' :
                        'bg-gray-500/15 text-gray-400'
                      }`}>
                        {t.status === 'active' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{t.member_count}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                        enabledCount === FEATURE_LIST.length ? 'bg-success-500/15 text-success-400' : 'bg-warning-500/15 text-warning-400'
                      }`}>
                        {enabledCount}/{FEATURE_LIST.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {t.trial_ends_at ? new Date(t.trial_ends_at).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => manageFeatures(t.id)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors bg-accent-500/10 text-accent-400 hover:bg-accent-500/20"
                        >
                          Features
                        </button>
                        <button
                          onClick={() => toggleTenantStatus(t)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                            t.status === 'active'
                              ? 'bg-error-500/10 text-error-400 hover:bg-error-500/20'
                              : 'bg-success-500/10 text-success-400 hover:bg-success-500/20'
                          }`}
                        >
                          {t.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-gray-500 text-sm">No tenants found</div>
        )}
      </div>
    </div>
  );
}
