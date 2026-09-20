import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Search, Filter } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useFilters } from '@/lib/useFilters';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { PageSkeleton } from '@/components/LoadingSpinner';
import type { AuditLog } from '@/lib/supabase';

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  login: 'Login',
  logout: 'Logout',
  export: 'Exported',
  invite: 'Invited',
  remove: 'Removed',
  upgrade: 'Upgraded',
  downgrade: 'Downgraded',
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters<{ dateFrom: string; dateTo: string; action: string }>({ dateFrom: '', dateTo: '', action: 'all' });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (applied.dateFrom) query = query.gte('created_at', applied.dateFrom);
    if (applied.dateTo) query = query.lte('created_at', applied.dateTo + 'T23:59:59');
    if (applied.action !== 'all') query = query.eq('action', applied.action);
    const { data } = await query;
    setLogs((data || []) as AuditLog[]);
    setLoading(false);
  }, [applied.dateFrom, applied.dateTo, applied.action]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-accent-400" />
          Audit Logs
        </h1>
        <p className="text-sm text-gray-500 mt-1">Compliance trail of all significant actions in your workspace</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-gray-500" />
        <input type="date" value={draft.dateFrom} onChange={(e) => setDraftValue('dateFrom', e.target.value)} className="input text-sm w-auto" />
        <span className="text-gray-600 text-sm">to</span>
        <input type="date" value={draft.dateTo} onChange={(e) => setDraftValue('dateTo', e.target.value)} className="input text-sm w-auto" />
        <select value={draft.action} onChange={(e) => setDraftValue('action', e.target.value)} className="select text-sm">
          <option value="all">All Actions</option>
          {Object.keys(ACTION_LABELS).map((k) => <option key={k} value={k}>{ACTION_LABELS[k]}</option>)}
        </select>
        {hasChanges && <button onClick={apply} className="btn-primary text-sm">Apply</button>}
        {(draft.dateFrom || draft.dateTo || draft.action !== 'all') && <button onClick={clear} className="btn-ghost text-sm">Clear</button>}
      </div>

      {logs.length === 0 ? (
        <EmptyState message="No audit logs found" subMessage="Actions performed by your team will appear here for compliance tracking" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-800 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-800/50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-primary-900/30 transition-colors">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-white font-medium">{log.user_name || 'System'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={log.action === 'delete' ? 'error' : log.action === 'create' ? 'success' : 'info'}>
                        {ACTION_LABELS[log.action] || log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-300 capitalize">{log.entity_type?.replace(/_/g, ' ') || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                      {log.details ? JSON.stringify(log.details).slice(0, 80) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
