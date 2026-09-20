import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Phone, Mail, FileText, Trash2, UserCircle, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { formatDate } from '@/lib/utils';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import { TableSkeleton } from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import type { Client, Contract, Sale } from '@/lib/supabase';
import { useFilters } from '@/lib/useFilters';

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters({
    dateFrom: '', dateTo: '', statusFilter: 'all',
  });
  const [showAdd, setShowAdd] = useState(false);
  const [showProfile, setShowProfile] = useState<Client | null>(null);
  const [clientContracts, setClientContracts] = useState<Contract[]>([]);
  const [clientSales, setClientSales] = useState<Sale[]>([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', id_passport: '', breed: '', purchase_date: '', status: 'active' });

  const fetchClients = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('clients').select('*, contract:contracts!clients_contract_id_fkey(*)').order('name');
    if (!error) setClients((data || []) as Client[]);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, []);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.phone?.includes(search) && !c.breed?.toLowerCase().includes(q)) return false;
      }
      if (applied.dateFrom && c.purchase_date && c.purchase_date < applied.dateFrom) return false;
      if (applied.dateTo && c.purchase_date && c.purchase_date > applied.dateTo) return false;
      if (applied.statusFilter !== 'all' && c.status !== applied.statusFilter) return false;
      return true;
    });
  }, [clients, search, applied]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.from('clients').insert({
      name: form.name, email: form.email || null, phone: form.phone || null,
      id_passport: form.id_passport || null, breed: form.breed || null,
      purchase_date: form.purchase_date || null, status: form.status,
    }).select().single();
    if (error) { toast('error', 'Failed to add client'); return; }
    await logActivity('added client', form.name, (data as Client).id);
    toast('success', 'Client added successfully');
    setShowAdd(false);
    setForm({ name: '', email: '', phone: '', id_passport: '', breed: '', purchase_date: '', status: 'active' });
    fetchClients();
  };

  const openProfile = async (client: Client) => {
    setShowProfile(client);
    const [contractsRes, salesRes] = await Promise.all([
      supabase.from('contracts').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
      supabase.from('sales').select('*').eq('client_id', client.id).order('date', { ascending: false }),
    ]);
    setClientContracts((contractsRes.data || []) as Contract[]);
    setClientSales((salesRes.data || []) as Sale[]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this client?')) return;
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) { toast('error', 'Failed to delete client'); return; }
    toast('success', 'Client deleted');
    fetchClients();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} clients</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add New Client</button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, phone, or breed..." className="input pl-10" />
          </div>
          <input type="date" value={draft.dateFrom} onChange={(e) => setDraftValue('dateFrom', e.target.value)} className="input text-sm w-auto" />
          <input type="date" value={draft.dateTo} onChange={(e) => setDraftValue('dateTo', e.target.value)} className="input text-sm w-auto" />
          <select value={draft.statusFilter} onChange={(e) => setDraftValue('statusFilter', e.target.value)} className="select text-sm">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {hasChanges && (
            <button onClick={apply} className="btn-primary text-sm"><Check className="w-4 h-4" /> Apply</button>
          )}
          {(draft.dateFrom || draft.dateTo || draft.statusFilter !== 'all') && (
            <button onClick={clear} className="btn-ghost text-sm"><X className="w-4 h-4" /> Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No clients found" subMessage="Add a new client to get started" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                  <th className="px-4 py-3 font-medium">Client Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">ID/Passport</th>
                  <th className="px-4 py-3 font-medium">Breed</th>
                  <th className="px-4 py-3 font-medium">Contract No.</th>
                  <th className="px-4 py-3 font-medium">Purchase Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => (
                  <tr key={client.id} className="table-row cursor-pointer" onClick={() => openProfile(client)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-accent-500/15 flex items-center justify-center text-accent-400 text-xs font-semibold">{client.name.charAt(0).toUpperCase()}</div>
                        <span className="font-medium text-white text-sm">{client.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{client.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{client.phone || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{client.id_passport || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{client.breed || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{client.contract?.contract_number || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(client.purchase_date)}</td>
                    <td className="px-4 py-3"><Badge variant={client.status === 'active' ? 'success' : 'neutral'}>{client.status}</Badge></td>
                    <td className="px-4 py-3">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(client.id); }} className="p-1.5 rounded-lg text-gray-500 hover:text-error-400 hover:bg-error-500/10 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Client" size="lg">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Client Name *</label><input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Phone</label><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">ID/Passport</label><input type="text" value={form.id_passport} onChange={(e) => setForm({ ...form, id_passport: e.target.value })} className="input" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Dog Breed Purchased</label><input type="text" value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} className="input" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Purchase Date</label><input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="input" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="select"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
          </div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary"><Plus className="w-4 h-4" /> Add Client</button></div>
        </form>
      </Modal>

      {/* Client Profile Modal */}
      <Modal open={!!showProfile} onClose={() => setShowProfile(null)} title="Client Profile" size="lg">
        {showProfile && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-accent-500/15 flex items-center justify-center text-accent-400 text-xl font-semibold">{showProfile.name.charAt(0).toUpperCase()}</div>
              <div>
                <h3 className="text-xl font-semibold text-white">{showProfile.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={showProfile.status === 'active' ? 'success' : 'neutral'}>{showProfile.status}</Badge>
                  <span className="text-sm text-gray-500">Since {formatDate(showProfile.purchase_date)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="card p-3 flex items-center gap-2"><Mail className="w-4 h-4 text-gray-500" /><span className="text-gray-300">{showProfile.email || '—'}</span></div>
              <div className="card p-3 flex items-center gap-2"><Phone className="w-4 h-4 text-gray-500" /><span className="text-gray-300">{showProfile.phone || '—'}</span></div>
              <div className="card p-3 flex items-center gap-2"><UserCircle className="w-4 h-4 text-gray-500" /><span className="text-gray-300">ID: {showProfile.id_passport || '—'}</span></div>
              <div className="card p-3 flex items-center gap-2"><FileText className="w-4 h-4 text-gray-500" /><span className="text-gray-300">Breed: {showProfile.breed || '—'}</span></div>
            </div>

            {/* Purchase history */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Purchase History</h4>
              {clientSales.length === 0 ? (
                <p className="text-sm text-gray-500">No purchases recorded</p>
              ) : (
                <div className="space-y-2">
                  {clientSales.map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary-950/50 text-sm">
                      <span className="text-gray-300">{sale.breed || '—'} — {sale.sale_type}</span>
                      <div className="flex items-center gap-3">
                        <Badge variant={sale.status === 'completed' ? 'success' : sale.status === 'pending' ? 'warning' : 'error'}>{sale.status}</Badge>
                        <span className="text-gray-400">AED {sale.amount}</span>
                        <span className="text-xs text-gray-600">{formatDate(sale.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Linked contracts */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Linked Contracts</h4>
              {clientContracts.length === 0 ? (
                <p className="text-sm text-gray-500">No contracts linked</p>
              ) : (
                <div className="space-y-2">
                  {clientContracts.map((contract) => (
                    <div key={contract.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary-950/50 text-sm">
                      <span className="text-gray-300 font-mono">{contract.contract_number}</span>
                      <div className="flex items-center gap-3">
                        <Badge variant={contract.status === 'signed' ? 'success' : contract.status === 'sent' ? 'info' : 'neutral'}>{contract.status}</Badge>
                        <span className="text-xs text-gray-600">{formatDate(contract.contract_date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
