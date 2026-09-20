import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Trash2, Receipt, Home, Stethoscope, Megaphone, FileText, CreditCard, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logActivity } from '@/lib/activity';
import { formatAED, formatDate, exportToCSV } from '@/lib/utils';
import Modal from '@/components/Modal';
import StatCard from '@/components/StatCard';
import { TableSkeleton } from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import type { Expense } from '@/lib/supabase';
import { Check, X } from 'lucide-react';
import { useFilters } from '@/lib/useFilters';

const CATEGORY_ICONS: Record<string, typeof Receipt> = {
  rent: Home, bills: FileText, vet: Stethoscope, subscriptions: CreditCard,
  marketing: Megaphone, misc: Package,
};

const CATEGORY_LABELS: Record<string, string> = {
  rent: 'Rent', bills: 'Bills', vet: 'Vet', subscriptions: 'Subscriptions',
  marketing: 'Marketing', misc: 'Misc',
};

const CATEGORIES = ['rent', 'bills', 'vet', 'subscriptions', 'marketing', 'misc'];

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  operating: 'Operating Cost',
  business: 'Business Expense',
};

const EXPENSE_TYPES = ['operating', 'business'] as const;

export default function Expenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters({
    dateFrom: '', dateTo: '', categoryFilter: 'all',
  });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category: 'rent', expense_type: 'business' as 'operating' | 'business', description: '', amount: '0', date: new Date().toISOString().split('T')[0] });

  const fetchData = async () => {
    setLoading(true);
    const [expRes, empRes] = await Promise.all([
      supabase.from('expenses').select('*, added_by_profile:profiles!expenses_added_by_fkey(*)').order('date', { ascending: false }),
      supabase.from('profiles').select('*').order('name'),
    ]);
    setExpenses((expRes.data || []) as Expense[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (search && !e.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (applied.dateFrom && e.date < applied.dateFrom) return false;
      if (applied.dateTo && e.date > applied.dateTo) return false;
      if (applied.categoryFilter !== 'all' && e.category !== applied.categoryFilter) return false;
      return true;
    });
  }, [expenses, search, applied]);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    CATEGORIES.forEach((cat) => { totals[cat] = 0; });
    filtered.forEach((e) => { totals[e.category] = (totals[e.category] || 0) + (e.amount || 0); });
    return totals;
  }, [filtered]);

  const totalExpenses = useMemo(() => filtered.reduce((sum, e) => sum + (e.amount || 0), 0), [filtered]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.from('expenses').insert({
      category: form.category,
      expense_type: form.expense_type,
      description: form.description,
      amount: parseFloat(form.amount) || 0,
      date: form.date,
      added_by: user?.id,
    }).select().single();
    if (error) { toast('error', 'Failed to add expense'); return; }
    await logActivity('added expense', `${CATEGORY_LABELS[form.category] || form.category}: ${form.description}`, (data as Expense).id);
    toast('success', 'Expense added successfully');
    setShowAdd(false);
    setForm({ category: 'rent', expense_type: 'business', description: '', amount: '0', date: new Date().toISOString().split('T')[0] });
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) { toast('error', 'Failed to delete expense'); return; }
    toast('success', 'Expense deleted');
    fetchData();
  };

  const handleExport = () => {
    exportToCSV('puppyfy-expenses.csv', filtered.map((e) => ({
      ExpenseID: e.id.slice(0, 8), Category: CATEGORY_LABELS[e.category] || e.category, Description: e.description,
      Amount: e.amount, Date: formatDate(e.date), AddedBy: e.added_by_profile?.name || '—',
    })));
    toast('success', 'Expenses exported to CSV');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Expenses</h1>
          <p className="text-sm text-gray-500 mt-1">Total: {formatAED(totalExpenses)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleExport} className="btn-secondary">Export CSV</button>
          <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add New Expense</button>
        </div>
      </div>

      {/* Category summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          return (
            <StatCard
              key={cat}
              label={CATEGORY_LABELS[cat]}
              value={formatAED(categoryTotals[cat] || 0)}
              icon={<Icon className="w-5 h-5" />}
              accent={cat === 'rent' ? 'amber' : cat === 'bills' ? 'blue' : cat === 'vet' ? 'green' : cat === 'subscriptions' ? 'teal' : cat === 'marketing' ? 'teal' : 'green'}
            />
          );
        })}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description..." className="input pl-10" />
          </div>
          <input type="date" value={draft.dateFrom} onChange={(e) => setDraftValue('dateFrom', e.target.value)} className="input text-sm w-auto" />
          <input type="date" value={draft.dateTo} onChange={(e) => setDraftValue('dateTo', e.target.value)} className="input text-sm w-auto" />
          <select value={draft.categoryFilter} onChange={(e) => setDraftValue('categoryFilter', e.target.value)} className="select text-sm">
            <option value="all">All Categories</option>
            {CATEGORIES.map((cat) => <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>)}
          </select>
          {hasChanges && (
            <button onClick={apply} className="btn-primary text-sm"><Check className="w-4 h-4" /> Apply</button>
          )}
          {(draft.dateFrom || draft.dateTo || draft.categoryFilter !== 'all') && (
            <button onClick={clear} className="btn-ghost text-sm"><X className="w-4 h-4" /> Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No expenses found" subMessage="Add a new expense to get started" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                  <th className="px-4 py-3 font-medium">Expense ID</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Added By</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((expense) => {
                  const Icon = CATEGORY_ICONS[expense.category] || Package;
                  return (
                    <tr key={expense.id} className="table-row">
                      <td className="px-4 py-3 text-sm text-gray-500 font-mono">{expense.id.slice(0, 8)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-300">{CATEGORY_LABELS[expense.category] || expense.category}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${expense.expense_type === 'operating' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {EXPENSE_TYPE_LABELS[expense.expense_type] || expense.expense_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white">{expense.description}</td>
                      <td className="px-4 py-3 text-sm text-white font-medium">{formatAED(expense.amount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(expense.date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{expense.added_by_profile?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDelete(expense.id)} className="p-1.5 rounded-lg text-gray-500 hover:text-error-400 hover:bg-error-500/10 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Expense" size="md">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Expense Type *</label>
            <select value={form.expense_type} onChange={(e) => setForm({ ...form, expense_type: e.target.value as 'operating' | 'business' })} className="select">
              {EXPENSE_TYPES.map((t) => <option key={t} value={t}>{EXPENSE_TYPE_LABELS[t]}</option>)}
            </select>
            <p className="text-xs text-gray-600 mt-1.5">
              {form.expense_type === 'operating'
                ? 'Deducted in Tier 2 (Net Profit): VAT, puppy cost, delivery cost'
                : 'Deducted in Tier 3 (Shareholder Dividends): marketing, bills, salaries, subscriptions'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Category *</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="select">
              {CATEGORIES.map((cat) => <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Description *</label>
            <input type="text" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" placeholder="Expense description" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Amount (AED) *</label>
            <input type="number" required min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary"><Plus className="w-4 h-4" /> Add Expense</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
