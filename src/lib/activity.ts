import { supabase } from './supabase';
import type { ActivityLog } from './supabase';

export async function logActivity(
  action: string,
  target?: string,
  targetId?: string,
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();

    await supabase.from('activity_logs').insert({
      user_id: user.id,
      user_name: profile?.name || user.email || 'Unknown',
      action,
      target: target || null,
      target_id: targetId || null,
      ip_address: null,
    });
  } catch {
    // Silently fail — activity logging should not break the main operation
  }
}

export async function fetchActivityLogs(limit = 100): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select(`
      *,
      user_profile:profiles!activity_logs_user_id_fkey(*)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as ActivityLog[];
}

export async function fetchRecentActivity(limit = 10): Promise<ActivityLog[]> {
  return fetchActivityLogs(limit);
}
