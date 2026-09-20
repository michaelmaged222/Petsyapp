import { useState, useEffect } from 'react';
import { CreditCard, Check, Zap, Building2, Crown, AlertCircle, Loader2, Clock } from 'lucide-react';
import { useTenant } from '@/context/TenantContext';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import type { SubscriptionPlan } from '@/lib/supabase';

const PLAN_ICONS: Record<string, typeof Zap> = {
  basic: Zap,
  pro: CreditCard,
  enterprise: Crown,
};

export default function Billing() {
  const { tenant, subscription, plan, trialDaysLeft, isTrialExpired, refresh } = useTenant();
  const { user } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [checkoutLoading, setCheckoutLoading] = useState<number | null>(null);

  useEffect(() => {
    supabase.from('subscription_plans').select('*').order('id', { ascending: true }).then(({ data }) => {
      if (data) setPlans(data as SubscriptionPlan[]);
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') === 'success') {
      toast('success', 'Subscription activated successfully!');
      refresh();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('upgrade') === 'cancelled') {
      toast('error', 'Upgrade was cancelled');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refresh]);

  const handleSelectPlan = async (newPlan: SubscriptionPlan) => {
    if (newPlan.tier === plan?.tier) return;
    if (!tenant) return;

    setCheckoutLoading(newPlan.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast('error', 'Please sign in again');
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan_id: newPlan.id,
          billing_cycle: billingCycle,
          tenant_id: tenant.id,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Checkout failed');
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setCheckoutLoading(null);
    }
  };

  if (!tenant) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CreditCard className="w-7 h-7 text-accent-400" />
          Billing & Subscription
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage your subscription plan and payment method</p>
      </div>

      {/* Trial Banner */}
      {trialDaysLeft !== null && trialDaysLeft > 0 && subscription?.status === 'trialing' && (
        <div className="card p-4 border-accent-500/30 bg-gradient-to-r from-accent-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-accent-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-accent-300">{trialDaysLeft} days left in your free trial</p>
              <p className="text-xs text-gray-400 mt-0.5">Choose a plan below to continue after your trial ends</p>
            </div>
          </div>
        </div>
      )}

      {/* Trial Expired Banner */}
      {isTrialExpired && (
        <div className="card p-4 border-error-500/30 bg-error-500/5">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-error-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-error-300">Your trial has expired</p>
              <p className="text-xs text-gray-400 mt-0.5">Choose a plan below to reactivate your account</p>
            </div>
          </div>
        </div>
      )}

      {/* Current Plan Banner */}
      <div className="card p-5 border-accent-500/20 bg-gradient-to-br from-accent-500/5 to-transparent">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Current Plan</p>
            <p className="text-2xl font-bold text-white mt-1">{plan?.name || 'Professional'}</p>
            <p className="text-sm text-gray-400 mt-1">
              Status: <span className="capitalize text-success-400">{subscription?.status || 'active'}</span>
              {subscription?.current_period_end && ` · Renews ${new Date(subscription.current_period_end).toLocaleDateString('en-GB')}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-gray-500">Monthly Cost</p>
            <p className="text-2xl font-bold text-accent-400 mt-1">
              {plan ? `$${plan.price_monthly.toFixed(2)}` : '$79.00'}
            </p>
          </div>
        </div>
      </div>

      {/* Billing Cycle Toggle */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">Billing cycle:</span>
        <div className="inline-flex rounded-lg border border-primary-800 overflow-hidden">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${billingCycle === 'monthly' ? 'bg-accent-500 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${billingCycle === 'yearly' ? 'bg-accent-500 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Yearly <span className="text-xs text-success-400">Save 17%</span>
          </button>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {plans.map((p) => {
          const Icon = PLAN_ICONS[p.tier] || Zap;
          const isCurrent = p.tier === plan?.tier;
          const price = billingCycle === 'monthly' ? p.price_monthly : p.price_yearly;
          const period = billingCycle === 'monthly' ? '/mo' : '/yr';
          const features = Object.entries(p.features).filter(([, v]) => v === true).map(([k]) => k);
          const isLoading = checkoutLoading === p.id;

          return (
            <div
              key={p.id}
              className={`card p-6 relative ${isCurrent ? 'border-accent-400 border-2' : ''}`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Current Plan
                </div>
              )}
              <div className="flex items-center gap-2 mb-3">
                <Icon className="w-5 h-5 text-accent-400" />
                <h3 className="text-lg font-bold text-white">{p.name}</h3>
              </div>
              <p className="text-3xl font-bold text-white">
                ${price.toFixed(2)}
                <span className="text-sm font-normal text-gray-500">{period}</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Up to {p.max_employees === 999 ? 'unlimited' : p.max_employees} team members
              </p>
              <ul className="space-y-2 mt-4">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-success-400 shrink-0" />
                    <span className="capitalize">{f.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSelectPlan(p)}
                disabled={isCurrent || isLoading}
                className={`w-full mt-5 text-sm py-2.5 rounded-lg font-medium transition-colors ${
                  isCurrent
                    ? 'bg-primary-800 text-gray-500 cursor-default'
                    : 'btn-primary'
                }`}
              >
                {isCurrent ? 'Current Plan' : isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Redirecting...
                  </span>
                ) : `Switch to ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Enterprise API Access */}
      {plan?.tier === 'enterprise' && tenant.api_key && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-5 h-5 text-accent-400" />
            <h3 className="text-lg font-bold text-white">API Access</h3>
          </div>
          <p className="text-sm text-gray-400 mb-3">Use this API key to authenticate REST API requests to your data.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-primary-950 border border-primary-800 text-sm text-gray-300 font-mono overflow-x-auto">
              {tenant.api_key}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(tenant.api_key || '');
                toast('success', 'API key copied');
              }}
              className="btn-secondary text-sm shrink-0"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Base URL: <code className="text-gray-400">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-v1</code>
          </p>
        </div>
      )}
    </div>
  );
}
