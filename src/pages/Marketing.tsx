import { useEffect, useState, useMemo } from 'react';
import { Megaphone, TrendingUp, Trophy, Users, DollarSign, CheckCircle2, Clock, Calendar, ChevronDown, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logActivity } from '@/lib/activity';
import { formatAED, formatDate, formatNumber } from '@/lib/utils';
import { getCommissionForProfit, formatEGP, COMMISSION_BRACKETS } from '@/lib/commission';
import StatCard from '@/components/StatCard';
import { PageSkeleton } from '@/components/LoadingSpinner';
import Modal from '@/components/Modal';
import { toast } from '@/components/Toast';
import { useFilters } from '@/lib/useFilters';
import type { Sale, Lead, SaleExpense, CommissionPayment, Profile } from '@/lib/supabase';

type DateRange = 'monthly' | 'quarterly' | 'custom';

export default function Marketing() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [saleExpenses, setSaleExpenses] = useState<SaleExpense[]>([]);
  const [commissionPayments, setCommissionPayments] = useState<CommissionPayment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters<{
    dateFrom: string; dateTo: string; range: DateRange;
  }>({ dateFrom: '', dateTo: '', range: 'monthly' });
  const [markPaidMonth, setMarkPaidMonth] = useState<{ month: string; netProfit: number; commission: number } | null>(null);
  const [paidNotes, setPaidNotes] = useState('');
  const [paying, setPaying] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [salesRes, leadsRes, expRes, commRes, profilesRes] = await Promise.all([
      supabase.from('sales').select('*').order('date', { ascending: false }),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('sale_expenses').select('*'),
      supabase.from('commission_payments').select(`*, paid_by_profile:profiles!commission_payments_paid_by_fkey(name)`).order('period_month', { ascending: false }),
      supabase.from('profiles').select('*').order('name'),
    ]);
    setSales((salesRes.data || []) as Sale[]);
    setLeads((leadsRes.data || []) as Lead[]);
    setSaleExpenses((expRes.data || []) as SaleExpense[]);
    setCommissionPayments((commRes.data || []) as CommissionPayment[]);
    setProfiles((profilesRes.data || []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const { periodStart, periodEnd, periodLabel } = useMemo(() => {
    const now = new Date();
    if (applied.dateFrom || applied.dateTo) {
      const start = applied.dateFrom ? new Date(applied.dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
      const end = applied.dateTo ? new Date(applied.dateTo + 'T23:59:59') : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { periodStart: start, periodEnd: end, periodLabel: `${start.toLocaleDateString('en-GB')} – ${end.toLocaleDateString('en-GB')}` };
    }
    if (applied.range === 'monthly') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { periodStart: start, periodEnd: end, periodLabel: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
    }
    if (applied.range === 'quarterly') {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      const end = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
      return { periodStart: start, periodEnd: end, periodLabel: `Q${q + 1} ${now.getFullYear()}` };
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { periodStart: start, periodEnd: end, periodLabel: 'Custom Range' };
  }, [applied.dateFrom, applied.dateTo, applied.range]);

  const stats = useMemo(() => {
    const inRange = (d: string) => {
      const date = new Date(d);
      return date >= periodStart && date <= periodEnd;
    };

    const mktSales = sales.filter((s) => s.sale_source === 'new_client_marketing' && inRange(s.date));
    const mktRevenue = mktSales.reduce((sum, s) => sum + (s.amount || 0), 0);
    const mktSaleIds = new Set(mktSales.map((s) => s.id));
    const mktSaleExpenses = saleExpenses.filter((e) => mktSaleIds.has(e.sale_id)).reduce((sum, e) => sum + (e.amount || 0), 0);
    const mktSaleDirectCosts = mktSales.reduce((sum, s) => sum + (s.puppy_cost || 0) + (s.delivery_cost || 0) + (s.vat_amount || 0), 0);
    const mktOpEx = mktSaleExpenses + mktSaleDirectCosts;
    const mktNetProfit = mktRevenue - mktOpEx;
    const mktLeads = leads.filter((l) => inRange(l.created_at)).length;
    const closedFromMkt = mktSales.length;
    const commission = getCommissionForProfit(mktNetProfit);

    return { mktRevenue, mktNetProfit, mktLeads, closedFromMkt, commission };
  }, [sales, leads, saleExpenses, periodStart, periodEnd]);

  const monthlyHistory = useMemo(() => {
    const map = new Map<string, { netProfit: number; commission: number }>();
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().split('T')[0];
      const monthStart = d;
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const mktSales = sales.filter((s) => {
        if (s.sale_source !== 'new_client_marketing') return false;
        const sd = new Date(s.date);
        return sd >= monthStart && sd <= monthEnd;
      });
      const rev = mktSales.reduce((sum, s) => sum + (s.amount || 0), 0);
      const ids = new Set(mktSales.map((s) => s.id));
      const saleEx = saleExpenses.filter((e) => ids.has(e.sale_id)).reduce((sum, e) => sum + (e.amount || 0), 0);
      const saleDirectCosts = mktSales.reduce((sum, s) => sum + (s.puppy_cost || 0) + (s.delivery_cost || 0) + (s.vat_amount || 0), 0);
      const opEx = saleEx + saleDirectCosts;
      const np = rev - opEx;
      const comm = getCommissionForProfit(np);
      map.set(key, { netProfit: np, commission: comm.commission });
    }
    return Array.from(map.entries()).map(([month, data]) => ({
      month,
      netProfit: data.netProfit,
      commission: data.commission,
    }));
  }, [sales, saleExpenses]);

  const paidMonths = useMemo(() => new Set(commissionPayments.map((p) => p.period_month)), [commissionPayments]);

  const handleMarkPaid = async () => {
    if (!markPaidMonth) return;
    setPaying(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('commission_payments').insert({
      period_month: markPaidMonth.month,
      net_profit_aed: markPaidMonth.netProfit,
      commission_egp: markPaidMonth.commission,
      paid_by: userData.user?.id || null,
      notes: paidNotes || null,
    });
    setPaying(false);
    if (error) {
      if (error.code === '23505') {
        toast('error', 'Commission for this month is already marked as paid');
      } else {
        toast('error', 'Failed to mark commission as paid');
      }
      return;
    }
    await logActivity('marked commission paid', `${formatEGP(markPaidMonth.commission)} for ${new Date(markPaidMonth.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`, markPaidMonth.month);
    toast('success', 'Commission marked as paid');
    setMarkPaidMonth(null);
    setPaidNotes('');
    fetchData();
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Marketing Performance</h1>
          <p className="text-sm text-gray-500 mt-1">Track marketing-sourced revenue and commission</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input type="date" value={draft.dateFrom} onChange={(e) => setDraftValue('dateFrom', e.target.value)} className="input text-sm w-auto" />
          <span className="text-gray-600 text-sm">to</span>
          <input type="date" value={draft.dateTo} onChange={(e) => setDraftValue('dateTo', e.target.value)} className="input text-sm w-auto" />
          <select value={draft.range} onChange={(e) => setDraftValue('range', e.target.value as DateRange)} className="select text-sm">
            <option value="monthly">This Month</option>
            <option value="quarterly">This Quarter</option>
          </select>
          {hasChanges && (
            <button onClick={apply} className="btn-primary text-sm"><Check className="w-4 h-4" /> Apply</button>
          )}
          {(draft.dateFrom || draft.dateTo) && (
            <button onClick={clear} className="btn-ghost text-sm"><X className="w-4 h-4" /> Clear</button>
          )}
        </div>
      </div>

      {/* Period stat cards */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">{periodLabel}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Marketing Leads" value={formatNumber(stats.mktLeads)} icon={<Users className="w-5 h-5" />} accent="blue" />
          <StatCard label="Sales Closed" value={formatNumber(stats.closedFromMkt)} icon={<CheckCircle2 className="w-5 h-5" />} accent="green" />
          <StatCard label="Marketing Revenue" value={formatAED(stats.mktRevenue)} icon={<DollarSign className="w-5 h-5" />} accent="teal" />
          <StatCard label="Marketing Net Profit" value={formatAED(stats.mktNetProfit)} icon={<TrendingUp className="w-5 h-5" />} accent={stats.mktNetProfit >= 0 ? 'green' : 'red'} />
        </div>
      </div>

      {/* Commission flash card */}
      <div className="card p-5 border-accent-500/20 bg-gradient-to-br from-accent-500/5 to-transparent">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-accent-400" />
          <h2 className="text-lg font-semibold text-white">Commission Earned — {periodLabel}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Net Profit (AED)</p>
            <p className="text-2xl font-bold text-white mt-1">{formatAED(stats.mktNetProfit)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Commission (EGP)</p>
            <p className="text-2xl font-bold text-accent-400 mt-1">{formatEGP(stats.commission.commission)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Bracket</p>
            <p className="text-sm font-medium text-gray-300 mt-1">{stats.commission.bracketLabel}</p>
          </div>
        </div>
        {stats.commission.nextBracket ? (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>Progress to {formatEGP(stats.commission.nextBracket.commission)}</span>
              <span>{Math.round(stats.commission.progressToNext)}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-primary-800 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-accent-500 to-secondary-400 transition-all duration-500" style={{ width: `${stats.commission.progressToNext}%` }} />
            </div>
            <p className="text-xs text-gray-600 mt-1.5">
              {formatAED(Math.max(stats.commission.nextBracket.threshold - stats.mktNetProfit, 0))} more to reach next bracket
            </p>
          </div>
        ) : (
          <p className="text-sm text-success-400 font-medium">Top bracket reached!</p>
        )}
      </div>

      {/* Commission bracket table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-primary-800">
          <h2 className="text-base font-semibold text-white flex items-center gap-2"><Trophy className="w-4 h-4 text-accent-400" /> Commission Brackets</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                <th className="px-4 py-3 font-medium">Net Profit (AED)</th>
                <th className="px-4 py-3 font-medium">Commission (EGP)</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {COMMISSION_BRACKETS.map((b) => {
                const reached = stats.mktNetProfit >= b.threshold;
                return (
                  <tr key={b.threshold} className="table-row">
                    <td className="px-4 py-3 text-sm text-gray-300">{b.label}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{formatEGP(b.commission)}</td>
                    <td className="px-4 py-3">
                      {reached ? (
                        <span className="badge bg-success-500/15 text-success-400"><CheckCircle2 className="w-3 h-3" /> Reached</span>
                      ) : (
                        <span className="badge bg-primary-800 text-gray-500"><Clock className="w-3 h-3" /> Pending</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Commission history by month */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-primary-800">
          <h2 className="text-base font-semibold text-white flex items-center gap-2"><Clock className="w-4 h-4 text-accent-400" /> Commission History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                <th className="px-4 py-3 font-medium">Month</th>
                <th className="px-4 py-3 font-medium">Net Profit (AED)</th>
                <th className="px-4 py-3 font-medium">Commission (EGP)</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Paid By</th>
                <th className="px-4 py-3 font-medium">Paid At</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {monthlyHistory.map((row) => {
                const monthKey = row.month;
                const payment = commissionPayments.find((p) => p.period_month === monthKey);
                const isPaid = !!payment;
                return (
                  <tr key={monthKey} className="table-row">
                    <td className="px-4 py-3 text-sm text-white font-medium">
                      {new Date(monthKey).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{formatAED(row.netProfit)}</td>
                    <td className="px-4 py-3 text-sm text-accent-400 font-medium">{formatEGP(row.commission)}</td>
                    <td className="px-4 py-3">
                      {isPaid ? (
                        <span className="badge bg-success-500/15 text-success-400"><CheckCircle2 className="w-3 h-3" /> Paid</span>
                      ) : (
                        <span className="badge bg-warning-500/15 text-warning-400"><Clock className="w-3 h-3" /> Unpaid</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{payment?.paid_by_profile?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{payment ? formatDate(payment.paid_at) : '—'}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        {!isPaid && row.netProfit > 0 ? (
                          <button
                            onClick={() => setMarkPaidMonth({ month: monthKey, netProfit: row.netProfit, commission: row.commission })}
                            className="btn-primary text-xs px-3 py-1.5"
                          >
                            Mark Paid
                          </button>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment log */}
      {commissionPayments.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-primary-800">
            <h2 className="text-base font-semibold text-white flex items-center gap-2"><DollarSign className="w-4 h-4 text-accent-400" /> Payment Log</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-4 py-3 font-medium">Net Profit (AED)</th>
                  <th className="px-4 py-3 font-medium">Commission (EGP)</th>
                  <th className="px-4 py-3 font-medium">Paid By</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {commissionPayments.map((p) => (
                  <tr key={p.id} className="table-row">
                    <td className="px-4 py-3 text-sm text-white font-medium">
                      {new Date(p.period_month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{formatAED(p.net_profit_aed)}</td>
                    <td className="px-4 py-3 text-sm text-accent-400 font-medium">{formatEGP(p.commission_egp)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{p.paid_by_profile?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(p.paid_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{p.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      <Modal open={!!markPaidMonth} onClose={() => { setMarkPaidMonth(null); setPaidNotes(''); }} title="Mark Commission as Paid" size="md">
        {markPaidMonth && (
          <div className="space-y-4">
            <div className="card p-4 bg-primary-950/50 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Month:</span><span className="text-white font-medium">{new Date(markPaidMonth.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Net Profit:</span><span className="text-white">{formatAED(markPaidMonth.netProfit)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Commission:</span><span className="text-accent-400 font-medium">{formatEGP(markPaidMonth.commission)}</span></div>
              <div className="flex justify-between text-sm pt-2 border-t border-primary-800"><span className="text-gray-500">Paid by:</span><span className="text-white">{user?.name || '—'}</span></div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Notes (optional)</label>
              <textarea value={paidNotes} onChange={(e) => setPaidNotes(e.target.value)} className="input min-h-[80px]" placeholder="Payment reference, method, etc." />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => { setMarkPaidMonth(null); setPaidNotes(''); }} className="btn-ghost">Cancel</button>
              <button type="button" onClick={handleMarkPaid} disabled={paying} className="btn-primary">
                {paying ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm Payment
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
