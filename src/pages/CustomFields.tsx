import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, GripVertical, Settings2, Save, X, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/Toast';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import type { CustomField, CustomFieldEntity, CustomFieldType } from '@/lib/supabase';

const ENTITIES: { key: CustomFieldEntity; label: string }[] = [
  { key: 'lead', label: 'Leads' },
  { key: 'client', label: 'Clients' },
  { key: 'contract', label: 'Contracts' },
  { key: 'sale', label: 'Sales' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'inventory', label: 'Inventory' },
];

const FIELD_TYPES: { key: CustomFieldType; label: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'number', label: 'Number' },
  { key: 'select', label: 'Dropdown' },
  { key: 'date', label: 'Date' },
  { key: 'checkbox', label: 'Checkbox' },
];

export default function CustomFields() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeEntity, setActiveEntity] = useState<CustomFieldEntity>('lead');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ field_label: '', field_key: '', field_type: 'text' as CustomFieldType, options: '', is_required: false });

  const fetchFields = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('custom_fields').select('*').order('sort_order', { ascending: true });
    if (!error) setFields((data || []) as CustomField[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchFields(); }, [fetchFields]);

  const entityFields = fields.filter((f) => f.entity === activeEntity);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.field_label.trim()) { toast('error', 'Field label is required'); return; }
    const key = form.field_key.trim() || form.field_label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const existing = fields.filter((f) => f.entity === activeEntity);
    const options = form.field_type === 'select' && form.options.trim() ? form.options.split(',').map((o) => o.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('custom_fields').insert({
      entity: activeEntity, field_key: key, field_label: form.field_label.trim(),
      field_type: form.field_type, options: options ? JSON.stringify(options) : null,
      is_required: form.is_required, sort_order: existing.length, active: true,
    });
    if (error) { toast('error', 'Failed to add field'); return; }
    toast('success', 'Custom field added');
    setShowAdd(false);
    setForm({ field_label: '', field_key: '', field_type: 'text', options: '', is_required: false });
    fetchFields();
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete custom field "${label}"?`)) return;
    const { error } = await supabase.from('custom_fields').delete().eq('id', id);
    if (error) { toast('error', 'Failed to delete field'); return; }
    toast('success', 'Custom field deleted');
    fetchFields();
  };

  const toggleActive = async (field: CustomField) => {
    const { error } = await supabase.from('custom_fields').update({ active: !field.active }).eq('id', field.id);
    if (error) { toast('error', 'Failed to toggle field'); return; }
    fetchFields();
  };

  const moveField = async (field: CustomField, direction: 'up' | 'down') => {
    const sorted = [...entityFields];
    const idx = sorted.findIndex((f) => f.id === field.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swapField = sorted[swapIdx];
    await Promise.all([
      supabase.from('custom_fields').update({ sort_order: swapField.sort_order }).eq('id', field.id),
      supabase.from('custom_fields').update({ sort_order: field.sort_order }).eq('id', swapField.id),
    ]);
    fetchFields();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Custom Fields</h1>
        <p className="text-sm text-gray-500 mt-1">Add custom data fields to any section — adapts the app to any business type</p>
      </div>

      {/* Entity Tabs */}
      <div className="flex flex-wrap gap-1">
        {ENTITIES.map((entity) => (
          <button key={entity.key} onClick={() => setActiveEntity(entity.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeEntity === entity.key ? 'bg-accent-500/10 text-accent-400 border border-accent-500/20' : 'text-gray-400 hover:text-white hover:bg-primary-800/50 border border-transparent'}`}>
            {entity.label}
          </button>
        ))}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">{ENTITIES.find((e) => e.key === activeEntity)?.label} Fields</h2>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm"><Plus className="w-4 h-4" /> Add Field</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10"><span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>
        ) : entityFields.length === 0 ? (
          <EmptyState message="No custom fields yet" subMessage="Add fields like 'VIN Number', 'Color', or 'Warranty' to customize this section for your business" />
        ) : (
          <div className="space-y-2">
            {entityFields.map((field, idx) => (
              <div key={field.id} className="flex items-center gap-3 rounded-lg border border-primary-800 bg-primary-950/40 p-3">
                <GripVertical className="w-4 h-4 text-gray-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{field.field_label}</span>
                    {field.is_required && <Badge variant="warning">Required</Badge>}
                    {!field.active && <Badge variant="neutral">Inactive</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">Key: {field.field_key}</span>
                    <span className="text-xs text-gray-600">·</span>
                    <span className="text-xs text-gray-500">{FIELD_TYPES.find((t) => t.key === field.field_type)?.label}</span>
                    {field.options && field.options.length > 0 && <span className="text-xs text-gray-600">· {field.options.join(', ')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => moveField(field, 'up')} disabled={idx === 0} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-primary-800 transition-colors disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                  <button onClick={() => moveField(field, 'down')} disabled={idx === entityFields.length - 1} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-primary-800 transition-colors disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                  <button onClick={() => toggleActive(field)} className="p-1.5 rounded-lg text-gray-500 hover:text-accent-400 hover:bg-accent-500/10 transition-colors" title={field.active ? 'Deactivate' : 'Activate'}><Settings2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(field.id, field.field_label)} className="p-1.5 rounded-lg text-gray-500 hover:text-error-400 hover:bg-error-500/10 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={`Add Custom Field — ${ENTITIES.find((e) => e.key === activeEntity)?.label}`} size="md">
        <form onSubmit={handleAdd} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Field Label *</label><input type="text" required value={form.field_label} onChange={(e) => setForm({ ...form, field_label: e.target.value })} className="input" placeholder="e.g. VIN Number, Color, Warranty Period" /></div>
          <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Field Key (optional)</label><input type="text" value={form.field_key} onChange={(e) => setForm({ ...form, field_key: e.target.value })} className="input" placeholder="Auto-generated from label if empty" /></div>
          <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Field Type</label><select value={form.field_type} onChange={(e) => setForm({ ...form, field_type: e.target.value as CustomFieldType })} className="select">{FIELD_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
          {form.field_type === 'select' && (
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Options (comma-separated)</label><input type="text" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} className="input" placeholder="e.g. Red, Blue, Green, Other" /></div>
          )}
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} className="w-5 h-5 rounded accent-accent-500" /><span className="text-sm text-gray-300">Required field</span></label>
          <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary">Add Field</button></div>
        </form>
      </Modal>
    </div>
  );
}
