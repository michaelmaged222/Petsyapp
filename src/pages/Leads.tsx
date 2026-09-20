import { useEffect, useState, useMemo } from 'react';
import { Plus, Download, MessageCircle, Search, Phone, Trash2, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logActivity } from '@/lib/activity';
import { formatDate, exportToCSV } from '@/lib/utils';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import { TableSkeleton } from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import type { Lead, Profile } from '@/lib/supabase';
import { Check, X } from 'lucide-react';
import { useFilters } from '@/lib/useFilters';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'error' | 'neutral'> = {
  new: 'info', contacted: 'warning', qualified: 'success', lost: 'error',
};
const QUALITY_VARIANT: Record<string, 'hot' | 'warm' | 'cold'> = { hot: 'hot', warm: 'warm', cold: 'cold' };
const SOURCE_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', google: 'Google', referral: 'Referral' };

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters({
    dateFrom: '', dateTo: '', statusFilter: 'all', qualityFilter: 'all', sourceFilter: 'all', assigneeFilter: 'all',
  });
  const [showAdd, setShowAdd] = useState(false);
  const [showProfile, setShowProfile] = useState<Lead | null>(null);
  const [importing, setImporting] = useState(false);
  const [whatsappMsg, setWhatsappMsg] = useState('');
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  const [form, setForm] = useState({
    name: '', phone: '', breed_interested: '', source: 'whatsapp', status: 'new', quality: 'warm', assigned_to: '', notes: '',
  });

  useEffect(() => {
    fetchLeads();
    supabase.from('profiles').select('*').order('name').then(({ data }) => setEmployees((data || []) as Profile[]));
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select(`*, assigned_profile:profiles!leads_assigned_to_fkey(*)`)
      .order('created_at', { ascending: false });
    if (!error) setLeads((data || []) as Lead[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (search && !lead.name.toLowerCase().includes(search.toLowerCase()) && !lead.phone.includes(search)) return false;
      if (applied.dateFrom && lead.created_at < applied.dateFrom) return false;
      if (applied.dateTo && lead.created_at > applied.dateTo + 'T23:59:59') return false;
      if (applied.statusFilter !== 'all' && lead.status !== applied.statusFilter) return false;
      if (applied.qualityFilter !== 'all' && lead.quality !== applied.qualityFilter) return false;
      if (applied.sourceFilter !== 'all' && lead.source !== applied.sourceFilter) return false;
      if (applied.assigneeFilter !== 'all' && lead.assigned_to !== applied.assigneeFilter) return false;
      return true;
    });
  }, [leads, search, applied]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.from('leads').insert({
      ...form,
      assigned_to: form.assigned_to || null,
    }).select().single();
    if (error) { toast('error', 'Failed to add lead'); return; }
    await logActivity('added lead', form.name, (data as Lead).id);
    toast('success', 'Lead added successfully');
    setShowAdd(false);
    setForm({ name: '', phone: '', breed_interested: '', source: 'whatsapp', status: 'new', quality: 'warm', assigned_to: '', notes: '' });
    fetchLeads();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this lead?')) return;
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) { toast('error', 'Failed to delete lead'); return; }
    toast('success', 'Lead deleted');
    fetchLeads();
  };

  const handleExport = () => {
    exportToCSV('puppyfy-leads.csv', filtered.map((l) => ({
      Name: l.name, Phone: l.phone, Breed: l.breed_interested || '', Source: SOURCE_LABEL[l.source],
      Status: l.status, Quality: l.quality, AssignedTo: l.assigned_profile?.name || 'Unassigned', DateAdded: formatDate(l.created_at),
    })));
    toast('success', 'Leads exported to CSV');
  };

  const handleImportWhatsApp = async () => {
    setImporting(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'import_leads' }),
      });
      if (response.ok) {
        const result = await response.json();
        toast('success', `Imported ${result.imported || 0} leads from WhatsApp`);
        fetchLeads();
      } else {
        toast('info', 'No new WhatsApp leads found');
      }
    } catch {
      toast('info', 'WhatsApp import requires API configuration');
    }
    setImporting(false);
  };

  const handleSendWhatsApp = async () => {
    if (!showProfile) return;
    const phone = showProfile.phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMsg)}`, '_blank');
    await logActivity('sent WhatsApp message to lead', showProfile.name, showProfile.id);
    setShowWhatsApp(false);
    setWhatsappMsg('');
    toast('success', 'WhatsApp message opened');
  };

  const updateLeadStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('leads').update({ status }).eq('id', id);
    if (error) { toast('error', 'Failed to update status'); return; }
    toast('success', 'Lead status updated');
    fetchLeads();
    if (showProfile?.id === id) setShowProfile({ ...showProfile, status: status as Lead['status'] });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} leads total</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleImportWhatsApp} disabled={importing} className="btn-secondary">
            <MessageCircle className="w-4 h-4" />
            {importing ? 'Importing...' : 'Import from WhatsApp'}
          </button>
          <button onClick={handleExport} className="btn-secondary">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add New Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone..." className="input pl-10" />
          </div>
          <input type="date" value={draft.dateFrom} onChange={(e) => setDraftValue('dateFrom', e.target.value)} className="input text-sm w-auto" />
          <input type="date" value={draft.dateTo} onChange={(e) => setDraftValue('dateTo', e.target.value)} className="input text-sm w-auto" />
          <select value={draft.statusFilter} onChange={(e) => setDraftValue('statusFilter', e.target.value)} className="select text-sm">
            <option value="all">All Status</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="lost">Lost</option>
          </select>
          <select value={draft.qualityFilter} onChange={(e) => setDraftValue('qualityFilter', e.target.value)} className="select text-sm">
            <option value="all">All Quality</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
          </select>
          <select value={draft.sourceFilter} onChange={(e) => setDraftValue('sourceFilter', e.target.value)} className="select text-sm">
            <option value="all">All Sources</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="google">Google</option>
            <option value="referral">Referral</option>
          </select>
          <select value={draft.assigneeFilter} onChange={(e) => setDraftValue('assigneeFilter', e.target.value)} className="select text-sm">
            <option value="all">All Assignees</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
          {hasChanges && (
            <button onClick={apply} className="btn-primary text-sm"><Check className="w-4 h-4" /> Apply</button>
          )}
          {(draft.dateFrom || draft.dateTo || draft.statusFilter !== 'all' || draft.qualityFilter !== 'all' || draft.sourceFilter !== 'all' || draft.assigneeFilter !== 'all') && (
            <button onClick={clear} className="btn-ghost text-sm"><X className="w-4 h-4" /> Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No leads found" subMessage="Try adjusting filters or add a new lead" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                  <th className="px-4 py-3 font-medium">Lead Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Breed</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Quality</th>
                  <th className="px-4 py-3 font-medium">Assigned To</th>
                  <th className="px-4 py-3 font-medium">Date Added</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr key={lead.id} className="table-row cursor-pointer" onClick={() => setShowProfile(lead)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white text-sm">{lead.name}</span>
                        {lead.source === 'whatsapp' && <MessageCircle className="w-3.5 h-3.5 text-accent-400" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{lead.phone}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{lead.breed_interested || '—'}</td>
                    <td className="px-4 py-3"><span className="text-xs text-gray-400">{SOURCE_LABEL[lead.source]}</span></td>
                    <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[lead.status]}>{lead.status}</Badge></td>
                    <td className="px-4 py-3"><Badge variant={QUALITY_VARIANT[lead.quality]}>{lead.quality}</Badge></td>
                    <td className="px-4 py-3 text-sm text-gray-400">{lead.assigned_profile?.name || 'Unassigned'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(lead.created_at)}</td>
                    <td className="px-4 py-3">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(lead.id); }} className="p-1.5 rounded-lg text-gray-500 hover:text-error-400 hover:bg-error-500/10 transition-colors">
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

      {/* Add Lead Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Lead" size="lg">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Lead Name *</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Phone Number *</label>
              <input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" placeholder="+971 50 123 4567" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Dog Breed Interested</label>
              <input type="text" value={form.breed_interested} onChange={(e) => setForm({ ...form, breed_interested: e.target.value })} className="input" placeholder="e.g. Golden Retriever" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Source</label>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="select">
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="google">Google</option>
                <option value="referral">Referral</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="select">
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="lost">Lost</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Lead Quality</label>
              <select value={form.quality} onChange={(e) => setForm({ ...form, quality: e.target.value })} className="select">
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Assigned To</label>
              <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className="select">
                <option value="">Unassigned</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-[80px]" placeholder="Additional notes..." />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary"><Plus className="w-4 h-4" /> Add Lead</button>
          </div>
        </form>
      </Modal>

      {/* Lead Profile Modal */}
      <Modal open={!!showProfile} onClose={() => setShowProfile(null)} title="Lead Profile" size="lg">
        {showProfile && (
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white">{showProfile.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{showProfile.phone}</p>
              </div>
              <div className="flex gap-2">
                <Badge variant={STATUS_VARIANT[showProfile.status]}>{showProfile.status}</Badge>
                <Badge variant={QUALITY_VARIANT[showProfile.quality]}>{showProfile.quality}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Breed Interested:</span> <span className="text-gray-300">{showProfile.breed_interested || '—'}</span></div>
              <div><span className="text-gray-500">Source:</span> <span className="text-gray-300">{SOURCE_LABEL[showProfile.source]}</span></div>
              <div><span className="text-gray-500">Assigned To:</span> <span className="text-gray-300">{showProfile.assigned_profile?.name || 'Unassigned'}</span></div>
              <div><span className="text-gray-500">Date Added:</span> <span className="text-gray-300">{formatDate(showProfile.created_at)}</span></div>
            </div>

            {showProfile.notes && (
              <div className="card p-3 bg-primary-950/50">
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-300">{showProfile.notes}</p>
              </div>
            )}

            {/* Status update */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Update Status</label>
              <div className="flex flex-wrap gap-2">
                {['new', 'contacted', 'qualified', 'lost'].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateLeadStatus(showProfile.id, s)}
                    className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-all ${showProfile.status === s ? 'bg-accent-500 text-white' : 'bg-primary-800 text-gray-400 hover:bg-primary-700'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-primary-800">
              <a href={`tel:${showProfile.phone}`} className="btn-secondary flex-1">
                <Phone className="w-4 h-4" /> Call
              </a>
              <button onClick={() => { setShowWhatsApp(true); setWhatsappMsg(`Hello ${showProfile.name}, thank you for your interest in our puppies!`); }} className="btn-secondary flex-1">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* WhatsApp message modal */}
      <Modal open={showWhatsApp} onClose={() => setShowWhatsApp(false)} title="Send WhatsApp Message" size="md">
        <div className="space-y-4">
          <textarea value={whatsappMsg} onChange={(e) => setWhatsappMsg(e.target.value)} className="input min-h-[120px]" placeholder="Type your message..." />
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowWhatsApp(false)} className="btn-ghost">Cancel</button>
            <button onClick={handleSendWhatsApp} className="btn-primary"><Send className="w-4 h-4" /> Send</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
