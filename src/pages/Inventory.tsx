import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Package, AlertTriangle, ArrowUpCircle, ArrowDownCircle, History, Download, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logActivity } from '@/lib/activity';
import { formatDate, exportToCSV } from '@/lib/utils';
import { useFilters } from '@/lib/useFilters';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import { TableSkeleton } from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import type { InventoryItem, InventoryMovement } from '@/lib/supabase';

const CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'EGP'];

export default function Inventory() {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters({ categoryFilter: 'all', stockFilter: 'all' });
  const [showAdd, setShowAdd] = useState(false);
  const [showMovement, setShowMovement] = useState<InventoryItem | null>(null);
  const [showHistory, setShowHistory] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);

  const [form, setForm] = useState({
    name: '', sku: '', category: '', quantity: 0, low_stock_threshold: 5,
    unit_cost: 0, unit_price: 0, currency: 'AED', supplier: '', notes: '',
  });
  const [movementForm, setMovementForm] = useState({ type: 'stock_in' as 'stock_in' | 'stock_out' | 'adjustment', quantity: 0, reason: '', reference: '' });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('inventory_items').select('*').order('created_at', { ascending: false });
    if (!error) setItems((data || []) as InventoryItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))] as string[], [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !(item.sku || '').toLowerCase().includes(search.toLowerCase())) return false;
      if (applied.categoryFilter !== 'all' && item.category !== applied.categoryFilter) return false;
      if (applied.stockFilter === 'low' && item.quantity > item.low_stock_threshold) return false;
      if (applied.stockFilter === 'out' && item.quantity > 0) return false;
      return true;
    });
  }, [items, search, applied]);

  const lowStockCount = items.filter((i) => i.quantity <= i.low_stock_threshold).length;
  const outOfStockCount = items.filter((i) => i.quantity <= 0).length;
  const totalValue = items.reduce((sum, i) => sum + (i.quantity * i.unit_cost), 0);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast('error', 'Item name is required'); return; }
    const { data, error } = await supabase.from('inventory_items').insert({
      name: form.name.trim(), sku: form.sku.trim() || null, category: form.category.trim() || null,
      quantity: form.quantity, low_stock_threshold: form.low_stock_threshold,
      unit_cost: form.unit_cost, unit_price: form.unit_price, currency: form.currency,
      supplier: form.supplier.trim() || null, notes: form.notes.trim() || null, created_by: user?.id,
    }).select().single();
    if (error) { toast('error', 'Failed to add item'); return; }
    if (form.quantity !== 0) {
      await supabase.from('inventory_movements').insert({
        item_id: (data as InventoryItem).id, type: 'stock_in', quantity: form.quantity,
        reason: 'Initial stock', created_by: user?.id,
      });
    }
    await logActivity('added inventory item', form.name, (data as InventoryItem).id);
    toast('success', 'Item added to inventory');
    setShowAdd(false);
    setForm({ name: '', sku: '', category: '', quantity: 0, low_stock_threshold: 5, unit_cost: 0, unit_price: 0, currency: 'AED', supplier: '', notes: '' });
    fetchItems();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This will also delete all its movement history.`)) return;
    const { error } = await supabase.from('inventory_items').delete().eq('id', id);
    if (error) { toast('error', 'Failed to delete item'); return; }
    toast('success', 'Item deleted');
    fetchItems();
  };

  const handleMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showMovement) return;
    if (movementForm.quantity === 0) { toast('error', 'Quantity must be non-zero'); return; }
    const qty = movementForm.type === 'stock_out' ? -Math.abs(movementForm.quantity) : movementForm.type === 'adjustment' ? movementForm.quantity : Math.abs(movementForm.quantity);
    const newQty = showMovement.quantity + qty;
    if (newQty < 0) { toast('error', 'Not enough stock available'); return; }
    const { error: moveErr } = await supabase.from('inventory_movements').insert({
      item_id: showMovement.id, type: movementForm.type, quantity: qty,
      reason: movementForm.reason.trim() || null, reference: movementForm.reference.trim() || null, created_by: user?.id,
    });
    if (moveErr) { toast('error', 'Failed to record movement'); return; }
    const { error: itemErr } = await supabase.from('inventory_items').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', showMovement.id);
    if (itemErr) { toast('error', 'Failed to update stock'); return; }
    toast('success', `Stock updated — new quantity: ${newQty}`);
    setShowMovement(null);
    setMovementForm({ type: 'stock_in', quantity: 0, reason: '', reference: '' });
    fetchItems();
  };

  const viewHistory = async (item: InventoryItem) => {
    setShowHistory(item);
    const { data } = await supabase
      .from('inventory_movements')
      .select(`*, created_by_profile:profiles!inventory_movements_created_by_fkey(*)`)
      .eq('item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setMovements((data || []) as InventoryMovement[]);
  };

  const exportCsv = () => {
    exportToCSV('inventory.csv', filtered.map((i) => ({
      Name: i.name, SKU: i.sku || '', Category: i.category || '', Quantity: i.quantity,
      LowStockThreshold: i.low_stock_threshold, UnitCost: i.unit_cost, UnitPrice: i.unit_price,
      Currency: i.currency, Supplier: i.supplier || '', StockValue: (i.quantity * i.unit_cost).toFixed(2),
    })));
    toast('success', 'Inventory exported to CSV');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} items in stock</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportCsv} className="btn-secondary"><Download className="w-4 h-4" /> Export CSV</button>
          <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Item</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-info-500/10 flex items-center justify-center"><Package className="w-5 h-5 text-info-400" /></div><div><p className="text-2xl font-bold text-white">{items.length}</p><p className="text-xs text-gray-500">Total Items</p></div></div></div>
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-warning-500/10 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-warning-400" /></div><div><p className="text-2xl font-bold text-white">{lowStockCount}</p><p className="text-xs text-gray-500">Low Stock</p></div></div></div>
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-error-500/10 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-error-400" /></div><div><p className="text-2xl font-bold text-white">{outOfStockCount}</p><p className="text-xs text-gray-500">Out of Stock</p></div></div></div>
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-success-500/10 flex items-center justify-center"><Package className="w-5 h-5 text-success-400" /></div><div><p className="text-2xl font-bold text-white">{totalValue.toFixed(0)}</p><p className="text-xs text-gray-500">Stock Value (AED)</p></div></div></div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or SKU..." className="input pl-10" />
          </div>
          <select value={draft.categoryFilter} onChange={(e) => setDraftValue('categoryFilter', e.target.value)} className="select text-sm">
            <option value="all">All Categories</option>
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select value={draft.stockFilter} onChange={(e) => setDraftValue('stockFilter', e.target.value)} className="select text-sm">
            <option value="all">All Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
          {hasChanges && <button onClick={apply} className="btn-primary text-sm"><Check className="w-4 h-4" /> Apply</button>}
          {(draft.categoryFilter !== 'all' || draft.stockFilter !== 'all') && <button onClick={clear} className="btn-ghost text-sm"><X className="w-4 h-4" /> Clear</button>}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No inventory items found" subMessage="Add items to start tracking your stock" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                  <th className="px-4 py-3 font-medium">Item Name</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Unit Cost</th>
                  <th className="px-4 py-3 font-medium">Unit Price</th>
                  <th className="px-4 py-3 font-medium">Stock Value</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isLow = item.quantity <= item.low_stock_threshold;
                  const isOut = item.quantity <= 0;
                  return (
                    <tr key={item.id} className="table-row">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white text-sm">{item.name}</span>
                          {isOut ? <Badge variant="error">Out</Badge> : isLow ? <Badge variant="warning">Low</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{item.sku || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{item.category || '—'}</td>
                      <td className="px-4 py-3"><span className={`text-sm font-medium ${isOut ? 'text-error-400' : isLow ? 'text-warning-400' : 'text-white'}`}>{item.quantity}</span><span className="text-xs text-gray-600 ml-1">/ {item.low_stock_threshold}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-400">{item.unit_cost.toFixed(2)} {item.currency}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{item.unit_price.toFixed(2)} {item.currency}</td>
                      <td className="px-4 py-3 text-sm text-white">{(item.quantity * item.unit_cost).toFixed(2)} {item.currency}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setShowMovement(item)} className="p-1.5 rounded-lg text-gray-500 hover:text-success-400 hover:bg-success-500/10 transition-colors" title="Adjust stock"><ArrowUpCircle className="w-4 h-4" /></button>
                          <button onClick={() => viewHistory(item)} className="p-1.5 rounded-lg text-gray-500 hover:text-accent-400 hover:bg-accent-500/10 transition-colors" title="Movement history"><History className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(item.id, item.name)} className="p-1.5 rounded-lg text-gray-500 hover:text-error-400 hover:bg-error-500/10 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Inventory Item" size="lg">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Item Name *</label><input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="e.g. Royal Canin Dog Food 15kg" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">SKU</label><input type="text" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="input" placeholder="Stock keeping unit" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Category</label><input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input" placeholder="e.g. Food, Accessories, Medicine" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Supplier</label><input type="text" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="input" placeholder="Supplier name" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Initial Quantity</label><input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })} className="input" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Low Stock Alert At</label><input type="number" min="0" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: parseInt(e.target.value) || 0 })} className="input" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Unit Cost</label><input type="number" min="0" step="any" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: parseFloat(e.target.value) || 0 })} className="input" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Unit Price</label><input type="number" min="0" step="any" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: parseFloat(e.target.value) || 0 })} className="input" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Currency</label><select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="select">{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-[60px]" placeholder="Additional notes..." /></div>
          <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary">Add Item</button></div>
        </form>
      </Modal>

      {/* Stock Movement Modal */}
      <Modal open={!!showMovement} onClose={() => setShowMovement(null)} title={`Adjust Stock — ${showMovement?.name || ''}`} size="md">
        {showMovement && (
          <form onSubmit={handleMovement} className="space-y-4">
            <div className="p-3 rounded-lg bg-primary-950/40 border border-primary-800 text-sm text-gray-400">
              Current stock: <span className="text-white font-medium">{showMovement.quantity}</span> units
            </div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Movement Type</label>
              <select value={movementForm.type} onChange={(e) => setMovementForm({ ...movementForm, type: e.target.value as 'stock_in' | 'stock_out' | 'adjustment' })} className="select">
                <option value="stock_in">Stock In (add)</option>
                <option value="stock_out">Stock Out (remove)</option>
                <option value="adjustment">Adjustment (set difference)</option>
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Quantity</label><input type="number" required value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: parseInt(e.target.value) || 0 })} className="input" placeholder="Number of units" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Reason</label><input type="text" value={movementForm.reason} onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })} className="input" placeholder="e.g. New shipment, Damaged, Sale" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Reference (optional)</label><input type="text" value={movementForm.reference} onChange={(e) => setMovementForm({ ...movementForm, reference: e.target.value })} className="input" placeholder="e.g. PO-1234, Invoice number" /></div>
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowMovement(null)} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary">Save Movement</button></div>
          </form>
        )}
      </Modal>

      {/* History Modal */}
      <Modal open={!!showHistory} onClose={() => setShowHistory(null)} title={`Movement History — ${showHistory?.name || ''}`} size="lg">
        {movements.length === 0 ? (
          <EmptyState message="No movements yet" subMessage="Stock movements will appear here" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="text-left text-xs text-gray-500 uppercase border-b border-primary-800"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">By</th></tr></thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-primary-800/50">
                    <td className="px-3 py-2 text-sm text-gray-400">{formatDate(m.created_at)}</td>
                    <td className="px-3 py-2"><Badge variant={m.type === 'stock_in' ? 'success' : m.type === 'stock_out' ? 'error' : 'info'}>{m.type.replace('_', ' ')}</Badge></td>
                    <td className={`px-3 py-2 text-sm font-medium ${m.quantity > 0 ? 'text-success-400' : 'text-error-400'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                    <td className="px-3 py-2 text-sm text-gray-400">{m.reason || '—'}</td>
                    <td className="px-3 py-2 text-sm text-gray-500">{m.created_by_profile?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
