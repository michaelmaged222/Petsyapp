import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Download, Search, Eye, Trash2, FileText, Send, Printer, X, Check } from 'lucide-react';
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
import type { Invoice, InvoiceItem, Client } from '@/lib/supabase';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'error' | 'neutral'> = {
  draft: 'neutral', sent: 'info', paid: 'success', overdue: 'error', cancelled: 'warning',
};

const CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'EGP'];

interface InvoiceSettings {
  app_logo_url: string | null;
  watermark_url: string | null;
  company_name: string | null;
  company_tagline: string | null;
  company_email: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c] || c);
}

async function generateInvoiceHtml(invoice: Invoice, items: InvoiceItem[], settings: InvoiceSettings | null): Promise<string> {
  const companyName = settings?.company_name?.trim() || 'PUPPYFY UAE';
  const companyTagline = settings?.company_tagline?.trim() || 'Premium Puppies · United Arab Emirates';
  const companyEmail = settings?.company_email?.trim() || 'puppyfyuae2000@gmail.com';

  const logoSrc = settings?.app_logo_url || '/puppyfy-logo.webp';
  const logoDataUrl = settings?.app_logo_url ? logoSrc : await fetch(logoSrc).then(r => r.blob()).then(b => new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(b);
  })).catch(() => '/puppyfy-logo.webp');
  const watermarkUrl = settings?.watermark_url || logoDataUrl;

  const rows = items.map(item => `
    <tr>
      <td>${escapeHtml(item.description)}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:right">${item.unit_price.toFixed(2)} ${escapeHtml(invoice.currency)}</td>
      <td style="text-align:right">${item.total.toFixed(2)} ${escapeHtml(invoice.currency)}</td>
    </tr>
  `).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(invoice.invoice_number)}</title><style>
    @page{size:A4;margin:0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#d4d4d8;font-family:'Times New Roman',Georgia,serif;color:#111;font-size:11.5pt;line-height:1.6}
    .page{position:relative;width:210mm;min-height:297mm;margin:14px auto;background:#fff;padding:18mm 14mm 14mm;border:4px double #111;box-shadow:0 2px 12px rgba(0,0,0,.12);overflow:hidden}
    .watermark{position:absolute;top:50%;left:50%;width:130mm;height:130mm;object-fit:contain;transform:translate(-50%,-50%);opacity:.045;pointer-events:none;z-index:0}
    .page-content{position:relative;z-index:1;max-width:182mm;margin:0 auto}
    .page-footer{position:absolute;bottom:6mm;left:14mm;right:14mm;display:flex;justify-content:space-between;font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#555;border-top:1px solid #ccc;padding-top:2mm;z-index:1}
    .letterhead{text-align:center;margin-bottom:6mm;padding-bottom:5mm;border-bottom:3px double #0f3d2e}
    .logo-img{width:64px;height:64px;object-fit:contain;margin-bottom:6px}
    .company-name{font-family:Arial,Helvetica,sans-serif;font-size:24pt;font-weight:700;color:#0f3d2e;letter-spacing:4px}
    .company-tagline{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#444;letter-spacing:2px;margin-top:2px;text-transform:uppercase}
    .company-contact{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#666;margin-top:2px}
    .doc-title-bar{text-align:center;margin-bottom:6mm;padding:5mm 0;background:linear-gradient(135deg,#0f3d2e 0%,#1a5a44 100%);border:2px solid #c9a96e}
    .doc-title-bar h1{font-size:18pt;color:#fff;letter-spacing:1px;font-weight:400;text-decoration:underline}
    .invoice-meta{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#c9a96e;margin-top:3px;letter-spacing:1px}
    .parties{display:flex;justify-content:space-between;margin-bottom:6mm;gap:10mm}
    .party-box{flex:1;padding:4mm 5mm;border:1px solid #ccc;border-radius:3px}
    .party-label{font-size:9px;text-transform:uppercase;color:#888;letter-spacing:1px;margin-bottom:4px}
    .party-name{font-size:13pt;font-weight:600;color:#0f3d2e}
    .party-detail{font-size:11px;color:#555;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin-bottom:5mm}
    th{background:#0f3d2e;color:#fff;padding:10px 12px;font-size:10px;text-transform:uppercase;letter-spacing:1px}
    td{padding:10px 12px;border-bottom:1px solid #ddd;font-size:11px}
    tbody tr:nth-child(even){background:#f8fafc}
    .totals{margin-left:auto;width:300px;margin-bottom:5mm}
    .total-row{display:flex;justify-content:space-between;padding:6px 12px;font-size:12px;border-bottom:1px solid #eee}
    .total-row.grand{border-top:2px solid #0f3d2e;border-bottom:none;margin-top:5px;padding-top:12px;font-size:15px;font-weight:700;color:#0f3d2e;background:#f8fafc}
    .notes{margin-top:5mm;padding:4mm 5mm;background:#f8f8f8;border:1px solid #ddd;border-radius:4px;font-size:11px;color:#555}
    .status-stamp{display:inline-block;padding:2mm 6mm;border:2px solid #c9a96e;border-radius:3px;font-family:Arial,Helvetica,sans-serif;font-size:12pt;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#0f3d2e;margin-bottom:4mm}
    @media print{body{background:#fff}.page{margin:0;box-shadow:none;page-break-after:always}.page:last-child{page-break-after:auto}.watermark{opacity:.08}}
    @media screen and (max-width:900px){.page{transform-origin:top left;transform:scale(.72);margin-bottom:-82mm}}
  </style></head><body>
    <article class="page">
      <img src="${watermarkUrl}" alt="" class="watermark" />
      <div class="page-content">
        <div class="letterhead">
          <img src="${logoDataUrl}" alt="${escapeHtml(companyName)} Logo" class="logo-img" />
          <div class="company-name">${escapeHtml(companyName)}</div>
          <div class="company-tagline">${escapeHtml(companyTagline)}</div>
          <div class="company-contact">${escapeHtml(companyEmail)}</div>
        </div>
        <div class="doc-title-bar">
          <h1>INVOICE</h1>
          <div class="invoice-meta">Invoice No. ${escapeHtml(invoice.invoice_number)}</div>
        </div>
        <div style="text-align:center;margin-bottom:5mm">
          <span class="status-stamp">${escapeHtml(invoice.status)}</span>
        </div>
        <div class="parties">
          <div class="party-box">
            <div class="party-label">From</div>
            <div class="party-name">${escapeHtml(companyName)}</div>
            <div class="party-detail">${escapeHtml(companyEmail)}</div>
          </div>
          <div class="party-box">
            <div class="party-label">Bill To</div>
            <div class="party-name">${escapeHtml(invoice.client_name)}</div>
            ${invoice.client_email ? `<div class="party-detail">${escapeHtml(invoice.client_email)}</div>` : ''}
            ${invoice.client_phone ? `<div class="party-detail">${escapeHtml(invoice.client_phone)}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-bottom:4mm;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#555">
          <div style="text-align:right">
            <div><strong>Issue Date:</strong> ${formatDate(invoice.issue_date)}</div>
            ${invoice.due_date ? `<div><strong>Due Date:</strong> ${formatDate(invoice.due_date)}</div>` : ''}
          </div>
        </div>
        <table>
          <thead><tr><th style="text-align:left">Description</th><th>Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div class="total-row"><span>Subtotal</span><span>${invoice.subtotal.toFixed(2)} ${escapeHtml(invoice.currency)}</span></div>
          ${invoice.vat_enabled ? `<div class="total-row"><span>VAT (${invoice.vat_rate}%)</span><span>${invoice.vat_amount.toFixed(2)} ${escapeHtml(invoice.currency)}</span></div>` : ''}
          ${invoice.discount > 0 ? `<div class="total-row"><span>Discount</span><span>-${invoice.discount.toFixed(2)} ${escapeHtml(invoice.currency)}</span></div>` : ''}
          <div class="total-row grand"><span>Total</span><span>${invoice.total.toFixed(2)} ${escapeHtml(invoice.currency)}</span></div>
        </div>
        ${invoice.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(invoice.notes)}</div>` : ''}
      </div>
      <div class="page-footer">
        <span>${escapeHtml(companyName)}</span>
        <span>${escapeHtml(invoice.invoice_number)}</span>
        <span>${formatDate(invoice.issue_date)}</span>
      </div>
    </article>
  </body></html>`;
}

export default function Invoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters({ dateFrom: '', dateTo: '', statusFilter: 'all', currencyFilter: 'all' });
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<Invoice | null>(null);
  const [detailItems, setDetailItems] = useState<InvoiceItem[]>([]);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [previewItems, setPreviewItems] = useState<InvoiceItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  const [form, setForm] = useState({
    client_id: '', client_name: '', client_email: '', client_phone: '',
    issue_date: new Date().toISOString().split('T')[0], due_date: '',
    currency: 'AED', vat_enabled: false, vat_rate: 5, discount: 0, notes: '',
  });
  const [lineItems, setLineItems] = useState<{ description: string; quantity: number; unit_price: number }[]>([
    { description: '', quantity: 1, unit_price: 0 },
  ]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select(`*, created_by_profile:profiles!invoices_created_by_fkey(*)`)
      .order('created_at', { ascending: false });
    if (!error) setInvoices((data || []) as Invoice[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInvoices();
    supabase.from('clients').select('*').order('name').then(({ data }) => setClients((data || []) as Client[]));
  }, [fetchInvoices]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (search && !inv.invoice_number.toLowerCase().includes(search.toLowerCase()) && !inv.client_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (applied.dateFrom && inv.issue_date < applied.dateFrom) return false;
      if (applied.dateTo && inv.issue_date > applied.dateTo) return false;
      if (applied.statusFilter !== 'all' && inv.status !== applied.statusFilter) return false;
      if (applied.currencyFilter !== 'all' && inv.currency !== applied.currencyFilter) return false;
      return true;
    });
  }, [invoices, search, applied]);

  const calcSubtotal = () => lineItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const calcVat = () => form.vat_enabled ? (calcSubtotal() * form.vat_rate / 100) : 0;
  const calcTotal = () => calcSubtotal() + calcVat() - (form.discount || 0);

  const selectClient = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setForm((f) => ({ ...f, client_id: client.id, client_name: client.name, client_email: client.email || '', client_phone: client.phone || '' }));
    } else {
      setForm((f) => ({ ...f, client_id: '', client_name: '', client_email: '', client_phone: '' }));
    }
  };

  const fetchSettings = async (): Promise<InvoiceSettings | null> => {
    const { data } = await supabase.from('contract_settings').select('app_logo_url, watermark_url, company_name, company_tagline, company_email').eq('id', 1).maybeSingle();
    return (data as InvoiceSettings) || null;
  };

  const buildPreview = async (invoice: Invoice, items: InvoiceItem[]) => {
    setGeneratingPreview(true);
    const settings = await fetchSettings();
    const html = await generateInvoiceHtml(invoice, items, settings);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    setGeneratingPreview(false);
  };

  const openPreview = async (inv: Invoice) => {
    setPreviewInvoice(inv);
    setPreviewUrl(null);
    const { data } = await supabase.from('invoice_items').select('*').eq('invoice_id', inv.id).order('created_at');
    const items = (data || []) as InvoiceItem[];
    setPreviewItems(items);
    await buildPreview(inv, items);
  };

  const closePreview = () => {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    setPreviewInvoice(null);
    setPreviewItems([]);
  };

  const printPreview = () => {
    const iframe = document.getElementById('invoice-preview-frame') as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_name.trim()) { toast('error', 'Client name is required'); return; }
    if (lineItems.every((item) => !item.description.trim())) { toast('error', 'Add at least one line item'); return; }

    const countRes = await supabase.from('invoices').select('id', { count: 'exact', head: true });
    const nextNum = (countRes.count || 0) + 1;
    const invoiceNumber = `INV-${String(nextNum).padStart(4, '0')}`;

    const subtotal = calcSubtotal();
    const vatAmount = calcVat();
    const total = calcTotal();

    const { data, error } = await supabase.from('invoices').insert({
      invoice_number: invoiceNumber,
      client_id: form.client_id || null,
      client_name: form.client_name.trim(),
      client_email: form.client_email.trim() || null,
      client_phone: form.client_phone.trim() || null,
      issue_date: form.issue_date,
      due_date: form.due_date || null,
      subtotal,
      vat_enabled: form.vat_enabled,
      vat_rate: form.vat_rate,
      vat_amount: vatAmount,
      discount: form.discount,
      total,
      currency: form.currency,
      status: 'draft',
      notes: form.notes.trim() || null,
      created_by: user?.id,
    }).select().single();

    if (error) { toast('error', 'Failed to create invoice'); return; }
    const invoiceId = (data as Invoice).id;
    const createdInvoice = data as Invoice;

    const itemsToInsert = lineItems.filter((item) => item.description.trim()).map((item) => ({
      invoice_id: invoiceId,
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.quantity * item.unit_price,
    }));
    let createdItems: InvoiceItem[] = [];
    if (itemsToInsert.length > 0) {
      const { data: insertedItems } = await supabase.from('invoice_items').insert(itemsToInsert).select('*');
      createdItems = (insertedItems || []) as InvoiceItem[];
    }

    await logActivity('created invoice', invoiceNumber, invoiceId);
    toast('success', `Invoice ${invoiceNumber} created`);
    setShowCreate(false);
    setForm({ client_id: '', client_name: '', client_email: '', client_phone: '', issue_date: new Date().toISOString().split('T')[0], due_date: '', currency: 'AED', vat_enabled: false, vat_rate: 5, discount: 0, notes: '' });
    setLineItems([{ description: '', quantity: 1, unit_price: 0 }]);
    fetchInvoices();
    openPreview(createdInvoice);
  };

  const handleDelete = async (id: string, number: string) => {
    if (!confirm(`Delete invoice ${number}?`)) return;
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) { toast('error', 'Failed to delete invoice'); return; }
    toast('success', 'Invoice deleted');
    fetchInvoices();
  };

  const updateStatus = async (id: string, status: string, number: string) => {
    const { error } = await supabase.from('invoices').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast('error', 'Failed to update status'); return; }
    toast('success', `Invoice ${number} marked as ${status}`);
    fetchInvoices();
    if (showDetail?.id === id) setShowDetail({ ...showDetail, status: status as Invoice['status'] });
  };

  const viewDetail = async (inv: Invoice) => {
    setShowDetail(inv);
    const { data } = await supabase.from('invoice_items').select('*').eq('invoice_id', inv.id).order('created_at');
    setDetailItems((data || []) as InvoiceItem[]);
  };

  const sendInvoice = async (inv: Invoice) => {
    if (!inv.client_email) { toast('error', 'This invoice has no client email'); return; }
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          to: inv.client_email,
          subject: `Invoice ${inv.invoice_number} from ${inv.client_name}`,
          body: `Dear ${inv.client_name},\n\nPlease find your invoice ${inv.invoice_number} attached.\n\nTotal: ${inv.total.toFixed(2)} ${inv.currency}\n\nThank you for your business.`,
        }),
      });
      if (response.ok) {
        await updateStatus(inv.id, 'sent', inv.invoice_number);
        toast('success', 'Invoice sent and marked as sent');
      } else {
        toast('info', 'Email sending requires API configuration');
      }
    } catch {
      toast('info', 'Email sending requires API configuration');
    }
  };

  const exportCsv = () => {
    exportToCSV('invoices.csv', filtered.map((inv) => ({
      InvoiceNumber: inv.invoice_number, Client: inv.client_name, IssueDate: formatDate(inv.issue_date),
      DueDate: inv.due_date ? formatDate(inv.due_date) : '', Subtotal: inv.subtotal, VAT: inv.vat_amount,
      Discount: inv.discount, Total: inv.total, Currency: inv.currency, Status: inv.status,
    })));
    toast('success', 'Invoices exported to CSV');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} invoices total</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportCsv} className="btn-secondary"><Download className="w-4 h-4" /> Export CSV</button>
          <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Invoice</button>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by invoice number or client..." className="input pl-10" />
          </div>
          <input type="date" value={draft.dateFrom} onChange={(e) => setDraftValue('dateFrom', e.target.value)} className="input text-sm w-auto" />
          <input type="date" value={draft.dateTo} onChange={(e) => setDraftValue('dateTo', e.target.value)} className="input text-sm w-auto" />
          <select value={draft.statusFilter} onChange={(e) => setDraftValue('statusFilter', e.target.value)} className="select text-sm">
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={draft.currencyFilter} onChange={(e) => setDraftValue('currencyFilter', e.target.value)} className="select text-sm">
            <option value="all">All Currencies</option>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {hasChanges && <button onClick={apply} className="btn-primary text-sm"><Check className="w-4 h-4" /> Apply</button>}
          {(draft.dateFrom || draft.dateTo || draft.statusFilter !== 'all' || draft.currencyFilter !== 'all') && <button onClick={clear} className="btn-ghost text-sm"><X className="w-4 h-4" /> Clear</button>}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No invoices found" subMessage="Create your first invoice to get started" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                  <th className="px-4 py-3 font-medium">Invoice #</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Issue Date</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id} className="table-row cursor-pointer" onClick={() => viewDetail(inv)}>
                    <td className="px-4 py-3 font-medium text-white text-sm">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{inv.client_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{inv.total.toFixed(2)} {inv.currency}</td>
                    <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[inv.status]}>{inv.status}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); openPreview(inv); }} className="p-1.5 rounded-lg text-gray-500 hover:text-accent-400 hover:bg-accent-500/10 transition-colors" title="Preview">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(inv.id, inv.invoice_number); }} className="p-1.5 rounded-lg text-gray-500 hover:text-error-400 hover:bg-error-500/10 transition-colors" title="Delete">
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

      {/* Create Invoice Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Invoice" size="xl">
        <form onSubmit={handleCreate} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-3">
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Select Existing Client (optional)</label>
              <select value={form.client_id} onChange={(e) => selectClient(e.target.value)} className="select">
                <option value="">— Or type a new client below —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Client Name *</label>
              <input type="text" required value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} className="input" placeholder="Client name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Client Email</label>
              <input type="email" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} className="input" placeholder="client@email.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Client Phone</label>
              <input type="tel" value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} className="input" placeholder="+971..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Issue Date *</label>
              <input type="date" required value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Currency</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="select">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Line Items</label>
            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input type="text" value={item.description} onChange={(e) => { const next = [...lineItems]; next[idx] = { ...item, description: e.target.value }; setLineItems(next); }} className="input col-span-6" placeholder="Description" />
                  <input type="number" min="0" step="any" value={item.quantity} onChange={(e) => { const next = [...lineItems]; next[idx] = { ...item, quantity: parseFloat(e.target.value) || 0 }; setLineItems(next); }} className="input col-span-2" placeholder="Qty" />
                  <input type="number" min="0" step="any" value={item.unit_price} onChange={(e) => { const next = [...lineItems]; next[idx] = { ...item, unit_price: parseFloat(e.target.value) || 0 }; setLineItems(next); }} className="input col-span-2" placeholder="Unit Price" />
                  <div className="col-span-1 text-sm text-gray-400 text-right">{(item.quantity * item.unit_price).toFixed(2)}</div>
                  <button type="button" onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))} className="col-span-1 p-1.5 rounded-lg text-gray-500 hover:text-error-400 hover:bg-error-500/10 transition-colors">
                    {lineItems.length > 1 ? <X className="w-4 h-4 mx-auto" /> : null}
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setLineItems([...lineItems, { description: '', quantity: 1, unit_price: 0 }])} className="btn-ghost text-sm mt-2"><Plus className="w-4 h-4" /> Add Line Item</button>
          </div>

          {/* Totals & Options */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.vat_enabled} onChange={(e) => setForm({ ...form, vat_enabled: e.target.checked })} className="w-5 h-5 rounded accent-accent-500" />
                <span className="text-sm text-gray-300">Enable VAT</span>
              </label>
              {form.vat_enabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">VAT Rate (%)</label>
                  <input type="number" min="0" max="100" step="0.01" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: parseFloat(e.target.value) || 0 })} className="input" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Discount (flat amount)</label>
                <input type="number" min="0" step="any" value={form.discount} onChange={(e) => setForm({ ...form, discount: parseFloat(e.target.value) || 0 })} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-[60px]" placeholder="Payment terms, notes..." />
              </div>
            </div>
            <div className="card p-4 space-y-2 self-start">
              <div className="flex justify-between text-sm text-gray-400"><span>Subtotal</span><span>{calcSubtotal().toFixed(2)} {form.currency}</span></div>
              {form.vat_enabled && <div className="flex justify-between text-sm text-gray-400"><span>VAT ({form.vat_rate}%)</span><span>{calcVat().toFixed(2)} {form.currency}</span></div>}
              {form.discount > 0 && <div className="flex justify-between text-sm text-gray-400"><span>Discount</span><span>-{form.discount.toFixed(2)} {form.currency}</span></div>}
              <div className="flex justify-between text-lg font-bold text-white border-t border-primary-800 pt-2"><span>Total</span><span>{calcTotal().toFixed(2)} {form.currency}</span></div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary">Create Invoice</button>
          </div>
        </form>
      </Modal>

      {/* Invoice Detail Modal */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title={showDetail?.invoice_number || ''} size="lg">
        {showDetail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant={STATUS_VARIANT[showDetail.status]}>{showDetail.status}</Badge>
              <div className="flex items-center gap-2">
                <button onClick={() => openPreview(showDetail)} className="btn-secondary text-sm"><Eye className="w-4 h-4" /> Preview</button>
                <button onClick={() => sendInvoice(showDetail)} className="btn-secondary text-sm"><Send className="w-4 h-4" /> Send</button>
                {showDetail.status !== 'paid' && <button onClick={() => updateStatus(showDetail.id, 'paid', showDetail.invoice_number)} className="btn-primary text-sm"><Check className="w-4 h-4" /> Mark Paid</button>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Client:</span> <span className="text-white font-medium">{showDetail.client_name}</span></div>
              <div><span className="text-gray-500">Issue Date:</span> <span className="text-white">{formatDate(showDetail.issue_date)}</span></div>
              {showDetail.client_email && <div><span className="text-gray-500">Email:</span> <span className="text-gray-400">{showDetail.client_email}</span></div>}
              {showDetail.due_date && <div><span className="text-gray-500">Due Date:</span> <span className="text-white">{formatDate(showDetail.due_date)}</span></div>}
            </div>
            <div className="overflow-hidden rounded-lg border border-primary-800">
              <table className="w-full">
                <thead><tr className="text-left text-xs text-gray-500 uppercase border-b border-primary-800"><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-center">Qty</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                <tbody>
                  {detailItems.map((item) => (
                    <tr key={item.id} className="border-b border-primary-800/50">
                      <td className="px-3 py-2 text-sm text-gray-300">{item.description}</td>
                      <td className="px-3 py-2 text-sm text-gray-400 text-center">{item.quantity}</td>
                      <td className="px-3 py-2 text-sm text-gray-400 text-right">{item.unit_price.toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm text-white text-right">{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>{showDetail.subtotal.toFixed(2)} {showDetail.currency}</span></div>
              {showDetail.vat_enabled && <div className="flex justify-between text-gray-400"><span>VAT ({showDetail.vat_rate}%)</span><span>{showDetail.vat_amount.toFixed(2)} {showDetail.currency}</span></div>}
              {showDetail.discount > 0 && <div className="flex justify-between text-gray-400"><span>Discount</span><span>-{showDetail.discount.toFixed(2)} {showDetail.currency}</span></div>}
              <div className="flex justify-between text-lg font-bold text-white border-t border-primary-800 pt-2"><span>Total</span><span>{showDetail.total.toFixed(2)} {showDetail.currency}</span></div>
            </div>
            {showDetail.notes && <div className="p-3 rounded-lg bg-primary-950/40 border border-primary-800 text-sm text-gray-400">{showDetail.notes}</div>}
          </div>
        )}
      </Modal>

      {/* Invoice Preview Modal */}
      <Modal open={!!previewInvoice} onClose={closePreview} title={previewInvoice ? `Preview — ${previewInvoice.invoice_number}` : ''} size="xl">
        {previewInvoice && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant={STATUS_VARIANT[previewInvoice.status]}>{previewInvoice.status}</Badge>
              <div className="flex items-center gap-2">
                <button onClick={printPreview} disabled={!previewUrl} className="btn-secondary text-sm"><Printer className="w-4 h-4" /> Print / Save PDF</button>
                <button onClick={() => sendInvoice(previewInvoice)} className="btn-secondary text-sm"><Send className="w-4 h-4" /> Send</button>
                {previewInvoice.status !== 'paid' && <button onClick={() => updateStatus(previewInvoice.id, 'paid', previewInvoice.invoice_number)} className="btn-primary text-sm"><Check className="w-4 h-4" /> Mark Paid</button>}
              </div>
            </div>
            {generatingPreview ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
              </div>
            ) : previewUrl ? (
              <iframe id="invoice-preview-frame" src={previewUrl} title="Invoice Preview" className="w-full h-[70vh] rounded-lg border border-primary-800 bg-gray-200" />
            ) : (
              <div className="text-center py-20 text-gray-500">Failed to generate preview</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
