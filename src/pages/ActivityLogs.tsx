import { useEffect, useState, useMemo } from 'react';
import { Search, ScrollText, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/utils';
import Badge from '@/components/Badge';
import { TableSkeleton } from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import type { ActivityLog } from '@/lib/supabase';
import { Check, X } from 'lucide-react';
import { useFilters } from '@/lib/useFilters';

export default function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters({
    actionFilter: 'all', dateFrom: '', dateTo: '',
  });

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*, user_profile:profiles!activity_logs_user_id_fkey(*)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (!error) setLogs((data || []) as ActivityLog[]);
      setLoading(false);
    };
    fetchLogs();
  }, []);

  const actionTypes = useMemo(() => {
    const types = new Set<string>();
    logs.forEach((l) => types.add(l.action));
    return Array.from(types).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (search) {
        const q = search.toLowerCase();
        if (!l.user_name?.toLowerCase().includes(q) && !l.action.toLowerCase().includes(q) && !l.target?.toLowerCase().includes(q)) return false;
      }
      if (applied.actionFilter !== 'all' && l.action !== applied.actionFilter) return false;
      if (applied.dateFrom && l.created_at < applied.dateFrom) return false;
      if (applied.dateTo && l.created_at > applied.dateTo + 'T23:59:59') return false;
      return true;
    });
  }, [logs, search, applied]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ScrollText className="w-6 h-6 text-accent-400" />
          Activity Log
        </h1>
        <p className="text-sm text-gray-500 mt-1">{filtered.length} entries — Full audit trail of all system actions</p>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by user, action, or target..." className="input pl-10" />
          </div>
          <select value={draft.actionFilter} onChange={(e) => setDraftValue('actionFilter', e.target.value)} className="select text-sm">
            <option value="all">All Actions</option>
            {actionTypes.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="date" value={draft.dateFrom} onChange={(e) => setDraftValue('dateFrom', e.target.value)} className="input text-sm w-auto" />
          <input type="date" value={draft.dateTo} onChange={(e) => setDraftValue('dateTo', e.target.value)} className="input text-sm w-auto" />
          {hasChanges && (
            <button onClick={apply} className="btn-primary text-sm"><Check className="w-4 h-4" /> Apply</button>
          )}
          {(draft.actionFilter !== 'all' || draft.dateFrom || draft.dateTo) && (
            <button onClick={clear} className="btn-ghost text-sm"><X className="w-4 h-4" /> Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No activity logs found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">IP Address</th>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} className="table-row">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-accent-500/15 flex items-center justify-center text-accent-400 text-xs font-semibold shrink-0">
                          {log.user_name?.charAt(0).toUpperCase() || <User className="w-3 h-3" />}
                        </div>
                        <span className="text-sm text-white font-medium">{log.user_name || 'System'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge variant="info">{log.action}</Badge></td>
                    <td className="px-4 py-3 text-sm text-gray-400">{log.target || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{log.ip_address || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDateTime(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
