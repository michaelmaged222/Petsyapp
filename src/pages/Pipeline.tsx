import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Phone, MessageCircle, Trash2, GripVertical, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logActivity } from '@/lib/activity';
import { toast } from '@/components/Toast';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import type { Lead, Profile } from '@/lib/supabase';

const STAGES: { key: Lead['status']; label: string; color: string; headerClass: string }[] = [
  { key: 'new', label: 'New', color: 'border-l-info-500', headerClass: 'bg-info-500/10 text-info-400' },
  { key: 'contacted', label: 'Contacted', color: 'border-l-warning-500', headerClass: 'bg-warning-500/10 text-warning-400' },
  { key: 'qualified', label: 'Qualified', color: 'border-l-success-500', headerClass: 'bg-success-500/10 text-success-400' },
  { key: 'lost', label: 'Lost', color: 'border-l-error-500', headerClass: 'bg-error-500/10 text-error-400' },
];

const QUALITY_COLOR: Record<string, string> = { hot: 'bg-error-500', warm: 'bg-warning-500', cold: 'bg-info-500' };

export default function Pipeline() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '', phone: '', breed_interested: '', source: 'whatsapp', status: 'new', quality: 'warm', assigned_to: '', notes: '',
  });

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select(`*, assigned_profile:profiles!leads_assigned_to_fkey(*)`)
      .order('created_at', { ascending: false });
    if (!error) setLeads((data || []) as Lead[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeads();
    supabase.from('profiles').select('*').order('name').then(({ data }) => setEmployees((data || []) as Profile[]));
  }, [fetchLeads]);

  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = { new: [], contacted: [], qualified: [], lost: [] };
    leads.forEach((l) => { if (map[l.status]) map[l.status].push(l); });
    return map;
  }, [leads]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    setDragOverStage(stage);
  };

  const handleDrop = async (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!draggingId) return;
    const lead = leads.find((l) => l.id === draggingId);
    if (!lead || lead.status === stage) { setDraggingId(null); return; }
    setLeads((prev) => prev.map((l) => l.id === draggingId ? { ...l, status: stage as Lead['status'] } : l));
    const { error } = await supabase.from('leads').update({ status: stage }).eq('id', draggingId);
    if (error) { toast('error', 'Failed to update stage'); fetchLeads(); }
    else { toast('success', `${lead.name} moved to ${stage}`); await logActivity('moved lead to ' + stage, lead.name, lead.id); }
    setDraggingId(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.from('leads').insert({ ...form, assigned_to: form.assigned_to || null }).select().single();
    if (error) { toast('error', 'Failed to add lead'); return; }
    await logActivity('added lead', form.name, (data as Lead).id);
    toast('success', 'Lead added to pipeline');
    setShowAdd(false);
    setForm({ name: '', phone: '', breed_interested: '', source: 'whatsapp', status: 'new', quality: 'warm', assigned_to: '', notes: '' });
    fetchLeads();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) { toast('error', 'Failed to delete lead'); return; }
    toast('success', 'Lead deleted');
    fetchLeads();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">Drag leads between stages to update their status</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLeads} className="btn-secondary"><RefreshCw className="w-4 h-4" /> Refresh</button>
          <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Lead</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>
      ) : leads.length === 0 ? (
        <EmptyState message="No leads yet" subMessage="Add your first lead to start tracking your pipeline" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STAGES.map((stage) => (
            <div
              key={stage.key}
              onDragOver={(e) => handleDragOver(e, stage.key)}
              onDrop={(e) => handleDrop(e, stage.key)}
              className={`rounded-xl border border-primary-800 bg-primary-950/40 transition-colors ${dragOverStage === stage.key ? 'border-accent-500/50 bg-accent-500/5' : ''}`}
            >
              <div className={`px-4 py-3 rounded-t-xl flex items-center justify-between ${stage.headerClass}`}>
                <span className="text-sm font-semibold">{stage.label}</span>
                <span className="text-xs opacity-70">{leadsByStage[stage.key].length}</span>
              </div>
              <div className="p-3 space-y-2 min-h-[200px]">
                {leadsByStage[stage.key].map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                    className={`group rounded-lg border-l-4 ${stage.color} bg-primary-900/80 border border-primary-700 p-3 cursor-grab active:cursor-grabbing hover:border-primary-600 transition-all ${draggingId === lead.id ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">{lead.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{lead.phone}</p>
                        {lead.breed_interested && <p className="text-xs text-gray-600 mt-0.5 truncate">{lead.breed_interested}</p>}
                      </div>
                      <GripVertical className="w-4 h-4 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        {lead.quality && <span className={`w-2 h-2 rounded-full ${QUALITY_COLOR[lead.quality]}`} title={lead.quality} />}
                        {lead.assigned_profile && <span className="text-xs text-gray-500">{lead.assigned_profile.name.split(' ')[0]}</span>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(lead.id, lead.name); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-error-400 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {leadsByStage[stage.key].length === 0 && (
                  <div className="text-center py-8 text-xs text-gray-600">Drop leads here</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Interest</label>
              <input type="text" value={form.breed_interested} onChange={(e) => setForm({ ...form, breed_interested: e.target.value })} className="input" placeholder="What they're interested in" />
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
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Stage</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="select">
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="lost">Lost</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Quality</label>
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
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-[80px]" placeholder="Additional notes..." />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary">Add Lead</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
