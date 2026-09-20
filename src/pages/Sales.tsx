import { useEffect, useState, useMemo } from 'react';
import { Plus, Download, Search, TrendingUp, TrendingDown, Receipt, Percent, ArrowLeft, CalendarDays, CircleDollarSign, CreditCard, FileText, Pencil, Trash2, UserRound, Wallet, X, Check, AlertCircle, UserPlus, ListChecks } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { formatAED, formatDate, calculateVAT, calculateNetAmount, exportToCSV } from '@/lib/utils';
import Modal from '@/components/Modal';
import StatCard from '@/components/StatCard';
import { TableSkeleton } from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import type { Sale, Client, Profile, SalePayment, SaleExpense, SaleSource } from '@/lib/supabase';
import { SALE_SOURCE_OPTIONS } from '@/lib/commission';
import { useFilters } from '@/lib/useFilters';

export default function Sales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters({
    dateFrom: '', dateTo: '', employeeFilter: 'all', saleTypeFilter: 'all',
  });
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [deletingSale, setDeletingSale] = useState<Sale | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '', id_passport: '' });
  const [savingAdd, setSavingAdd] = useState(false);
  const [form, setForm] = useState({
    client_id: '', breed: '', sale_type: 'local', amount: '0', vat_type: 'on_tax',
    employee_id: '', date: new Date().toISOString().split('T')[0], status: 'pending',
    sale_source: 'direct_walkin' as SaleSource,
    puppy_cost: '0', delivery_cost: '0',
  });
  const [editForm, setEditForm] = useState({
    client_id: '', breed: '', sale_type: 'local', amount: '0', vat_type: 'on_tax',
    employee_id: '', date: new Date().toISOString().split('T')[0], status: 'pending',
    sale_source: 'direct_walkin' as SaleSource,
    puppy_cost: '0', delivery_cost: '0',
  });

  const fetchData = async () => {
    setLoading(true);
    const [salesRes, clientsRes, employeesRes] = await Promise.all([
      supabase.from('sales').select(`*, client:clients!sales_client_id_fkey(*), employee:profiles!sales_employee_id_fkey(*)`).order('date', { ascending: false }),
      supabase.from('clients').select('*').order('name'),
      supabase.from('profiles').select('*').order('name'),
    ]);
    setSales((salesRes.data || []) as Sale[]);
    setClients((clientsRes.data || []) as Client[]);
    setEmployees((employeesRes.data || []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    return sales.filter((sale) => {
      if (search) {
        const clientName = sale.client?.name || '';
        if (!clientName.toLowerCase().includes(search.toLowerCase()) && !sale.breed?.toLowerCase().includes(search.toLowerCase())) return false;
      }
      if (applied.dateFrom && sale.date < applied.dateFrom) return false;
      if (applied.dateTo && sale.date > applied.dateTo) return false;
      if (applied.employeeFilter !== 'all' && sale.employee_id !== applied.employeeFilter) return false;
      if (applied.saleTypeFilter !== 'all' && sale.sale_type !== applied.saleTypeFilter) return false;
      return true;
    });
  }, [sales, search, applied]);

  const summary = useMemo(() => {
    const completed = filtered.filter((s) => s.status === 'completed');
    const totalRevenue = completed.reduce((sum, s) => sum + (s.amount || 0), 0);
    const totalVAT = completed.reduce((sum, s) => sum + (s.vat_amount || 0), 0);
    const totalNet = completed.reduce((sum, s) => sum + (s.net_amount || 0), 0);
    return { totalRevenue, totalVAT, totalNet, count: completed.length };
  }, [filtered]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAdd(true);
    const amount = parseFloat(form.amount) || 0;
    const vatAmount = calculateVAT(amount, form.vat_type as 'on_tax' | 'off_tax');
    const netAmount = calculateNetAmount(amount, form.vat_type as 'on_tax' | 'off_tax');

    const puppyCost = parseFloat(form.puppy_cost) || 0;
    const deliveryCost = parseFloat(form.delivery_cost) || 0;

    let clientId = form.client_id || null;

    if (clientMode === 'new') {
      if (!newClient.name.trim()) {
        toast('error', 'Client name is required');
        setSavingAdd(false);
        return;
      }
      const { data: clientData, error: clientErr } = await supabase.from('clients').insert({
        name: newClient.name.trim(),
        phone: newClient.phone.trim() || null,
        email: newClient.email.trim() || null,
        id_passport: newClient.id_passport.trim() || null,
        breed: form.breed.trim() || null,
        purchase_date: form.date,
        status: 'active',
      }).select().single();
      if (clientErr) {
        toast('error', 'Failed to create client');
        setSavingAdd(false);
        return;
      }
      clientId = (clientData as Client).id;
    }

    const { data, error } = await supabase.from('sales').insert({
      client_id: clientId,
      breed: form.breed,
      sale_type: form.sale_type,
      amount,
      vat_type: form.vat_type,
      vat_amount: vatAmount,
      net_amount: netAmount,
      employee_id: form.employee_id || null,
      date: form.date,
      status: form.status,
      sale_source: form.sale_source,
      puppy_cost: puppyCost,
      delivery_cost: deliveryCost,
    }).select().single();
    setSavingAdd(false);
    if (error) { toast('error', 'Failed to add sale'); return; }
    await logActivity('added sale', `${form.breed} - ${formatAED(amount)}`, (data as Sale).id);
    toast('success', 'Sale added successfully');
    setShowAdd(false);
    setClientMode('existing');
    setNewClient({ name: '', phone: '', email: '', id_passport: '' });
    setForm({ client_id: '', breed: '', sale_type: 'local', amount: '0', vat_type: 'on_tax', employee_id: '', date: new Date().toISOString().split('T')[0], status: 'pending', sale_source: 'direct_walkin' as SaleSource, puppy_cost: '0', delivery_cost: '0' });
    fetchData();
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('sales').update({ status }).eq('id', id);
    if (error) { toast('error', 'Failed to update status'); return; }
    toast('success', 'Sale status updated');
    fetchData();
  };

  const openEdit = (sale: Sale) => {
    setEditingSale(sale);
    setEditForm({
      client_id: sale.client_id || '',
      breed: sale.breed || '',
      sale_type: sale.sale_type,
      amount: String(sale.amount),
      vat_type: sale.vat_type,
      employee_id: sale.employee_id || '',
      date: sale.date,
      status: sale.status,
      sale_source: (sale.sale_source || 'direct_walkin') as SaleSource,
      puppy_cost: String(sale.puppy_cost || 0),
      delivery_cost: String(sale.delivery_cost || 0),
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;
    const amount = parseFloat(editForm.amount) || 0;
    const vatAmount = calculateVAT(amount, editForm.vat_type as 'on_tax' | 'off_tax');
    const netAmount = calculateNetAmount(amount, editForm.vat_type as 'on_tax' | 'off_tax');
    setSavingEdit(true);
    const editPuppyCost = parseFloat(editForm.puppy_cost) || 0;
    const editDeliveryCost = parseFloat(editForm.delivery_cost) || 0;
    const { error } = await supabase.from('sales').update({
      client_id: editForm.client_id || null,
      breed: editForm.breed,
      sale_type: editForm.sale_type,
      amount,
      vat_type: editForm.vat_type,
      vat_amount: vatAmount,
      net_amount: netAmount,
      employee_id: editForm.employee_id || null,
      date: editForm.date,
      status: editForm.status,
      sale_source: editForm.sale_source,
      puppy_cost: editPuppyCost,
      delivery_cost: editDeliveryCost,
    }).eq('id', editingSale.id);
    setSavingEdit(false);
    if (error) { toast('error', 'Failed to update sale'); return; }
    await logActivity('edited sale', `${editForm.breed || 'Sale'} - ${formatAED(amount)}`, editingSale.id);
    toast('success', 'Sale updated successfully');
    setEditingSale(null);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deletingSale) return;
    setDeleting(true);
    const { error: payErr } = await supabase.from('sale_payments').delete().eq('sale_id', deletingSale.id);
    if (payErr) { toast('error', 'Failed to clean up payments'); setDeleting(false); return; }
    const { error: expErr } = await supabase.from('sale_expenses').delete().eq('sale_id', deletingSale.id);
    if (expErr) { toast('error', 'Failed to clean up expenses'); setDeleting(false); return; }
    const { error } = await supabase.from('sales').delete().eq('id', deletingSale.id);
    setDeleting(false);
    if (error) { toast('error', 'Failed to delete sale'); return; }
    await logActivity('deleted sale', `${deletingSale.breed || 'Sale'} - ${formatAED(deletingSale.amount)}`, deletingSale.id);
    toast('success', 'Sale deleted successfully');
    setDeletingSale(null);
    fetchData();
  };

  const handleExport = () => {
    exportToCSV('puppyfy-sales.csv', filtered.map((s) => ({
      SaleID: s.id.slice(0, 8), Client: s.client?.name || '—', Breed: s.breed || '',
      SaleType: s.sale_type, Amount: s.amount, VATType: s.vat_type, VATAmount: s.vat_amount,
      NetAmount: s.net_amount, PuppyCost: s.puppy_cost || 0, DeliveryCost: s.delivery_cost || 0,
      GrossMargin: (s.amount || 0) - (s.puppy_cost || 0) - (s.delivery_cost || 0) - (s.vat_amount || 0),
      Employee: s.employee?.name || '—', Date: formatDate(s.date), Status: s.status,
    })));
    toast('success', 'Sales exported to CSV');
  };

  if (selectedSale) {
    return <SaleTransactionDetail sale={selectedSale} onBack={() => setSelectedSale(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} sales records</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleExport} className="btn-secondary"><Download className="w-4 h-4" /> Export CSV</button>
          <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add New Sale</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={formatAED(summary.totalRevenue)} icon={<TrendingUp className="w-5 h-5" />} accent="green" />
        <StatCard label="Total VAT" value={formatAED(summary.totalVAT)} icon={<Percent className="w-5 h-5" />} accent="blue" />
        <StatCard label="Net Amount" value={formatAED(summary.totalNet)} icon={<Receipt className="w-5 h-5" />} accent="amber" />
        <StatCard label="Completed Sales" value={summary.count} icon={<TrendingUp className="w-5 h-5" />} accent="green" />
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by client or breed..." className="input pl-10" />
          </div>
          <input type="date" value={draft.dateFrom} onChange={(e) => setDraftValue('dateFrom', e.target.value)} className="input text-sm w-auto" />
          <input type="date" value={draft.dateTo} onChange={(e) => setDraftValue('dateTo', e.target.value)} className="input text-sm w-auto" />
          <select value={draft.employeeFilter} onChange={(e) => setDraftValue('employeeFilter', e.target.value)} className="select text-sm">
            <option value="all">All Employees</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
          <select value={draft.saleTypeFilter} onChange={(e) => setDraftValue('saleTypeFilter', e.target.value)} className="select text-sm">
            <option value="all">All Types</option>
            <option value="local">Local</option>
            <option value="imported">Imported</option>
          </select>
          {hasChanges && (
            <button onClick={apply} className="btn-primary text-sm"><Check className="w-4 h-4" /> Apply</button>
          )}
          {(draft.dateFrom || draft.dateTo || draft.employeeFilter !== 'all' || draft.saleTypeFilter !== 'all') && (
            <button onClick={clear} className="btn-ghost text-sm"><X className="w-4 h-4" /> Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No sales found" subMessage="Try adjusting filters or add a new sale" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                  <th className="px-4 py-3 font-medium">Sale ID</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Breed</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">VAT Type</th>
                  <th className="px-4 py-3 font-medium">VAT Amount</th>
                  <th className="px-4 py-3 font-medium">Net Amount</th>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sale) => (
                  <tr key={sale.id} onClick={() => setSelectedSale(sale)} className="table-row cursor-pointer">
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{sale.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{sale.client?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{sale.breed || '—'}</td>
                    <td className="px-4 py-3"><span className="text-xs text-gray-400 capitalize">{sale.sale_type}</span></td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{formatAED(sale.amount)}</td>
                    <td className="px-4 py-3"><span className="text-xs text-gray-400">{sale.vat_type === 'on_tax' ? 'On Tax' : 'Off Tax'}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-400">{formatAED(sale.vat_amount)}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{formatAED(sale.net_amount)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{sale.employee?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(sale.date)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={sale.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateStatus(sale.id, e.target.value)}
                        className="bg-transparent text-xs border-none cursor-pointer focus:outline-none"
                        style={{ color: sale.status === 'completed' ? '#4ade80' : sale.status === 'pending' ? '#facc15' : '#f87171' }}
                      >
                        <option value="pending" className="text-white bg-primary-900">Pending</option>
                        <option value="completed" className="text-white bg-primary-900">Completed</option>
                        <option value="cancelled" className="text-white bg-primary-900">Cancelled</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(sale); }}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-accent-400 hover:bg-accent-500/10 transition-colors"
                          title="Edit sale"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingSale(sale); }}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-error-400 hover:bg-error-500/10 transition-colors"
                          title="Delete sale"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Sale Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Sale" size="lg">
        <form onSubmit={handleAdd} className="space-y-4">
          {/* Client mode toggle */}
          <div className="flex gap-2 p-1 rounded-xl bg-primary-950/60 border border-primary-800">
            <button type="button" onClick={() => setClientMode('existing')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${clientMode === 'existing' ? 'bg-primary-700 text-white' : 'text-gray-400 hover:text-white'}`}>
              <ListChecks className="w-4 h-4" /> Existing Client
            </button>
            <button type="button" onClick={() => setClientMode('new')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${clientMode === 'new' ? 'bg-primary-700 text-white' : 'text-gray-400 hover:text-white'}`}>
              <UserPlus className="w-4 h-4" /> New Client
            </button>
          </div>

          {clientMode === 'existing' ? (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Client</label>
              <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className="select">
                <option value="">Select client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-primary-950/40 border border-primary-800">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Client Name *</label>
                <input type="text" required={clientMode === 'new'} value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} className="input" placeholder="Full name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Phone</label>
                <input type="tel" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} className="input" placeholder="+971 50 123 4567" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Email</label>
                <input type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} className="input" placeholder="client@example.com" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-400 mb-1.5">ID / Passport Number</label>
                <input type="text" value={newClient.id_passport} onChange={(e) => setNewClient({ ...newClient, id_passport: e.target.value })} className="input" placeholder="Optional" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Dog Breed</label>
              <input type="text" value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} className="input" placeholder="e.g. Labrador" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Sale Type</label>
              <select value={form.sale_type} onChange={(e) => setForm({ ...form, sale_type: e.target.value })} className="select">
                <option value="local">Local</option>
                <option value="imported">Imported</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Amount (AED) *</label>
              <input type="number" required min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">VAT Type</label>
              <select value={form.vat_type} onChange={(e) => setForm({ ...form, vat_type: e.target.value })} className="select">
                <option value="on_tax">On Tax (5% VAT included)</option>
                <option value="off_tax">Off Tax (No VAT)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Employee</label>
              <select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} className="select">
                <option value="">Select employee</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="select">
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Sale Source *</label>
              <select value={form.sale_source} onChange={(e) => setForm({ ...form, sale_source: e.target.value as SaleSource })} className="select">
                {SALE_SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Puppy Cost Price (AED)</label>
              <input type="number" min="0" step="0.01" value={form.puppy_cost} onChange={(e) => setForm({ ...form, puppy_cost: e.target.value })} className="input" placeholder="Acquisition cost" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Delivery Cost (AED)</label>
              <input type="number" min="0" step="0.01" value={form.delivery_cost} onChange={(e) => setForm({ ...form, delivery_cost: e.target.value })} className="input" placeholder="0 if not applicable" />
            </div>
          </div>
          {(() => {
            const pc = parseFloat(form.puppy_cost) || 0;
            const dc = parseFloat(form.delivery_cost) || 0;
            const vat = form.vat_type === 'on_tax' ? calculateVAT(parseFloat(form.amount) || 0, 'on_tax') : 0;
            const grossMargin = (parseFloat(form.amount) || 0) - pc - dc - vat;
            return (
              <div className="card p-3 bg-primary-950/50 text-sm space-y-1">
                <div className="flex justify-between text-gray-400"><span>Sale Amount:</span><span>{formatAED(parseFloat(form.amount) || 0)}</span></div>
                {form.vat_type === 'on_tax' && <div className="flex justify-between text-gray-400"><span>VAT (5%):</span><span>{formatAED(vat)}</span></div>}
                <div className="flex justify-between text-gray-400"><span>Puppy Cost:</span><span>{formatAED(pc)}</span></div>
                <div className="flex justify-between text-gray-400"><span>Delivery Cost:</span><span>{formatAED(dc)}</span></div>
                <div className="flex justify-between text-white font-medium pt-1 border-t border-primary-800 mt-1"><span>Gross Margin:</span><span className={grossMargin >= 0 ? 'text-secondary-300' : 'text-error-400'}>{formatAED(grossMargin)}</span></div>
              </div>
            );
          })()}
          {form.vat_type === 'on_tax' && (
            <div className="card p-3 bg-primary-950/50 text-sm">
              <div className="flex justify-between text-gray-400"><span>Amount:</span><span>{formatAED(parseFloat(form.amount) || 0)}</span></div>
              <div className="flex justify-between text-gray-400"><span>VAT (5%):</span><span>{formatAED(calculateVAT(parseFloat(form.amount) || 0, 'on_tax'))}</span></div>
              <div className="flex justify-between text-white font-medium pt-1 border-t border-primary-800 mt-1"><span>Net Amount:</span><span>{formatAED(calculateNetAmount(parseFloat(form.amount) || 0, 'on_tax'))}</span></div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={savingAdd} className="btn-primary">
              {savingAdd ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Sale
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Sale Modal */}
      <Modal open={!!editingSale} onClose={() => setEditingSale(null)} title="Edit Sale" size="lg">
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Client</label>
              <select value={editForm.client_id} onChange={(e) => setEditForm({ ...editForm, client_id: e.target.value })} className="select">
                <option value="">Select client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Dog Breed</label>
              <input type="text" value={editForm.breed} onChange={(e) => setEditForm({ ...editForm, breed: e.target.value })} className="input" placeholder="e.g. Labrador" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Sale Type</label>
              <select value={editForm.sale_type} onChange={(e) => setEditForm({ ...editForm, sale_type: e.target.value })} className="select">
                <option value="local">Local</option>
                <option value="imported">Imported</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Amount (AED) *</label>
              <input type="number" required min="0" step="0.01" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">VAT Type</label>
              <select value={editForm.vat_type} onChange={(e) => setEditForm({ ...editForm, vat_type: e.target.value })} className="select">
                <option value="on_tax">On Tax (5% VAT included)</option>
                <option value="off_tax">Off Tax (No VAT)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Employee</label>
              <select value={editForm.employee_id} onChange={(e) => setEditForm({ ...editForm, employee_id: e.target.value })} className="select">
                <option value="">Select employee</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Date</label>
              <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Status</label>
              <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="select">
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Sale Source</label>
              <select value={editForm.sale_source} onChange={(e) => setEditForm({ ...editForm, sale_source: e.target.value as SaleSource })} className="select">
                {SALE_SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Puppy Cost Price (AED)</label>
              <input type="number" min="0" step="0.01" value={editForm.puppy_cost} onChange={(e) => setEditForm({ ...editForm, puppy_cost: e.target.value })} className="input" placeholder="Acquisition cost" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Delivery Cost (AED)</label>
              <input type="number" min="0" step="0.01" value={editForm.delivery_cost} onChange={(e) => setEditForm({ ...editForm, delivery_cost: e.target.value })} className="input" placeholder="0 if not applicable" />
            </div>
          </div>
          {(() => {
            const pc = parseFloat(editForm.puppy_cost) || 0;
            const dc = parseFloat(editForm.delivery_cost) || 0;
            const vat = editForm.vat_type === 'on_tax' ? calculateVAT(parseFloat(editForm.amount) || 0, 'on_tax') : 0;
            const grossMargin = (parseFloat(editForm.amount) || 0) - pc - dc - vat;
            return (
              <div className="card p-3 bg-primary-950/50 text-sm space-y-1">
                <div className="flex justify-between text-gray-400"><span>Sale Amount:</span><span>{formatAED(parseFloat(editForm.amount) || 0)}</span></div>
                {editForm.vat_type === 'on_tax' && <div className="flex justify-between text-gray-400"><span>VAT (5%):</span><span>{formatAED(vat)}</span></div>}
                <div className="flex justify-between text-gray-400"><span>Puppy Cost:</span><span>{formatAED(pc)}</span></div>
                <div className="flex justify-between text-gray-400"><span>Delivery Cost:</span><span>{formatAED(dc)}</span></div>
                <div className="flex justify-between text-white font-medium pt-1 border-t border-primary-800 mt-1"><span>Gross Margin:</span><span className={grossMargin >= 0 ? 'text-secondary-300' : 'text-error-400'}>{formatAED(grossMargin)}</span></div>
              </div>
            );
          })()}
          {editForm.vat_type === 'on_tax' && (
            <div className="card p-3 bg-primary-950/50 text-sm">
              <div className="flex justify-between text-gray-400"><span>Amount:</span><span>{formatAED(parseFloat(editForm.amount) || 0)}</span></div>
              <div className="flex justify-between text-gray-400"><span>VAT (5%):</span><span>{formatAED(calculateVAT(parseFloat(editForm.amount) || 0, 'on_tax'))}</span></div>
              <div className="flex justify-between text-white font-medium pt-1 border-t border-primary-800 mt-1"><span>Net Amount:</span><span>{formatAED(calculateNetAmount(parseFloat(editForm.amount) || 0, 'on_tax'))}</span></div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditingSale(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={savingEdit} className="btn-primary">
              {savingEdit ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Sale Confirmation */}
      <Modal open={!!deletingSale} onClose={() => setDeletingSale(null)} title="Delete Sale" size="md">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-error-500/10 border border-error-500/20">
            <AlertCircle className="w-5 h-5 text-error-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-white font-medium">Are you sure you want to delete this sale?</p>
              <p className="text-sm text-gray-400 mt-1">
                {deletingSale?.breed || 'Sale'} — {formatAED(deletingSale?.amount || 0)} for {deletingSale?.client?.name || 'Unknown client'}
              </p>
              <p className="text-xs text-gray-500 mt-2">All associated payments and expenses will also be deleted. This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setDeletingSale(null)} className="btn-ghost">Cancel</button>
            <button type="button" onClick={handleDelete} disabled={deleting} className="btn bg-error-500 text-white hover:bg-error-600 active:scale-[0.98] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {deleting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete Sale
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

interface SaleTransactionDetailProps {
  sale: Sale;
  onBack: () => void;
}

function SaleTransactionDetail({ sale, onBack }: SaleTransactionDetailProps) {
  const [payments, setPayments] = useState<SalePayment[]>([]);
  const [expenses, setExpenses] = useState<SaleExpense[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showEditPayment, setShowEditPayment] = useState(false);
  const [editingPayment, setEditingPayment] = useState<SalePayment | null>(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingEditPayment, setSavingEditPayment] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '', method: 'cash' as SalePayment['method'], note: '',
  });
  const [editPaymentForm, setEditPaymentForm] = useState({
    amount: '', method: 'cash' as SalePayment['method'], note: '',
  });
  const [expenseForm, setExpenseForm] = useState({
    category: 'puppy_cost' as SaleExpense['category'], description: '', amount: '', date: new Date().toISOString().split('T')[0], payment_method: 'cash' as SaleExpense['payment_method'],
  });

  const sellingPrice = sale.amount || 0;

  const fetchPaymentsAndExpenses = async () => {
    setLoadingData(true);
    const [payRes, expRes] = await Promise.all([
      supabase.from('sale_payments').select(`*, recorded_by_profile:profiles!sale_payments_recorded_by_fkey(name)`).eq('sale_id', sale.id).order('created_at', { ascending: false }),
      supabase.from('sale_expenses').select(`*, recorded_by_profile:profiles!sale_expenses_recorded_by_fkey(name)`).eq('sale_id', sale.id).order('created_at', { ascending: false }),
    ]);
    setPayments((payRes.data || []) as unknown as SalePayment[]);
    setExpenses((expRes.data || []) as unknown as SaleExpense[]);
    setLoadingData(false);
  };

  useEffect(() => { fetchPaymentsAndExpenses(); }, [sale.id]);

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const remaining = Math.max(sellingPrice - totalPaid, 0);
  const cashRevenue = totalPaid - totalExpenses;
  const isFullyPaid = totalPaid >= sellingPrice && sellingPrice > 0;
  const progress = sellingPrice ? Math.min((totalPaid / sellingPrice) * 100, 100) : 0;

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) { toast('error', 'Enter a valid amount'); return; }
    setSavingPayment(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('sale_payments').insert({
      sale_id: sale.id,
      amount,
      method: paymentForm.method,
      note: paymentForm.note,
      recorded_by: userData.user?.id || null,
    });
    setSavingPayment(false);
    if (error) { toast('error', 'Failed to record payment'); return; }

    if (totalPaid + amount >= sellingPrice && sellingPrice > 0) {
      await supabase.from('sales').update({ status: 'completed' }).eq('id', sale.id);
      sale.status = 'completed';
    }

    await logActivity('recorded payment', `${formatAED(amount)} for sale ${sale.id.slice(0, 8)}`, sale.id);
    toast('success', 'Payment recorded');
    setPaymentForm({ amount: '', method: 'cash', note: '' });
    setShowAddPayment(false);
    fetchPaymentsAndExpenses();
  };

  const handleDeletePayment = async (id: string) => {
    const { error } = await supabase.from('sale_payments').delete().eq('id', id);
    if (error) { toast('error', 'Failed to delete payment'); return; }
    toast('success', 'Payment deleted');
    fetchPaymentsAndExpenses();
  };

  const isVatApplicable = sale.vat_type === 'on_tax';
  const saleVatAmount = calculateVAT(sale.amount || 0, sale.vat_type);

  const handleExpenseCategoryChange = (category: SaleExpense['category']) => {
    if (category === 'vat' && isVatApplicable && saleVatAmount > 0) {
      setExpenseForm({
        ...expenseForm,
        category,
        amount: saleVatAmount.toFixed(2),
        description: `VAT (5%) on sale amount`,
      });
    } else {
      setExpenseForm({ ...expenseForm, category });
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expenseForm.amount);
    if (!amount || amount <= 0) { toast('error', 'Enter a valid amount'); return; }
    if (!expenseForm.description.trim()) { toast('error', 'Description is required'); return; }
    setSavingExpense(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('sale_expenses').insert({
      sale_id: sale.id,
      category: expenseForm.category,
      description: expenseForm.description,
      amount,
      date: expenseForm.date,
      payment_method: expenseForm.payment_method,
      recorded_by: userData.user?.id || null,
    });
    setSavingExpense(false);
    if (error) { toast('error', 'Failed to record expense'); return; }
    await logActivity('recorded sale expense', `${formatAED(amount)} — ${expenseForm.description}`, sale.id);
    toast('success', 'Expense recorded');
    setExpenseForm({ category: 'puppy_cost', description: '', amount: '', date: new Date().toISOString().split('T')[0], payment_method: 'cash' });
    setShowAddExpense(false);
    fetchPaymentsAndExpenses();
  };

  const handleDeleteExpense = async (id: string) => {
    const { error } = await supabase.from('sale_expenses').delete().eq('id', id);
    if (error) { toast('error', 'Failed to delete expense'); return; }
    toast('success', 'Expense deleted');
    fetchPaymentsAndExpenses();
  };

  const openEditPayment = (payment: SalePayment) => {
    setEditingPayment(payment);
    setEditPaymentForm({
      amount: String(payment.amount),
      method: payment.method,
      note: payment.note || '',
    });
    setShowEditPayment(true);
  };

  const handleEditPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;
    const amount = parseFloat(editPaymentForm.amount);
    if (!amount || amount <= 0) { toast('error', 'Enter a valid amount'); return; }
    setSavingEditPayment(true);
    const { error } = await supabase.from('sale_payments').update({
      amount,
      method: editPaymentForm.method,
      note: editPaymentForm.note,
    }).eq('id', editingPayment.id);
    setSavingEditPayment(false);
    if (error) { toast('error', 'Failed to update payment'); return; }

    const newTotal = totalPaid - editingPayment.amount + amount;
    if (newTotal >= sellingPrice && sellingPrice > 0) {
      await supabase.from('sales').update({ status: 'completed' }).eq('id', sale.id);
      sale.status = 'completed';
    }

    await logActivity('edited payment', `${formatAED(amount)} for sale ${sale.id.slice(0, 8)}`, sale.id);
    toast('success', 'Payment updated');
    setEditingPayment(null);
    setShowEditPayment(false);
    fetchPaymentsAndExpenses();
  };

  const expenseByCategory = expenses.reduce((acc, e) => {
    const cat = e.category;
    if (!acc[cat]) acc[cat] = 0;
    acc[cat] += e.amount || 0;
    return acc;
  }, {} as Record<string, number>);

  const SALE_EXPENSE_LABELS: Record<string, string> = {
    puppy_cost: 'Puppy Cost',
    delivery: 'Delivery',
    other: 'Other Expense',
    vat: 'VAT',
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <button onClick={onBack} className="btn-ghost px-0 mb-3"><ArrowLeft className="w-4 h-4" /> Back to Sales</button>
          <h1 className="text-2xl font-bold text-white">{sale.client?.name || sale.breed || 'Sale transaction'}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`badge ${isFullyPaid ? 'bg-success-500/15 text-success-400' : sale.status === 'cancelled' ? 'bg-error-500/15 text-error-400' : 'bg-warning-500/15 text-warning-400'}`}>
              {isFullyPaid ? 'Fully Paid' : sale.status === 'cancelled' ? 'Cancelled' : 'Pending Payment'}
            </span>
            <span className="badge bg-success-500/15 text-success-400"><CircleDollarSign className="w-3.5 h-3.5" /> {isFullyPaid ? 'Paid' : 'Unpaid'}</span>
            <span className="badge bg-accent-500/10 text-accent-400">{sale.vat_type === 'on_tax' ? 'On Tax' : 'Off Tax'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="btn-secondary"><FileText className="w-4 h-4" /> Sales List</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Sale</p>
          <p className="text-white font-semibold mt-2">{sale.id.slice(0, 8)}</p>
          <p className="text-sm text-gray-500 mt-1 capitalize">{sale.sale_type} sale{sale.contract_id ? ' · linked to contract' : ''}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Client</p>
          <p className="text-white font-semibold mt-2">{sale.client?.name || 'No client assigned'}</p>
          <p className="text-sm text-gray-500 mt-1">{sale.client?.email || sale.client?.phone || 'Client details unavailable'}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Salesperson</p>
          <p className="text-white font-semibold mt-2">{sale.employee?.name || 'Not assigned'}</p>
          <p className="text-sm text-gray-500 mt-1">Created {formatDate(sale.date)}</p>
        </div>
      </div>

      {/* Payment Tracker */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-accent-400" /><h2 className="text-base font-semibold text-white">Payment Tracker</h2></div>
          <button onClick={() => setShowAddPayment(true)} className="btn-primary text-xs px-3 py-2"><Plus className="w-3.5 h-3.5" /> Record Payment</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MetricTile label="Selling Price" value={formatAED(sellingPrice)} />
          <MetricTile label="Total Paid" value={formatAED(totalPaid)} tone="success" detail={`${payments.length} payment${payments.length !== 1 ? 's' : ''}`} />
          <MetricTile label="Remaining" value={formatAED(remaining)} tone={remaining > 0 ? 'warning' : 'success'} detail={isFullyPaid ? 'Fully collected' : 'Outstanding'} />
        </div>
        <div className="mt-5">
          <div className="flex justify-between text-xs text-gray-500 mb-2"><span>{Math.round(progress)}% collected</span><span>{payments.length} payment{payments.length !== 1 ? 's' : ''}</span></div>
          <div className="h-2 rounded-full bg-primary-800 overflow-hidden"><div className="h-full rounded-full bg-success-500 transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
      </section>

      {/* Finance & Expenses */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><Wallet className="w-5 h-5 text-accent-400" /><h2 className="text-base font-semibold text-white">Finance & Expenses</h2></div>
          <button onClick={() => setShowAddExpense(true)} className="btn-primary text-xs px-3 py-2"><Plus className="w-3.5 h-3.5" /> Record Expense</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricTile label="Selling Price" value={formatAED(sellingPrice)} />
          <MetricTile label="Client Paid" value={formatAED(totalPaid)} tone="success" detail={`${payments.length} payment${payments.length !== 1 ? 's' : ''}`} />
          <MetricTile label="Expenses Paid" value={formatAED(totalExpenses)} tone="error" detail={`${expenses.length} expense${expenses.length !== 1 ? 's' : ''}`} />
          <MetricTile label="Net Revenue" value={formatAED(cashRevenue)} tone={cashRevenue >= 0 ? 'success' : 'error'} detail="Received - Spent" />
        </div>
        <div className="mt-5 border-t border-primary-800 pt-4">
          <div className="flex items-center justify-between mb-3"><p className="text-xs uppercase tracking-wider text-gray-500">Expense Breakdown</p><span className="text-xs text-gray-500">Total: {formatAED(totalExpenses)}</span></div>
          {expenses.length === 0 ? (
            <div className="rounded-xl border border-primary-800 bg-primary-950/40 p-4 text-sm text-gray-500">No expenses have been recorded for this sale.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(expenseByCategory).map(([cat, amt]) => (
                <div key={cat} className="rounded-lg border border-primary-800 bg-primary-950/40 p-3">
                  <p className="text-xs text-gray-500">{SALE_EXPENSE_LABELS[cat] || cat}</p>
                  <p className="text-sm text-error-400 font-medium mt-1">{formatAED(amt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Sale Details */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><FileText className="w-5 h-5 text-accent-400" /><h2 className="text-base font-semibold text-white">Sale Details</h2></div><span className="badge bg-accent-500/10 text-accent-400">{sale.vat_type === 'on_tax' ? 'On Tax' : 'Off Tax'}</span></div>
        <div className="divide-y divide-primary-800">
          <DetailLine icon={<CircleDollarSign className="w-4 h-4" />} label="Breed" value={sale.breed || '—'} />
          <DetailLine icon={<Receipt className="w-4 h-4" />} label="Type" value={sale.sale_type === 'imported' ? 'Imported' : 'Local'} />
          <DetailLine icon={<CircleDollarSign className="w-4 h-4" />} label="Selling Price" value={formatAED(sellingPrice)} />
          <DetailLine icon={<TrendingDown className="w-4 h-4" />} label="Total Expenses" value={formatAED(totalExpenses)} />
          <DetailLine icon={<TrendingUp className="w-4 h-4" />} label="Net Revenue" value={formatAED(cashRevenue)} />
          <DetailLine icon={<CalendarDays className="w-4 h-4" />} label="Created" value={formatDate(sale.date)} />
        </div>
        <div className="border-t border-primary-800 mt-2 pt-4"><p className="text-xs uppercase tracking-wider text-gray-500">Notes</p><p className="text-sm text-gray-300 mt-2">Sale recorded {sale.contract_id ? 'from a contract' : 'manually'}{sale.contract_id ? ` · Contract ${sale.contract_id.slice(0, 8)}` : ''}.</p></div>
      </section>

      {/* Payment History */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4"><CreditCard className="w-5 h-5 text-accent-400" /><h2 className="text-base font-semibold text-white">Payment History</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead><tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800"><th className="pb-3 font-medium">Date</th><th className="pb-3 font-medium">Amount</th><th className="pb-3 font-medium">Method</th><th className="pb-3 font-medium">Note</th><th className="pb-3 font-medium">Recorded By</th><th className="pb-3 font-medium"></th></tr></thead>
            <tbody>
              {loadingData ? (
                <tr><td colSpan={6} className="py-6 text-center text-sm text-gray-500">Loading payments...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-sm text-gray-500">No payments recorded yet. Click "Record Payment" to add one.</td></tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="text-sm border-b border-primary-800/50">
                    <td className="py-3 text-gray-300">{formatDate(p.created_at)}</td>
                    <td className="py-3 text-success-400 font-medium">{formatAED(p.amount)}</td>
                    <td className="py-3"><span className="badge bg-primary-800 text-gray-300 capitalize">{p.method.replace('_', ' ')}</span></td>
                    <td className="py-3 text-gray-400">{p.note || '—'}</td>
                    <td className="py-3 text-gray-400">{(p as SalePayment & { recorded_by_profile?: { name: string } | null }).recorded_by_profile?.name || 'System'}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditPayment(p)} className="p-1 rounded-lg text-gray-500 hover:text-accent-400 hover:bg-accent-500/10 transition-colors" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeletePayment(p.id)} className="p-1 rounded-lg text-gray-500 hover:text-error-400 hover:bg-error-500/10 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Expense History */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4"><Wallet className="w-5 h-5 text-accent-400" /><h2 className="text-base font-semibold text-white">Expense History</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead><tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800"><th className="pb-3 font-medium">Date</th><th className="pb-3 font-medium">Category</th><th className="pb-3 font-medium">Description</th><th className="pb-3 font-medium">Amount</th><th className="pb-3 font-medium">Paid Via</th><th className="pb-3 font-medium">Recorded By</th><th className="pb-3 font-medium"></th></tr></thead>
            <tbody>
              {loadingData ? (
                <tr><td colSpan={6} className="py-6 text-center text-sm text-gray-500">Loading expenses...</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-sm text-gray-500">No expenses recorded yet. Click "Record Expense" to add one.</td></tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e.id} className="text-sm border-b border-primary-800/50">
                    <td className="py-3 text-gray-300">{formatDate(e.date)}</td>
                    <td className="py-3"><span className="badge bg-primary-800 text-gray-300">{SALE_EXPENSE_LABELS[e.category] || e.category}</span></td>
                    <td className="py-3 text-gray-400">{e.description}</td>
                    <td className="py-3 text-error-400 font-medium">{formatAED(e.amount)}</td>
                    <td className="py-3"><span className="badge bg-primary-800 text-gray-300 capitalize">{e.payment_method.replace('_', ' ')}</span></td>
                    <td className="py-3 text-gray-400">{(e as SaleExpense & { recorded_by_profile?: { name: string } | null }).recorded_by_profile?.name || 'System'}</td>
                    <td className="py-3"><button onClick={() => handleDeleteExpense(e.id)} className="p-1 rounded-lg text-gray-500 hover:text-error-400 hover:bg-error-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add Payment Modal */}
      <Modal open={showAddPayment} onClose={() => setShowAddPayment(false)} title="Record Payment" size="md">
        <form onSubmit={handleAddPayment} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Amount (AED) *</label>
            <input type="number" required min="0.01" step="0.01" value={paymentForm.amount} onChange={(ev) => setPaymentForm({ ...paymentForm, amount: ev.target.value })} className="input" placeholder={`Remaining: ${formatAED(remaining)}`} autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Payment Method</label>
            <select value={paymentForm.method} onChange={(ev) => setPaymentForm({ ...paymentForm, method: ev.target.value as SalePayment['method'] })} className="select">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="online">Online</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Note (optional)</label>
            <input type="text" value={paymentForm.note} onChange={(ev) => setPaymentForm({ ...paymentForm, note: ev.target.value })} className="input" placeholder="e.g. Down payment, installment 1..." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAddPayment(false)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={savingPayment} className="btn-primary">
              {savingPayment ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              Record Payment
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Expense Modal */}
      <Modal open={showAddExpense} onClose={() => setShowAddExpense(false)} title="Record Expense" size="md">
        <form onSubmit={handleAddExpense} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Category</label>
            <select value={expenseForm.category} onChange={(e) => handleExpenseCategoryChange(e.target.value as SaleExpense['category'])} className="select">
              <option value="puppy_cost">Puppy Cost</option>
              <option value="delivery">Delivery</option>
              {isVatApplicable && <option value="vat">VAT</option>}
              <option value="other">Other Expense</option>
            </select>
          </div>
          {isVatApplicable ? (
            <div className="card p-3 bg-accent-500/5 border-accent-500/20">
              <p className="text-xs text-accent-400">
                This sale is <span className="font-semibold">On Tax (5% VAT)</span>. Sale amount: {formatAED(sale.amount)} — VAT amount: <span className="font-semibold">{formatAED(saleVatAmount)}</span>. Select the <span className="font-semibold">VAT</span> category to auto-fill this as an expense.
              </p>
            </div>
          ) : (
            <div className="card p-3 bg-primary-950/40 border-primary-800">
              <p className="text-xs text-gray-500">
                This sale is <span className="font-semibold text-gray-400">Off Tax</span> — no VAT is applicable. VAT expenses cannot be recorded for this sale.
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Description *</label>
            <input type="text" required value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="input" placeholder="e.g. Puppy purchase cost, delivery to buyer..." autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Amount (AED) *</label>
            <input type="number" required min="0.01" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Date</label>
            <input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Payment Method</label>
            <select value={expenseForm.payment_method} onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value as SaleExpense['payment_method'] })} className="select">
              <option value="cash">Cash</option>
              <option value="card">Credit Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAddExpense(false)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={savingExpense} className="btn-primary">
              {savingExpense ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              Record Expense
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Payment Modal */}
      <Modal open={showEditPayment} onClose={() => { setShowEditPayment(false); setEditingPayment(null); }} title="Edit Payment" size="md">
        <form onSubmit={handleEditPayment} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Amount (AED) *</label>
            <input type="number" required min="0.01" step="0.01" value={editPaymentForm.amount} onChange={(e) => setEditPaymentForm({ ...editPaymentForm, amount: e.target.value })} className="input" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Payment Method</label>
            <select value={editPaymentForm.method} onChange={(e) => setEditPaymentForm({ ...editPaymentForm, method: e.target.value as SalePayment['method'] })} className="select">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="online">Online</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Note (optional)</label>
            <input type="text" value={editPaymentForm.note} onChange={(e) => setEditPaymentForm({ ...editPaymentForm, note: e.target.value })} className="input" placeholder="e.g. Down payment, installment 1..." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowEditPayment(false); setEditingPayment(null); }} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={savingEditPayment} className="btn-primary">
              {savingEditPayment ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

interface MetricTileProps {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'error';
  detail?: string;
}

function MetricTile({ label, value, tone, detail }: MetricTileProps) {
  const toneClass = tone === 'success' ? 'text-success-400 bg-success-500/10' : tone === 'warning' ? 'text-warning-400 bg-warning-500/10' : tone === 'error' ? 'text-error-400 bg-error-500/10' : 'text-white bg-primary-950/50';
  return <div className={`rounded-xl p-4 ${toneClass}`}><p className="text-xs uppercase tracking-wider opacity-70">{label}</p><p className="text-xl font-bold mt-2">{value}</p>{detail && <p className="text-xs opacity-70 mt-1">{detail}</p>}</div>;
}

interface DetailLineProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function DetailLine({ icon, label, value }: DetailLineProps) {
  return <div className="flex items-center justify-between gap-4 py-3"><span className="flex items-center gap-2 text-sm text-gray-500">{icon}{label}</span><span className="text-sm text-gray-200 text-right">{value}</span></div>;
}
