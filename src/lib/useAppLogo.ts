import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export function useAppLogo() {
  const { user } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user?.tenant_id) {
        if (mounted) setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('tenant_settings')
        .select('business_name, logo_url, updated_at')
        .eq('tenant_id', user.tenant_id)
        .maybeSingle();
      if (mounted) {
        const settings = data as { business_name: string | null; logo_url: string | null; updated_at: string | null } | null;
        const url = settings?.logo_url ?? null;
        setLogoUrl(url ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(settings?.updated_at ?? Date.now().toString())}` : null);
        setCompanyName(settings?.business_name?.trim() || null);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [user?.tenant_id]);

  return { logoUrl, companyName, loading };
}
