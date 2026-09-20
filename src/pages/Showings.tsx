import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, LogIn, LogOut, MapPin, Clock, Phone, Check, X, Calendar as CalIcon, ArrowRight, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logActivity } from '@/lib/activity';
import { formatDateTime, formatDate } from '@/lib/utils';
import { useFilters } from '@/lib/useFilters';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import { TableSkeleton } from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import type { Showing, Lead, Client, Profile } from '@/lib/supabase';

const STATUS_VARIANT: Record<string, 'info' | 'success' | 'error' | 'warning' | 'neutral'> = {
  scheduled: 'info', completed: 'success', cancelled: 'warning', no_show: 'error',
};

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export default function Showings() {
  const { user } = useAuth();
  const [showings, setShowings] = useState<Showing[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters({ typeFilter: 'all', statusFilter: 'all', assigneeFilter: 'all' });
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState<Showing | null>(null);

  const defaultDate = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2, 0, 0, 0);
    return toLocalInputValue(d.toISOString());
  }, []);

  const [form, setForm] = useState({
    type: 'showing_in' as 'showing_in' | 'showing_out',
    lead_id: '', client_id: '',
    customer_name: '', customer_phone: '', breed: '', puppy_name: '',
    location: '', scheduled_date: defaultDate, duration_minutes: 30,
    assigned_to: '', notes: '',
  });

  const fetchShowings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('showings')
      .select(`*, assigned_profile:profiles!showings_assigned_to_fkey(*), lead:leads(*), client:clients(*)`)
      .order('scheduled_date', { ascending: false });
    if (!error) setShowings((data || []) as Showing[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchShowings();
    supabase.from('leads').select('*').order('name').then(({ data }) => setLeads((data || []) as Lead[]));
    supabase.from('clients').select('*').order('name').then(({ data }) => setClients((data || []) as Client[]));
    supabase.from('profiles').select('*').order('name').then(({ data }) => setEmployees((data || []) as Profile[]));
  }, [fetchShowings]);

  const filtered = useMemo(() => {
    return showings.filter((s) => {
      if (search && !s.customer_name.toLowerCase().includes(search.toLowerCase()) && !(s.breed || '').toLowerCase().includes(search.toLowerCase()) && !(s.puppy_name || '').toLowerCase().includes(search.toLowerCase())) return false;
      if (applied.typeFilter !== 'all' && s.type !== applied.typeFilter) return false;
      if (applied.statusFilter !== 'all' && s.status !== applied.statusFilter) return false;
      if (applied.assigneeFilter !== 'all' && s.assigned_to !== applied.assigneeFilter) return false;
      return true;
    });
  }, [showings, search, applied]);

  const todayCount = showings.filter((s) => {
    const today = new Date().toDateString();
    return new Date(s.scheduled_date).toDateString() === today && s.status === 'scheduled';
  }).length;

  const completedCount = showings.filter((s) => s.status === 'completed').length;
  const showingInCount = showings.filter((s) => s.type === 'showing_in' && s.status === 'scheduled').length;
  const showingOutCount = showings.filter((s) => s.type === 'showing_out' && s.status === 'scheduled').length;

  const selectLead = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      setForm((f) => ({ ...f, lead_id: lead.id, client_id: '', customer_name: lead.name, customer_phone: lead.phone, breed: lead.breed_interested || '' }));
    } else {
      setForm((f) => ({ ...f, lead_id: '' }));
    }
  };

  const selectClient = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setForm((f) => ({ ...f, client_id: client.id, lead_id: '', customer_name: client.name, customer_phone: client.phone || '', breed: client.breed || '' }));
    } else {
      setForm((f) => ({ ...f, client_id: '' }));
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name.trim()) { toast('error', 'Customer name is required'); return; }
    const { data, error } = await supabase.from('showings').insert({
      type: form.type,
      lead_id: form.lead_id || null,
      client_id: form.client_id || null,
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim() || null,
      breed: form.breed.trim() || null,
      puppy_name: form.puppy_name.trim() || null,
      location: form.location.trim() || null,
      scheduled_date: new Date(form.scheduled_date).toISOString(),
      duration_minutes: form.duration_minutes,
      assigned_to: form.assigned_to || null,
      notes: form.notes.trim() || null,
      created_by: user?.id,
    }).select(`*, assigned_profile:profiles!showings_assigned_to_fkey(*)`).single();
    if (error) { toast('error', 'Failed to schedule showing'); return; }
    const typeName = form.type === 'showing_in' ? 'Showing In' : 'Showing Out';
    await logActivity(`scheduled ${typeName}`, form.customer_name, (data as Showing).id);
    toast('success', `${typeName} scheduled for ${form.customer_name}`);
    setShowAdd(false);
    setForm({ type: 'showing_in', lead_id: '', client_id: '', customer_name: '', customer_phone: '', breed: '', puppy_name: '', location: '', scheduled_date: defaultDate, duration_minutes: 30, assigned_to: '', notes: '' });
    fetchShowings();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete showing for ${name}?`)) return;
    const { error } = await supabase.from('showings').delete().eq('id', id);
    if (error) { toast('error', 'Failed to delete showing'); return; }
    toast('success', 'Showing deleted');
    fetchShowings();
    if (showDetail?.id === id) setShowDetail(null);
  };

  const updateStatus = async (id: string, status: string, _name: string) => {
    const { error } = await supabase.from('showings').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast('error', 'Failed to update status'); return; }
    toast('success', `Showing marked as ${status.replace('_', ' ')}`);
    fetchShowings();
    if (showDetail?.id === id) setShowDetail({ ...showDetail, status: status as Showing['status'] });
  };

  const updateOutcome = async (id: string, outcome: string) => {
    const { error } = await supabase.from('showings').update({ outcome, status: 'completed', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast('error', 'Failed to update outcome'); return; }
    toast('success', 'Showing completed with outcome recorded');
    fetchShowings();
    if (showDetail?.id === id) setShowDetail({ ...showDetail, outcome, status: 'completed' });
  };

  const isToday = (date: string) => new Date(date).toDateString() === new Date().toDateString();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Showings</h1>
          <p className="text-sm text-gray-500 mt-1">Track puppy viewings — Showing In (customer visits you) and Showing Out (you go to customer)</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Schedule Showing</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-info-500/10 flex items-center justify-center"><LogIn className="w-5 h-5 text-info-400" /></div><div><p className="text-2xl font-bold text-white">{showingInCount}</p><p className="text-xs text-gray-500">Showing In</p></div></div></div>
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-accent-500/10 flex items-center justify-center"><LogOut className="w-5 h-5 text-accent-400" /></div><div><p className="text-2xl font-bold text-white">{showingOutCount}</p><p className="text-xs text-gray-500">Showing Out</p></div></div></div>
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-warning-500/10 flex items-center justify-center"><CalIcon className="w-5 h-5 text-warning-400" /></div><div><p className="text-2xl font-bold text-white">{todayCount}</p><p className="text-xs text-gray-500">Today</p></div></div></div>
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-success-500/10 flex items-center justify-center"><Check className="w-5 h-5 text-success-400" /></div><div><p className="text-2xl font-bold text-white">{completedCount}</p><p className="text-xs text-gray-500">Completed</p></div></div></div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by customer, breed, or puppy..." className="input pl-10" />
          </div>
          <select value={draft.typeFilter} onChange={(e) => setDraftValue('typeFilter', e.target.value)} className="select text-sm">
            <option value="all">All Types</option>
            <option value="showing_in">Showing In</option>
            <option value="showing_out">Showing Out</option>
          </select>
          <select value={draft.statusFilter} onChange={(e) => setDraftValue('statusFilter', e.target.value)} className="select text-sm">
            <option value="all">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No Show</option>
          </select>
          <select value={draft.assigneeFilter} onChange={(e) => setDraftValue('assigneeFilter', e.target.value)} className="select text-sm">
            <option value="all">All Assignees</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
          {hasChanges && <button onClick={apply} className="btn-primary text-sm"><Check className="w-4 h-4" /> Apply</button>}
          {(draft.typeFilter !== 'all' || draft.statusFilter !== 'all' || draft.assigneeFilter !== 'all') && <button onClick={clear} className="btn-ghost text-sm"><X className="w-4 h-4" /> Clear</button>}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No showings scheduled" subMessage="Schedule a showing to track puppy viewings with customers" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Breed / Puppy</th>
                  <th className="px-4 py-3 font-medium">Date & Time</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Assigned To</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="table-row cursor-pointer" onClick={() => setShowDetail(s)}>
                    <td className="px-4 py-3">
                      {s.type === 'showing_in' ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-info-400"><LogIn className="w-3.5 h-3.5" /> In</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-accent-400"><LogOut className="w-3.5 h-3.5" /> Out</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-white">{s.customer_name}</p>
                      {s.customer_phone && <p className="text-xs text-gray-500 mt-0.5">{s.customer_phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {s.breed && <span>{s.breed}</span>}
                      {s.puppy_name && <span className="block text-xs text-gray-500 mt-0.5">{s.puppy_name}</span>}
                      {!s.breed && !s.puppy_name && <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-300">{formatDate(s.scheduled_date)}</span>
                        {isToday(s.scheduled_date) && s.status === 'scheduled' && <Badge variant="warning">Today</Badge>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{new Date(s.scheduled_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {s.duration_minutes}min</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{s.location || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{s.assigned_profile?.name || 'Unassigned'}</td>
                    <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[s.status]}>{s.status.replace('_', ' ')}</Badge></td>
                    <td className="px-4 py-3">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.customer_name); }} className="p-1.5 rounded-lg text-gray-500 hover:text-error-400 hover:bg-error-500/10 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Schedule Showing" size="lg">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setForm({ ...form, type: 'showing_in' })} className={`p-4 rounded-xl border-2 transition-all text-left ${form.type === 'showing_in' ? 'border-info-500 bg-info-500/10' : 'border-primary-800 hover:border-primary-700'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${form.type === 'showing_in' ? 'bg-info-500/20 text-info-400' : 'bg-primary-800 text-gray-500'}`}><LogIn className="w-5 h-5" /></div>
                <div>
                  <p className={`text-sm font-semibold ${form.type === 'showing_in' ? 'text-info-400' : 'text-gray-400'}`}>Showing In</p>
                  <p className="text-xs text-gray-500 mt-0.5">Customer comes to your location</p>
                </div>
              </div>
            </button>
            <button type="button" onClick={() => setForm({ ...form, type: 'showing_out' })} className={`p-4 rounded-xl border-2 transition-all text-left ${form.type === 'showing_out' ? 'border-accent-500 bg-accent-500/10' : 'border-primary-800 hover:border-primary-700'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${form.type === 'showing_out' ? 'bg-accent-500/20 text-accent-400' : 'bg-primary-800 text-gray-500'}`}><LogOut className="w-5 h-5" /></div>
                <div>
                  <p className={`text-sm font-semibold ${form.type === 'showing_out' ? 'text-accent-400' : 'text-gray-400'}`}>Showing Out</p>
                  <p className="text-xs text-gray-500 mt-0.5">You take the puppy to the customer</p>
                </div>
              </div>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Link to Lead (optional)</label>
              <select value={form.lead_id} onChange={(e) => selectLead(e.target.value)} className="select">
                <option value="">— None —</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.name} {l.breed_interested ? `(${l.breed_interested})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Link to Client (optional)</label>
              <select value={form.client_id} onChange={(e) => selectClient(e.target.value)} className="select">
                <option value="">— None —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Customer Name *</label><input type="text" required value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="input" placeholder="Full name" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Customer Phone</label><input type="tel" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} className="input" placeholder="+971..." /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Breed</label><input type="text" value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} className="input" placeholder="e.g. Golden Retriever" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Puppy Name / Ref</label><input type="text" value={form.puppy_name} onChange={(e) => setForm({ ...form, puppy_name: e.target.value })} className="input" placeholder="e.g. Max, Puppy #3" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Date & Time *</label><input type="datetime-local" required value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} className="input" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Duration (minutes)</label><input type="number" min="5" step="5" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 30 })} className="input" /></div>
            <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-400 mb-1.5">Location</label><input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input" placeholder={form.type === 'showing_out' ? "Customer's address" : 'Your shop/office address'} /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Assigned To</label><select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className="select"><option value="">Unassigned</option>{employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-[60px]" placeholder="Any special requests, customer preferences..." /></div>
          <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary">Schedule Showing</button></div>
        </form>
      </Modal>

      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title="Showing Details" size="md">
        {showDetail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {showDetail.type === 'showing_in' ? (
                  <span className="flex items-center gap-2 text-sm font-medium text-info-400"><LogIn className="w-4 h-4" /> Showing In</span>
                ) : (
                  <span className="flex items-center gap-2 text-sm font-medium text-accent-400"><LogOut className="w-4 h-4" /> Showing Out</span>
                )}
              </div>
              <Badge variant={STATUS_VARIANT[showDetail.status]}>{showDetail.status.replace('_', ' ')}</Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-gray-400"><User className="w-4 h-4 text-gray-500" /> {showDetail.customer_name}</div>
              {showDetail.customer_phone && <div className="flex items-center gap-2 text-gray-400"><Phone className="w-4 h-4 text-gray-500" /> {showDetail.customer_phone}</div>}
              <div className="flex items-center gap-2 text-gray-400"><CalIcon className="w-4 h-4 text-gray-500" /> {formatDateTime(showDetail.scheduled_date)}</div>
              <div className="flex items-center gap-2 text-gray-400"><Clock className="w-4 h-4 text-gray-500" /> {showDetail.duration_minutes} minutes</div>
              {showDetail.breed && <div className="text-gray-400">Breed: <span className="text-white">{showDetail.breed}</span></div>}
              {showDetail.puppy_name && <div className="text-gray-400">Puppy: <span className="text-white">{showDetail.puppy_name}</span></div>}
              {showDetail.location && <div className="flex items-center gap-2 text-gray-400 sm:col-span-2"><MapPin className="w-4 h-4 text-gray-500" /> {showDetail.location}</div>}
              {showDetail.assigned_profile && <div className="text-gray-400">Assigned to: <span className="text-white">{showDetail.assigned_profile.name}</span></div>}
            </div>

            {showDetail.notes && <div className="p-3 rounded-lg bg-primary-950/40 border border-primary-800 text-sm text-gray-400">{showDetail.notes}</div>}

            {showDetail.outcome && (
              <div className="p-3 rounded-lg bg-success-500/10 border border-success-500/20 text-sm">
                <span className="text-success-400 font-medium">Outcome: </span>
                <span className="text-gray-300">{showDetail.outcome}</span>
              </div>
            )}

            {showDetail.status === 'scheduled' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => updateStatus(showDetail.id, 'completed', showDetail.customer_name)} className="btn-primary text-sm"><Check className="w-4 h-4" /> Mark Completed</button>
                  <button onClick={() => updateStatus(showDetail.id, 'no_show', showDetail.customer_name)} className="btn-secondary text-sm"><X className="w-4 h-4" /> No Show</button>
                  <button onClick={() => updateStatus(showDetail.id, 'cancelled', showDetail.customer_name)} className="btn-ghost text-sm col-span-2">Cancel Showing</button>
                </div>
                <div className="border-t border-primary-800 pt-3">
                  <p className="text-xs text-gray-500 mb-2">Quick complete with outcome:</p>
                  <div className="flex flex-wrap gap-2">
                    {['Interested — will buy', 'Interested — will think', 'Not interested', 'Wants different breed', 'Will follow up'].map((outcome) => (
                      <button key={outcome} onClick={() => updateOutcome(showDetail.id, outcome)} className="px-3 py-1.5 rounded-lg text-xs bg-primary-800 text-gray-400 hover:text-white hover:bg-primary-700 transition-colors">{outcome}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {showDetail.lead && (
              <div className="p-3 rounded-lg bg-info-500/10 border border-info-500/20 text-sm text-gray-400 flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-info-400" />
                Linked to lead: <span className="text-white font-medium">{showDetail.lead.name}</span>
              </div>
            )}
            {showDetail.client && (
              <div className="p-3 rounded-lg bg-info-500/10 border border-info-500/20 text-sm text-gray-400 flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-info-400" />
                Linked to client: <span className="text-white font-medium">{showDetail.client.name}</span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
