import { useEffect, useState, useMemo } from 'react';
import { Mail, Search, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/utils';
import Badge from '@/components/Badge';
import { TableSkeleton } from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import type { EmailLog } from '@/lib/supabase';
import { Check, X } from 'lucide-react';
import { useFilters } from '@/lib/useFilters';

export default function EmailLogs() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters({
    dateFrom: '', dateTo: '', statusFilter: 'all',
  });

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('email_logs')
        .select('*, sent_by_profile:profiles!email_logs_sent_by_fkey(*)')
        .order('sent_at', { ascending: false })
        .limit(200);
      if (!error) setLogs((data || []) as EmailLog[]);
      setLoading(false);
    };
    fetchLogs();
  }, []);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (search) {
        const q = search.toLowerCase();
        if (!l.to_email.toLowerCase().includes(q) && !l.subject.toLowerCase().includes(q)) return false;
      }
      if (applied.dateFrom && l.sent_at < applied.dateFrom) return false;
      if (applied.dateTo && l.sent_at > applied.dateTo + 'T23:59:59') return false;
      if (applied.statusFilter !== 'all' && l.status !== applied.statusFilter) return false;
      return true;
    });
  }, [logs, search, applied]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Mail className="w-6 h-6 text-accent-400" />
          Email Logs
        </h1>
        <p className="text-sm text-gray-500 mt-1">{filtered.length} emails — Full history of all sent emails</p>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by recipient or subject..." className="input pl-10" />
          </div>
          <select value={draft.statusFilter} onChange={(e) => setDraftValue('statusFilter', e.target.value)} className="select text-sm">
            <option value="all">All Status</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
          {hasChanges && (
            <button onClick={apply} className="btn-primary text-sm"><Check className="w-4 h-4" /> Apply</button>
          )}
          {draft.statusFilter !== 'all' && (
            <button onClick={clear} className="btn-ghost text-sm"><X className="w-4 h-4" /> Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No email logs found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                  <th className="px-4 py-3 font-medium">To</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Sent By</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} className="table-row">
                    <td className="px-4 py-3 text-sm text-white">{log.to_email}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{log.subject}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{log.sent_by_profile?.name || 'System'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {log.status === 'sent' ? <CheckCircle2 className="w-4 h-4 text-success-400" /> : <XCircle className="w-4 h-4 text-error-400" />}
                        <Badge variant={log.status === 'sent' ? 'success' : 'error'}>{log.status}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDateTime(log.sent_at)}</td>
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
