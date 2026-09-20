import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_FEATURE_TOGGLES } from '@/lib/features';

export interface FeatureToggles {
  showings_enabled: boolean;
  pipeline_enabled: boolean;
  invoices_enabled: boolean;
  inventory_enabled: boolean;
  custom_fields_enabled: boolean;
  marketing_enabled: boolean;
  expenses_enabled: boolean;
  calendar_enabled: boolean;
  activity_log_enabled: boolean;
  email_logs_enabled: boolean;
}

export type FeatureTogglesRow = FeatureToggles & { tenant_id: string };

/**
 * Reads and updates the feature switches for a business.
 *
 * Defaults to the signed-in user's own business. A platform admin can pass an
 * explicit `tenantId` to manage another business's switches from the Platform
 * Admin screen.
 */
export function useFeatureToggles(tenantIdOverride?: string) {
  const { user } = useAuth();
  const tenantId = tenantIdOverride ?? user?.tenant_id ?? null;

  const [toggles, setToggles] = useState<FeatureToggles>({ ...DEFAULT_FEATURE_TOGGLES });
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setLoaded(true);
      return;
    }
    const { data, error } = await supabase
      .from('feature_toggles')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) {
      setLoaded(true);
      return;
    }
    setToggles(data ? (data as FeatureToggles) : { ...DEFAULT_FEATURE_TOGGLES });
    setLoaded(true);
  }, [tenantId]);

  useEffect(() => {
    setLoaded(false);
    refresh();
  }, [refresh]);

  const updateToggle = useCallback(async (key: keyof FeatureToggles, value: boolean) => {
    setToggles((prev) => ({ ...prev, [key]: value }));
    if (!tenantId) return false;
    const { error } = await supabase
      .from('feature_toggles')
      .update({ [key]: value, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);
    if (error) {
      setToggles((prev) => ({ ...prev, [key]: !value }));
      return false;
    }
    return true;
  }, [tenantId]);

  return { toggles, loaded, updateToggle, refresh };
}
