import { useEffect, useState, useMemo, useRef } from 'react';
import { Plus, FileText, Send, Download, Search, Eye, ChevronLeft, ChevronRight, Check, Mail, Printer, Pencil, Trash2, AlertTriangle, Signature, DollarSign, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logActivity } from '@/lib/activity';
import { formatAED, formatDate, formatDateTime, calculateVAT, calculateNetAmount } from '@/lib/utils';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import { TableSkeleton } from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import type { Contract, ContractActivity, Client, Profile, SaleSource } from '@/lib/supabase';
import { SALE_SOURCE_OPTIONS, SALE_SOURCE_LABELS } from '@/lib/commission';
import { useFilters } from '@/lib/useFilters';

const STATUS_VARIANT: Record<string, 'neutral' | 'info' | 'success'> = {
  draft: 'neutral', sent: 'info', signed: 'success',
};

type Step = 1 | 2 | 3 | 4;

export default function Contracts({ onNavigateToSales }: { onNavigateToSales?: () => void }) {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [, setClients] = useState<Client[]>([]);
  const [salespeople, setSalespeople] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters({
    dateFrom: '', dateTo: '', statusFilter: 'all',
  });
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState<Contract | null>(null);
  const [activities, setActivities] = useState<ContractActivity[]>([]);
  const [step, setStep] = useState<Step>(1);
  const [stepError, setStepError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [createdContract, setCreatedContract] = useState<Contract | null>(null);
  const [sending, setSending] = useState(false);
  const [showEdit, setShowEdit] = useState<Contract | null>(null);
  const [showDelete, setShowDelete] = useState<Contract | null>(null);
  const [editForm, setEditForm] = useState({
    buyer_name: '', buyer_email: '', buyer_id_passport: '', buyer_phone: '',
    contract_date: '', puppy_dob: '', puppy_gender: 'male', breed: '', color: '', microchip_number: '',
    type: 'local', importing_country: '',
    purchase_price: '0', down_payment: '0', remaining_balance: '0',
    vat_enabled: false, handover_date: '',
    sale_source: 'direct_walkin' as SaleSource,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailPreviewUrl, setDetailPreviewUrl] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [creatingSale, setCreatingSale] = useState(false);
  const previewRef = useRef<HTMLIFrameElement>(null);

  const [form, setForm] = useState({
    buyer_name: '', buyer_email: '', buyer_id_passport: '', buyer_phone: '',
    contract_date: new Date().toISOString().split('T')[0],
    salesman_id: '',
    puppy_dob: '', puppy_gender: 'male', breed: '', color: '', microchip_number: '',
    type: 'local', importing_country: '',
    purchase_price: '0', down_payment: '0', remaining_balance: '0',
    vat_enabled: false,
    handover_date: '',
    sale_source: 'direct_walkin' as SaleSource,
  });

  const fetchData = async () => {
    setLoading(true);
    const [contractsRes, clientsRes, profilesRes] = await Promise.all([
      supabase.from('contracts').select(`*, client:clients!contracts_client_id_fkey(*), created_by_profile:profiles!contracts_created_by_fkey(*)`).order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('name'),
      supabase.from('profiles').select('*').order('name'),
    ]);
    setContracts((contractsRes.data || []) as Contract[]);
    setClients((clientsRes.data || []) as Client[]);
    setSalespeople((profilesRes.data || []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (search && !c.contract_number?.toLowerCase().includes(search.toLowerCase()) && !c.buyer_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (applied.dateFrom && c.contract_date && c.contract_date < applied.dateFrom) return false;
      if (applied.dateTo && c.contract_date && c.contract_date > applied.dateTo) return false;
      if (applied.statusFilter !== 'all' && c.status !== applied.statusFilter) return false;
      return true;
    });
  }, [contracts, search, applied]);

  const goToNext = () => {
    setStepError('');
    setStep((step + 1) as Step);
  };

  const handleCreate = async () => {
    const basePrice = parseFloat(form.purchase_price) || 0;
    const vatAmount = form.vat_enabled ? basePrice * 0.05 : 0;
    const totalAmount = basePrice + vatAmount;
    const { data, error } = await supabase.from('contracts').insert({
      buyer_name: form.buyer_name,
      buyer_email: form.buyer_email || null,
      buyer_phone: form.buyer_phone || null,
      buyer_id_passport: form.buyer_id_passport || null,
      contract_date: form.contract_date,
      puppy_dob: form.puppy_dob || null,
      puppy_gender: form.puppy_gender,
      breed: form.breed || null,
      color: form.color || null,
      microchip_number: form.microchip_number || null,
      importing_country: form.type === 'imported' ? form.importing_country || null : null,
      purchase_price: basePrice,
      down_payment: parseFloat(form.down_payment) || 0,
      remaining_balance: parseFloat(form.remaining_balance) || 0,
      type: form.type,
      amount: basePrice,
      vat_enabled: form.vat_enabled,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      handover_date: form.handover_date || null,
      sale_source: form.sale_source,
      status: 'draft',
      created_by: form.salesman_id || user?.id,
    }).select().single();
    if (error) { toast('error', 'Failed to create contract'); return; }
    const newContract = data as Contract;
    await logActivity('created contract', newContract.contract_number || '', newContract.id);
    await supabase.from('contract_activity').insert({ contract_id: newContract.id, action: 'Contract created' });

    if (form.handover_date) {
      await supabase.from('calendar_events').insert({
        title: `Handover: ${form.buyer_name}`,
        type: 'handover',
        date: form.handover_date,
        linked_id: newContract.id,
        linked_type: 'contract',
        created_by: user?.id,
      });
    }

    setCreatedContract(newContract);
    generatePreview(newContract);
    setStep(4);
    toast('success', 'Contract created — review and export the PDF below');
  };

  const generatePreview = async (contract: Contract) => {
    const { data } = await supabase.from('contract_settings').select('seller_signature_url, seller_stamp_url, app_logo_url, watermark_url, company_contract_url, company_name, company_tagline, company_email').eq('id', 1).maybeSingle();
    const html = await generateContractHtml(contract, (data as { seller_signature_url: string | null; seller_stamp_url: string | null; app_logo_url: string | null; watermark_url: string | null; company_contract_url: string | null; company_name: string | null; company_tagline: string | null; company_email: string | null }) || null);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
  };

  const handlePrintPdf = () => {
    if (previewRef.current?.contentWindow) {
      previewRef.current.contentWindow.focus();
      previewRef.current.contentWindow.print();
      toast('info', 'In the print dialog, choose "Save as PDF" to export the contract as a PDF file');
    }
  };

  const handleSendEmail = async () => {
    if (!createdContract) return;
    setSending(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ type: 'contract_pdf', to: createdContract.buyer_email, contractId: createdContract.id }),
      });
      if (response.ok) {
        await supabase.from('contracts').update({ status: 'sent' }).eq('id', createdContract.id);
        await supabase.from('contract_activity').insert({ contract_id: createdContract.id, action: 'Contract PDF sent to client' });
        await logActivity('sent contract PDF', createdContract.contract_number || '', createdContract.id);
        toast('success', 'Contract sent to client email');
      } else {
        toast('info', 'Email sending requires SMTP configuration');
      }
    } catch {
      toast('info', 'Email sending requires SMTP configuration');
    }
    setSending(false);
  };

  const handleCloseWizard = () => {
    setShowAdd(false);
    setStep(1);
    setStepError('');
    setCreatedContract(null);
    setSaleSentFromWizard(false);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    setForm({ buyer_name: '', buyer_email: '', buyer_id_passport: '', buyer_phone: '', contract_date: new Date().toISOString().split('T')[0], salesman_id: '', puppy_dob: '', puppy_gender: 'male', breed: '', color: '', microchip_number: '', type: 'local', importing_country: '', purchase_price: '0', down_payment: '0', remaining_balance: '0', vat_enabled: false, handover_date: '', sale_source: 'direct_walkin' as SaleSource });
    fetchData();
  };

  const handleSendPDF = async (contract: Contract) => {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ type: 'contract_pdf', to: contract.buyer_email, contractId: contract.id }),
      });
      if (response.ok) {
        await supabase.from('contracts').update({ status: 'sent' }).eq('id', contract.id);
        await supabase.from('contract_activity').insert({ contract_id: contract.id, action: 'Contract PDF sent to client' });
        await logActivity('sent contract PDF', contract.contract_number || '', contract.id);
        toast('success', 'Contract PDF sent to client');
        fetchData();
      } else {
        toast('info', 'Email sending requires SMTP configuration');
      }
    } catch {
      toast('info', 'Email sending requires SMTP configuration');
    }
  };

  const openDetail = async (contract: Contract) => {
    setShowDetail(contract);
    setDetailPreviewUrl(null);
    const { data } = await supabase
      .from('contract_activity')
      .select('*')
      .eq('contract_id', contract.id)
      .order('created_at', { ascending: false });
    setActivities((data || []) as ContractActivity[]);
    await supabase.from('contract_activity').insert({ contract_id: contract.id, action: 'Contract viewed' });
    generateDetailPreview(contract);
  };

  const handleSign = async () => {
    if (!showDetail) return;
    const { error } = await supabase.from('contracts').update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signature_data: `Signed by ${showDetail.buyer_name} on ${new Date().toISOString()}`,
    }).eq('id', showDetail.id);
    if (error) { toast('error', 'Failed to sign contract'); return; }
    await supabase.from('contract_activity').insert({ contract_id: showDetail.id, action: 'Contract digitally signed' });
    await logActivity('signed contract', showDetail.contract_number || '', showDetail.id);
    toast('success', 'Contract signed successfully');
    setShowDetail({ ...showDetail, status: 'signed', signed_at: new Date().toISOString() });
    fetchData();
  };

  const openEdit = (contract: Contract) => {
    setShowEdit(contract);
    setEditForm({
      buyer_name: contract.buyer_name || '',
      buyer_email: contract.buyer_email || '',
      buyer_id_passport: contract.buyer_id_passport || '',
      buyer_phone: contract.buyer_phone || '',
      contract_date: contract.contract_date || '',
      puppy_dob: contract.puppy_dob || '',
      puppy_gender: contract.puppy_gender || 'male',
      breed: contract.breed || '',
      color: contract.color || '',
      microchip_number: contract.microchip_number || '',
      type: contract.type || 'local',
      importing_country: contract.importing_country || '',
      purchase_price: String(contract.purchase_price ?? 0),
      down_payment: String(contract.down_payment ?? 0),
      remaining_balance: String(contract.remaining_balance ?? 0),
      vat_enabled: contract.vat_enabled ?? false,
      handover_date: contract.handover_date || '',
      sale_source: (contract.sale_source || 'direct_walkin') as SaleSource,
    });
  };

  const handleSaveEdit = async () => {
    if (!showEdit) return;
    setSavingEdit(true);
    const basePrice = parseFloat(editForm.purchase_price) || 0;
    const vatAmount = editForm.vat_enabled ? basePrice * 0.05 : 0;
    const totalAmount = basePrice + vatAmount;
    const { error } = await supabase.from('contracts').update({
      buyer_name: editForm.buyer_name || null,
      buyer_email: editForm.buyer_email || null,
      buyer_phone: editForm.buyer_phone || null,
      buyer_id_passport: editForm.buyer_id_passport || null,
      contract_date: editForm.contract_date || null,
      puppy_dob: editForm.puppy_dob || null,
      puppy_gender: editForm.puppy_gender,
      breed: editForm.breed || null,
      color: editForm.color || null,
      microchip_number: editForm.microchip_number || null,
      importing_country: editForm.type === 'imported' ? editForm.importing_country || null : null,
      purchase_price: basePrice,
      down_payment: parseFloat(editForm.down_payment) || 0,
      remaining_balance: parseFloat(editForm.remaining_balance) || 0,
      type: editForm.type,
      amount: basePrice,
      vat_enabled: editForm.vat_enabled,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      handover_date: editForm.handover_date || null,
      sale_source: editForm.sale_source,
    }).eq('id', showEdit.id);
    setSavingEdit(false);
    if (error) { toast('error', 'Failed to update contract'); return; }
    await supabase.from('contract_activity').insert({ contract_id: showEdit.id, action: 'Contract details updated' });
    await logActivity('updated contract', showEdit.contract_number || '', showEdit.id);
    toast('success', 'Contract updated successfully');
    setShowEdit(null);
    fetchData();
  };

  const handleDelete = async () => {
    if (!showDelete) return;
    setDeleting(true);
    await supabase.from('contract_activity').delete().eq('contract_id', showDelete.id);
    await supabase.from('calendar_events').delete().eq('linked_id', showDelete.id).eq('linked_type', 'contract');
    const { error } = await supabase.from('contracts').delete().eq('id', showDelete.id);
    setDeleting(false);
    if (error) { toast('error', 'Failed to delete contract'); return; }
    await logActivity('deleted contract', showDelete.contract_number || '', showDelete.id);
    toast('success', 'Contract deleted');
    setShowDelete(null);
    setShowDetail(null);
    fetchData();
  };

  const generateDetailPreview = async (contract: Contract) => {
    setGeneratingPreview(true);
    const { data } = await supabase.from('contract_settings').select('seller_signature_url, seller_stamp_url, app_logo_url, watermark_url, company_contract_url, company_name, company_tagline, company_email').eq('id', 1).maybeSingle();
    const html = await generateContractHtml(contract, (data as { seller_signature_url: string | null; seller_stamp_url: string | null; app_logo_url: string | null; watermark_url: string | null; company_contract_url: string | null; company_name: string | null; company_tagline: string | null; company_email: string | null }) || null);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setDetailPreviewUrl(url);
    setGeneratingPreview(false);
  };

  const sendToSale = async (contract: Contract) => {
    setCreatingSale(true);
    const { data: existingSale } = await supabase.from('sales').select('id').eq('contract_id', contract.id).maybeSingle();
    if (existingSale) {
      toast('info', 'A sale record already exists for this contract');
      setCreatingSale(false);
      return false;
    }

    let clientId = contract.client_id;

    if (!clientId) {
      const matchField = contract.buyer_email ? 'email' : 'name';
      const matchValue = contract.buyer_email || contract.buyer_name;
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id')
        .ilike(matchField, matchValue)
        .maybeSingle();

      if (existingClient) {
        clientId = (existingClient as { id: string }).id;
        await supabase.from('contracts').update({ client_id: clientId }).eq('id', contract.id);
      } else {
        const { data: newClient, error: clientError } = await supabase.from('clients').insert({
          name: contract.buyer_name,
          email: contract.buyer_email || null,
          phone: contract.buyer_phone || null,
          id_passport: contract.buyer_id_passport || null,
          breed: contract.breed || null,
          contract_id: contract.id,
          purchase_date: contract.contract_date || new Date().toISOString().split('T')[0],
          status: 'active',
        }).select().single();

        if (clientError) {
          setCreatingSale(false);
          toast('error', 'Failed to create client from contract');
          return false;
        }
        clientId = (newClient as { id: string }).id;
        await supabase.from('contracts').update({ client_id: clientId }).eq('id', contract.id);
        await logActivity('added client from contract', contract.buyer_name, clientId);
      }
    }

    const amount = contract.vat_enabled ? contract.total_amount : contract.purchase_price;
    const vatType = contract.vat_enabled ? 'on_tax' : 'off_tax';
    const vatAmount = calculateVAT(amount, vatType as 'on_tax' | 'off_tax');
    const netAmount = calculateNetAmount(amount, vatType as 'on_tax' | 'off_tax');
    const { error } = await supabase.from('sales').insert({
      contract_id: contract.id,
      client_id: clientId,
      breed: contract.breed || null,
      sale_type: contract.type,
      amount,
      vat_type: vatType,
      vat_amount: vatAmount,
      net_amount: netAmount,
      employee_id: contract.created_by || null,
      date: contract.contract_date || new Date().toISOString().split('T')[0],
      status: 'completed',
      sale_source: contract.sale_source || null,
    });
    setCreatingSale(false);
    if (error) { toast('error', 'Failed to create sale'); return false; }
    await supabase.from('contract_activity').insert({ contract_id: contract.id, action: 'Sale record created from contract' });
    await logActivity('created sale from contract', contract.contract_number || '', contract.id);
    return true;
  };

  const handleCreateSaleFromDetail = async () => {
    if (!showDetail) return;
    const ok = await sendToSale(showDetail);
    if (ok) {
      setShowDetail(null);
      toast('success', 'Sale created — redirecting to Sales page');
      onNavigateToSales?.();
    }
  };

  const handleCreateSaleFromTable = async (contract: Contract) => {
    const ok = await sendToSale(contract);
    if (ok) {
      toast('success', 'Sale created — redirecting to Sales page');
      onNavigateToSales?.();
    }
  };

  const [saleSentFromWizard, setSaleSentFromWizard] = useState(false);
  const handleSendToSaleFromWizard = async () => {
    if (!createdContract) return;
    const ok = await sendToSale(createdContract);
    if (ok) {
      setSaleSentFromWizard(true);
      toast('success', 'Sale record created — redirecting to Sales page');
      onNavigateToSales?.();
    }
  };

  const downloadContract = async (contract: Contract) => {
    const { data } = await supabase.from('contract_settings').select('seller_signature_url, seller_stamp_url, app_logo_url, watermark_url, company_contract_url, company_name, company_tagline, company_email').eq('id', 1).maybeSingle();
    const html = await generateContractHtml(contract, (data as { seller_signature_url: string | null; seller_stamp_url: string | null; app_logo_url: string | null; watermark_url: string | null; company_contract_url: string | null; company_name: string | null; company_tagline: string | null; company_email: string | null }) || null);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    if (!printWindow) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contract.type === 'imported' ? 'puppy-importing-contract' : 'puppy-purchase-contract'}-${contract.contract_number}.html`;
      a.click();
      toast('info', 'Contract opened. Use your browser print dialog to save as PDF.');
    } else {
      printWindow.addEventListener('load', () => {
        printWindow.focus();
        printWindow.print();
      });
      toast('info', 'In the print dialog, choose "Save as PDF" to export');
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Contracts</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} contracts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setStep(1); setCreatedContract(null); setShowAdd(true); }} className="btn-primary"><Plus className="w-4 h-4" /> Create Contract</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by contract number or buyer..." className="input pl-10" />
          </div>
          <input type="date" value={draft.dateFrom} onChange={(e) => setDraftValue('dateFrom', e.target.value)} className="input text-sm w-auto" />
          <input type="date" value={draft.dateTo} onChange={(e) => setDraftValue('dateTo', e.target.value)} className="input text-sm w-auto" />
          <select value={draft.statusFilter} onChange={(e) => setDraftValue('statusFilter', e.target.value)} className="select text-sm">
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="signed">Signed</option>
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
          <EmptyState message="No contracts found" subMessage="Create a new contract to get started" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                  <th className="px-4 py-3 font-medium">Contract No.</th>
                  <th className="px-4 py-3 font-medium">Client Name</th>
                  <th className="px-4 py-3 font-medium">Breed</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Handover Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contract) => (
                  <tr key={contract.id} className="table-row cursor-pointer" onClick={() => openDetail(contract)}>
                    <td className="px-4 py-3 text-sm text-white font-mono font-medium">{contract.contract_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{contract.buyer_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{contract.breed || '—'}</td>
                    <td className="px-4 py-3"><span className="text-xs text-gray-400 capitalize">{contract.type}</span></td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{formatAED(contract.amount)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(contract.handover_date)}</td>
                    <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[contract.status]}>{contract.status}</Badge></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openDetail(contract)} className="p-1.5 rounded-lg text-gray-400 hover:text-accent-400 hover:bg-accent-500/10 transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(contract); }} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                        {contract.status === 'draft' && (
                          <button onClick={(e) => { e.stopPropagation(); handleSendPDF(contract); }} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors" title="Send PDF"><Send className="w-4 h-4" /></button>
                        )}
                        {contract.status === 'signed' && (
                          <button onClick={(e) => { e.stopPropagation(); downloadContract(contract); }} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-primary-700 transition-colors" title="Download"><Download className="w-4 h-4" /></button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); handleCreateSaleFromTable(contract); }} disabled={creatingSale} className="p-1.5 rounded-lg text-gray-400 hover:text-success-400 hover:bg-success-500/10 transition-colors" title="Create Sale"><DollarSign className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); setShowDelete(contract); }} className="p-1.5 rounded-lg text-gray-400 hover:text-error-400 hover:bg-error-500/10 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Contract Modal — 3-step flow */}
      <Modal open={showAdd} onClose={handleCloseWizard} title={createdContract ? 'Review & Export Contract' : 'Create New Contract'} size="full">
        <div className="space-y-5">
          {/* Progress indicator */}
          <div className="flex items-center gap-2 mb-2">
            {([1, 2, 3, 4] as Step[]).map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all ${
                  step >= s ? 'bg-accent-500 text-white' : 'bg-primary-800 text-gray-500'
                }`}>
                  {step > s ? <Check className="w-4 h-4" /> : s}
                </div>
                {s < 4 && <div className={`h-0.5 flex-1 rounded-full transition-all ${step > s ? 'bg-accent-500' : 'bg-primary-800'}`} />}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-500 mb-4">
            <button type="button" disabled={!!createdContract} onClick={() => setStep(1)} className={`${step === 1 ? 'text-accent-400 font-medium' : 'hover:text-gray-300'} ${createdContract ? 'opacity-50 cursor-not-allowed' : ''}`}>Client Details</button>
            <button type="button" disabled={!!createdContract} onClick={() => setStep(2)} className={`${step === 2 ? 'text-accent-400 font-medium' : 'hover:text-gray-300'} ${createdContract ? 'opacity-50 cursor-not-allowed' : ''}`}>Dog Details</button>
            <button type="button" disabled={!!createdContract} onClick={() => setStep(3)} className={`${step === 3 ? 'text-accent-400 font-medium' : 'hover:text-gray-300'} ${createdContract ? 'opacity-50 cursor-not-allowed' : ''}`}>Pricing & Taxing</button>
            <button type="button" onClick={() => setStep(4)} className={`${step === 4 ? 'text-accent-400 font-medium' : 'hover:text-gray-300'}`}>Review & Export</button>
          </div>

          {stepError && <p className="text-sm text-error-400 bg-error-500/10 rounded-lg px-3 py-2">{stepError}</p>}

          {/* Step 1: Client Details */}
          {step === 1 && !createdContract && (
            <div>
              <h3 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Client Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Buyer Name</label><input type="text" value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Buyer Email</label><input type="email" value={form.buyer_email} onChange={(e) => setForm({ ...form, buyer_email: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Buyer ID/Passport No.</label><input type="text" value={form.buyer_id_passport} onChange={(e) => setForm({ ...form, buyer_id_passport: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Buyer Phone</label><input type="tel" value={form.buyer_phone} onChange={(e) => setForm({ ...form, buyer_phone: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Contract Date</label><input type="date" value={form.contract_date} onChange={(e) => setForm({ ...form, contract_date: e.target.value })} className="input" /></div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Salesman</label>
                  <select value={form.salesman_id} onChange={(e) => setForm({ ...form, salesman_id: e.target.value })} className="select">
                    <option value="">Select salesman...</option>
                    {salespeople.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.role.replace('_', ' ')})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Sale Source *</label>
                  <select value={form.sale_source} onChange={(e) => setForm({ ...form, sale_source: e.target.value as SaleSource })} className="select">
                    {SALE_SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-between gap-3 pt-5 border-t border-primary-800 mt-6">
                <button type="button" onClick={handleCloseWizard} className="btn-ghost">Cancel</button>
                <button type="button" onClick={goToNext} className="btn-primary">Next <ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {/* Step 2: Dog Details */}
          {step === 2 && !createdContract && (
            <div>
              <h3 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Dog Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Puppy DOB</label><input type="date" value={form.puppy_dob} onChange={(e) => setForm({ ...form, puppy_dob: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Gender</label><select value={form.puppy_gender} onChange={(e) => setForm({ ...form, puppy_gender: e.target.value })} className="select"><option value="male">Male</option><option value="female">Female</option></select></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Breed</label><input type="text" value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Color</label><input type="text" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Microchip Number</label><input type="text" value={form.microchip_number} onChange={(e) => setForm({ ...form, microchip_number: e.target.value })} className="input" /></div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Origin (Local or Import)</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, importing_country: e.target.value === 'imported' ? form.importing_country : '' })} className="select">
                    <option value="local">Local</option>
                    <option value="imported">Import</option>
                  </select>
                </div>
                {form.type === 'imported' && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">Importing Country</label>
                    <input type="text" value={form.importing_country} onChange={(e) => setForm({ ...form, importing_country: e.target.value })} placeholder="e.g. Russia, Germany, Ukraine..." className="input" />
                  </div>
                )}
              </div>
              <div className="flex justify-between gap-3 pt-5 border-t border-primary-800 mt-6">
                <div className="flex gap-3">
                  <button type="button" onClick={handleCloseWizard} className="btn-ghost">Cancel</button>
                  <button type="button" onClick={() => { setStep(1); setStepError(''); }} className="btn-secondary"><ChevronLeft className="w-4 h-4" /> Back</button>
                </div>
                <button type="button" onClick={goToNext} className="btn-primary">Next <ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {/* Step 3: Pricing & Taxing */}
          {step === 3 && !createdContract && (
            <div>
              <h3 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Pricing & Taxing</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Purchase Price (AED)</label><input type="number" min="0" step="0.01" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Down Payment (AED)</label><input type="number" min="0" step="0.01" value={form.down_payment} onChange={(e) => setForm({ ...form, down_payment: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Remaining Balance (AED)</label><input type="number" min="0" step="0.01" value={form.remaining_balance} onChange={(e) => setForm({ ...form, remaining_balance: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Expected Handover Date</label><input type="date" value={form.handover_date} onChange={(e) => setForm({ ...form, handover_date: e.target.value })} className="input" /></div>
                <div className="flex flex-col justify-end">
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">VAT (5% on Base Price)</label>
                  <button type="button" onClick={() => setForm({ ...form, vat_enabled: !form.vat_enabled })} className={`relative inline-flex items-center h-10 w-20 rounded-full transition-colors ${form.vat_enabled ? 'bg-accent-500' : 'bg-primary-800'}`}>
                    <span className={`inline-block w-8 h-8 bg-white rounded-full transform transition-transform ${form.vat_enabled ? 'translate-x-10' : 'translate-x-1'}`} />
                    <span className={`absolute text-xs font-medium ${form.vat_enabled ? 'left-1.5 text-white' : 'right-2 text-gray-500'}`}>{form.vat_enabled ? 'ON' : 'OFF'}</span>
                  </button>
                </div>
              </div>
              {form.vat_enabled && (
                <div className="mt-4 card p-4 bg-primary-950/50 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Base Price</span><span className="text-white">AED {parseFloat(form.purchase_price || '0').toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">VAT (5%)</span><span className="text-accent-400">AED {(parseFloat(form.purchase_price || '0') * 0.05).toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm pt-2 border-t border-primary-800"><span className="text-gray-400 font-medium">Total</span><span className="text-white font-bold">AED {(parseFloat(form.purchase_price || '0') * 1.05).toFixed(2)}</span></div>
                </div>
              )}
              <div className="flex justify-between gap-3 pt-5 border-t border-primary-800 mt-6">
                <div className="flex gap-3">
                  <button type="button" onClick={handleCloseWizard} className="btn-ghost">Cancel</button>
                  <button type="button" onClick={() => { setStep(2); setStepError(''); }} className="btn-secondary"><ChevronLeft className="w-4 h-4" /> Back</button>
                </div>
                <button type="button" onClick={handleCreate} className="btn-primary"><FileText className="w-4 h-4" /> Create & Review</button>
              </div>
            </div>
          )}

          {/* Step 4: Review & Export PDF */}
          {step === 4 && createdContract && (
            <div>
              <h3 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Review & Export PDF</h3>
              <p className="text-sm text-gray-500 mb-4">Your contract has been created. Preview the PDF below, then export it as a PDF file or send it directly to the client's email.</p>

              {/* Summary */}
              <div className="card p-4 bg-primary-950/50 mb-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><span className="text-gray-500">Contract No.:</span> <span className="text-white font-mono font-medium">{createdContract.contract_number}</span></div>
                  <div><span className="text-gray-500">Buyer:</span> <span className="text-white">{createdContract.buyer_name}</span></div>
                  <div><span className="text-gray-500">Email:</span> <span className="text-white">{createdContract.buyer_email || '—'}</span></div>
                  <div><span className="text-gray-500">Breed:</span> <span className="text-white">{createdContract.breed || '—'}</span></div>
                  <div><span className="text-gray-500">Price:</span> <span className="text-white font-medium">{formatAED(createdContract.purchase_price)}</span></div>
                  <div><span className="text-gray-500">Handover:</span> <span className="text-white">{formatDate(createdContract.handover_date)}</span></div>
                  <div><span className="text-gray-500">Type:</span> <span className="text-white capitalize">{createdContract.type === 'local' ? 'Local' : 'Import'}</span></div>
                  <div><span className="text-gray-500">Status:</span> <Badge variant={STATUS_VARIANT[createdContract.status]}>{createdContract.status}</Badge></div>
                </div>
              </div>

              {/* PDF Preview */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-white">PDF Preview</h4>
                  <span className="text-xs text-gray-500">Scroll to view all 3 pages</span>
                </div>
                <div className="border border-primary-700 rounded-lg overflow-hidden bg-gray-200" style={{ height: '600px' }}>
                  {previewUrl && <iframe ref={previewRef} src={previewUrl} title="Contract PDF Preview" className="w-full h-full" />}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 pt-4 border-t border-primary-800">
                <button onClick={handlePrintPdf} className="btn-primary"><Printer className="w-4 h-4" /> Export as PDF</button>
                <button onClick={handleSendEmail} disabled={sending} className="btn-secondary">
                  {sending ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Mail className="w-4 h-4" />}
                  Send to Client Email
                </button>
                <button onClick={handleSendToSaleFromWizard} disabled={creatingSale || saleSentFromWizard} className="btn-secondary text-success-400 hover:bg-success-500/10 border-success-500/30">
                  {creatingSale ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saleSentFromWizard ? <Check className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
                  {saleSentFromWizard ? 'Sale Sent' : 'Send to Sale'}
                </button>
                <button onClick={handleCloseWizard} className="btn-ghost ml-auto">Done</button>
              </div>
              <p className="text-xs text-gray-500 mt-3">To export as PDF: click "Export as PDF", then in the print dialog select "Save as PDF" as the destination. Click "Send to Sale" to create a sale record from this contract.</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Contract Detail Modal */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title={`Contract ${showDetail?.contract_number || ''}`} size="xl">
        {showDetail && (
          <div className="space-y-5">
            {/* Contract info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="card p-4 bg-primary-950/50">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Client</h4>
                <p className="text-white font-medium">{showDetail.buyer_name}</p>
                <p className="text-sm text-gray-400">{showDetail.buyer_email || '—'}</p>
                <p className="text-sm text-gray-400">{showDetail.buyer_phone || '—'}</p>
                <p className="text-sm text-gray-400">ID: {showDetail.buyer_id_passport || '—'}</p>
              </div>
              <div className="card p-4 bg-primary-950/50">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Dog</h4>
                <p className="text-white font-medium">{showDetail.breed || '—'}</p>
                <p className="text-sm text-gray-400">Gender: {showDetail.puppy_gender || '—'}</p>
                <p className="text-sm text-gray-400">Color: {showDetail.color || '—'}</p>
                <p className="text-sm text-gray-400">Microchip: {showDetail.microchip_number || '—'}</p>
                <p className="text-sm text-gray-400">DOB: {formatDate(showDetail.puppy_dob)}</p>
                {showDetail.type === 'imported' && <p className="text-sm text-gray-400">Importing Country: {showDetail.importing_country || '—'}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card p-3 text-center"><p className="text-xs text-gray-500">Purchase Price</p><p className="text-lg font-bold text-white">{formatAED(showDetail.purchase_price)}</p></div>
              <div className="card p-3 text-center"><p className="text-xs text-gray-500">Down Payment</p><p className="text-lg font-bold text-white">{formatAED(showDetail.down_payment)}</p></div>
              <div className="card p-3 text-center"><p className="text-xs text-gray-500">Remaining</p><p className="text-lg font-bold text-white">{formatAED(showDetail.remaining_balance)}</p></div>
            </div>

            {showDetail.vat_enabled && (
              <div className="card p-4 bg-primary-950/50">
                <div className="flex justify-between text-sm mb-1"><span className="text-gray-500">Base Price</span><span className="text-white">{formatAED(showDetail.purchase_price)}</span></div>
                <div className="flex justify-between text-sm mb-1"><span className="text-gray-500">VAT (5%)</span><span className="text-accent-400">{formatAED(showDetail.vat_amount)}</span></div>
                <div className="flex justify-between text-sm pt-2 border-t border-primary-800"><span className="text-gray-400 font-medium">Total</span><span className="text-white font-bold">{formatAED(showDetail.total_amount)}</span></div>
              </div>
            )}

            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="text-gray-500">Handover: <span className="text-gray-300">{formatDate(showDetail.handover_date)}</span></span>
              <span className="text-gray-500">Type: <span className="text-gray-300 capitalize">{showDetail.type === 'local' ? 'Local' : 'Import'}</span></span>
              {showDetail.type === 'imported' && showDetail.importing_country && <span className="text-gray-500">From: <span className="text-gray-300">{showDetail.importing_country}</span></span>}
              {showDetail.created_by_profile && <span className="text-gray-500">Salesman: <span className="text-gray-300">{showDetail.created_by_profile.name}</span></span>}
              <Badge variant={STATUS_VARIANT[showDetail.status]}>{showDetail.status}</Badge>
              {showDetail.signed_at && <span className="text-xs text-success-400">Signed: {formatDateTime(showDetail.signed_at)}</span>}
            </div>

            {/* PDF Preview */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-white">PDF Preview</h4>
                <div className="flex items-center gap-2">
                  <button onClick={() => downloadContract(showDetail)} className="btn-secondary text-xs px-3 py-1.5"><Download className="w-3.5 h-3.5" /> Download</button>
                  <button onClick={() => generateDetailPreview(showDetail)} disabled={generatingPreview} className="btn-secondary text-xs px-3 py-1.5">
                    {generatingPreview ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    {detailPreviewUrl ? 'Refresh Preview' : 'Generate Preview'}
                  </button>
                </div>
              </div>
              <div className="border border-primary-700 rounded-lg overflow-hidden bg-gray-200" style={{ height: '500px' }}>
                {detailPreviewUrl ? (
                  <iframe src={detailPreviewUrl} title="Contract PDF Preview" className="w-full h-full" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                    <FileText className="w-8 h-8 text-gray-400" />
                    <p className="text-sm">Click "Generate Preview" to view the contract PDF</p>
                  </div>
                )}
              </div>
            </div>

            {/* Signature */}
            {showDetail.status !== 'signed' && (
              <div className="card p-4 border-accent-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <Signature className="w-5 h-5 text-accent-400" />
                  <h4 className="text-sm font-semibold text-white">Digital Signature</h4>
                </div>
                <p className="text-sm text-gray-500 mb-3">Click below to digitally sign this contract on behalf of the client.</p>
                <button onClick={handleSign} className="btn-primary w-full"><Signature className="w-4 h-4" /> Sign Contract</button>
              </div>
            )}

            {/* Activity log */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Contract Activity Log</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activities.length === 0 ? (
                  <p className="text-sm text-gray-500">No activity recorded yet</p>
                ) : (
                  activities.map((a) => (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary-950/50 text-sm">
                      <span className="text-gray-300">{a.action}</span>
                      <span className="text-xs text-gray-600">{formatDateTime(a.created_at)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-primary-800">
              <button onClick={() => { openEdit(showDetail); setShowDetail(null); }} className="btn-secondary flex-1"><Pencil className="w-4 h-4" /> Edit</button>
              <button onClick={handleCreateSaleFromDetail} disabled={creatingSale} className="btn-secondary flex-1 text-success-400 hover:bg-success-500/10 border-success-500/30">
                {creatingSale ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <DollarSign className="w-4 h-4" />}
                Create Sale
              </button>
              <button onClick={() => { setShowDelete(showDetail); }} className="btn-secondary flex-1 text-error-400 hover:bg-error-500/10 border-error-500/30"><Trash2 className="w-4 h-4" /> Delete</button>
              {showDetail.status === 'draft' && (
                <button onClick={() => handleSendPDF(showDetail)} className="btn-primary flex-1"><Send className="w-4 h-4" /> Send PDF</button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Contract Modal */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title={`Edit Contract ${showEdit?.contract_number || ''}`} size="xl">
        {showEdit && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Client Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Buyer Name</label><input type="text" value={editForm.buyer_name} onChange={(e) => setEditForm({ ...editForm, buyer_name: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Buyer Email</label><input type="email" value={editForm.buyer_email} onChange={(e) => setEditForm({ ...editForm, buyer_email: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Buyer ID/Passport No.</label><input type="text" value={editForm.buyer_id_passport} onChange={(e) => setEditForm({ ...editForm, buyer_id_passport: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Buyer Phone</label><input type="tel" value={editForm.buyer_phone} onChange={(e) => setEditForm({ ...editForm, buyer_phone: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Contract Date</label><input type="date" value={editForm.contract_date} onChange={(e) => setEditForm({ ...editForm, contract_date: e.target.value })} className="input" /></div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Sale Source</label>
                  <select value={editForm.sale_source} onChange={(e) => setEditForm({ ...editForm, sale_source: e.target.value as SaleSource })} className="select">
                    {SALE_SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Dog Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Puppy DOB</label><input type="date" value={editForm.puppy_dob} onChange={(e) => setEditForm({ ...editForm, puppy_dob: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Gender</label><select value={editForm.puppy_gender} onChange={(e) => setEditForm({ ...editForm, puppy_gender: e.target.value })} className="select"><option value="male">Male</option><option value="female">Female</option></select></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Breed</label><input type="text" value={editForm.breed} onChange={(e) => setEditForm({ ...editForm, breed: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Color</label><input type="text" value={editForm.color} onChange={(e) => setEditForm({ ...editForm, color: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Microchip Number</label><input type="text" value={editForm.microchip_number} onChange={(e) => setEditForm({ ...editForm, microchip_number: e.target.value })} className="input" /></div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Origin (Local or Import)</label>
                  <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value, importing_country: e.target.value === 'imported' ? editForm.importing_country : '' })} className="select">
                    <option value="local">Local</option>
                    <option value="imported">Import</option>
                  </select>
                </div>
                {editForm.type === 'imported' && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">Importing Country</label>
                    <input type="text" value={editForm.importing_country} onChange={(e) => setEditForm({ ...editForm, importing_country: e.target.value })} placeholder="e.g. Russia, Germany, Ukraine..." className="input" />
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Pricing & Taxing</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Purchase Price (AED)</label><input type="number" min="0" step="0.01" value={editForm.purchase_price} onChange={(e) => setEditForm({ ...editForm, purchase_price: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Down Payment (AED)</label><input type="number" min="0" step="0.01" value={editForm.down_payment} onChange={(e) => setEditForm({ ...editForm, down_payment: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Remaining Balance (AED)</label><input type="number" min="0" step="0.01" value={editForm.remaining_balance} onChange={(e) => setEditForm({ ...editForm, remaining_balance: e.target.value })} className="input" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-1.5">Expected Handover Date</label><input type="date" value={editForm.handover_date} onChange={(e) => setEditForm({ ...editForm, handover_date: e.target.value })} className="input" /></div>
                <div className="flex flex-col justify-end">
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">VAT (5% on Base Price)</label>
                  <button type="button" onClick={() => setEditForm({ ...editForm, vat_enabled: !editForm.vat_enabled })} className={`relative inline-flex items-center h-10 w-20 rounded-full transition-colors ${editForm.vat_enabled ? 'bg-accent-500' : 'bg-primary-800'}`}>
                    <span className={`inline-block w-8 h-8 bg-white rounded-full transform transition-transform ${editForm.vat_enabled ? 'translate-x-10' : 'translate-x-1'}`} />
                    <span className={`absolute text-xs font-medium ${editForm.vat_enabled ? 'left-1.5 text-white' : 'right-2 text-gray-500'}`}>{editForm.vat_enabled ? 'ON' : 'OFF'}</span>
                  </button>
                </div>
              </div>
              {editForm.vat_enabled && (
                <div className="mt-4 card p-4 bg-primary-950/50 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Base Price</span><span className="text-white">AED {parseFloat(editForm.purchase_price || '0').toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">VAT (5%)</span><span className="text-accent-400">AED {(parseFloat(editForm.purchase_price || '0') * 0.05).toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm pt-2 border-t border-primary-800"><span className="text-gray-400 font-medium">Total</span><span className="text-white font-bold">AED {(parseFloat(editForm.purchase_price || '0') * 1.05).toFixed(2)}</span></div>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-3 pt-5 border-t border-primary-800">
              <button type="button" onClick={() => setShowEdit(null)} className="btn-ghost">Cancel</button>
              <button type="button" onClick={handleSaveEdit} disabled={savingEdit} className="btn-primary">
                {savingEdit ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!showDelete} onClose={() => setShowDelete(null)} title="Delete Contract" size="md">
        {showDelete && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-error-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-error-400" />
              </div>
              <div>
                <p className="text-sm text-white font-medium">Are you sure you want to delete this contract?</p>
                <p className="text-sm text-gray-500 mt-1">Contract <span className="font-mono text-gray-300">{showDelete.contract_number}</span> for <span className="text-gray-300">{showDelete.buyer_name}</span> will be permanently removed. This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-primary-800">
              <button type="button" onClick={() => setShowDelete(null)} className="btn-ghost">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting} className="btn-primary bg-error-500 hover:bg-error-600 text-white">
                {deleting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete Contract
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

async function generateContractHtml(contract: Contract, settings: { seller_signature_url: string | null; seller_stamp_url: string | null; app_logo_url: string | null; watermark_url: string | null; company_contract_url: string | null; company_name: string | null; company_tagline: string | null; company_email: string | null } | null = null): Promise<string> {
  const isImport = contract.type === 'imported';
  const companyName = settings?.company_name?.trim() || 'PUPPYFY UAE';
  const companyTagline = settings?.company_tagline?.trim() || 'Premium Puppies · United Arab Emirates';
  const companyEmail = settings?.company_email?.trim() || 'puppyfyuae2000@gmail.com';
  const value = (text: string | number | null | undefined): string => escapeHtml(String(text || '—'));
  const date = (text: string | null | undefined): string => text ? formatDate(text) : '—';
  const money = (amount: number): string => `AED ${amount.toFixed(2)}`;

  const infoRow = (label: string, val: string | number | null | undefined): string =>
    `<div class="info-row"><span class="info-label">${label}</span><span class="info-value">${value(val)}</span></div>`;

  const infoGrid = (rows: [string, string | number | null | undefined][]): string =>
    `<div class="info-grid">${rows.map(([l, v]) => infoRow(l, v)).join('')}</div>`;

  const clause = (num: string, text: string): string => `<p class="clause"><span class="clause-num">${num}</span>${text}</p>`;

  const section = (title: string, content: string): string =>
    `<div class="section"><h2>${title}</h2><div class="section-body">${content}</div></div>`;

  const page = (num: number, content: string, watermarkDataUrl: string, isFirst = false): string =>
    `<article class="page${isFirst ? ' first-page' : ''}"><img src="${watermarkDataUrl}" alt="" class="watermark" /><div class="page-content">${content}</div><div class="page-footer"><span>${escapeHtml(companyName)}</span><span>Page ${num} of 3</span><span>${value(contract.contract_number)}</span></div></article>`;

  const sigImg = settings?.seller_signature_url ? `<img src="${settings.seller_signature_url}" alt="signature" class="sig-img" />` : '';
  const stampImg = settings?.seller_stamp_url ? `<img src="${settings.seller_stamp_url}" alt="stamp" class="stamp-img" />` : '';

  const logoSrc = settings?.app_logo_url || '/puppyfy-logo.webp';
  const logoDataUrl = settings?.app_logo_url ? logoSrc : await fetch(logoSrc).then(r => r.blob()).then(b => new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(b);
  })).catch(() => '/puppyfy-logo.webp');
  const watermarkUrl = settings?.watermark_url || logoDataUrl;

  const pageOne = page(1, `
    <div class="letterhead">
      <img src="${logoDataUrl}" alt="${escapeHtml(companyName)} Logo" class="logo-img" />
      <div class="company-name">${escapeHtml(companyName)}</div>
      <div class="company-tagline">${escapeHtml(companyTagline)}</div>
      <div class="company-contact">${escapeHtml(companyEmail)}</div>
    </div>
    <div class="doc-title-bar">
      <h1>${isImport ? 'Puppy Importing Contract' : 'Puppy Purchase Contract'}</h1>
      <div class="contract-meta">Contract No. ${value(contract.contract_number)}</div>
    </div>
    <p class="intro">This ${isImport ? 'Puppy Importing' : 'Puppy Purchase'} Contract is made and entered into on the date specified below between <strong>${escapeHtml(companyName)}</strong> (the &ldquo;Seller&rdquo;) and the undersigned Client (the &ldquo;Buyer&rdquo;).</p>
    <p class="intro">By signing this Contract, the Buyer confirms full understanding and unconditional acceptance of all terms herein.</p>
    ${section('Section 1 &mdash; Buyer Information', infoGrid([
      ['Full Name', contract.buyer_name],
      ['Email Address', contract.buyer_email],
      ['ID / Passport No.', contract.buyer_id_passport],
      ['Contact Number', contract.buyer_phone],
      ['Date of Contract', date(contract.contract_date)],
    ]))}
    ${section('Section 2 &mdash; Puppy Details', infoGrid([
      ['Date of Birth', date(contract.puppy_dob)],
      ['Gender', contract.puppy_gender],
      ['Breed', contract.breed],
      ['Color', contract.color],
      ['Microchip Number', contract.microchip_number],
    ]))}
    <div class="price-summary">${infoGrid([
      ['Purchase Price', money(contract.purchase_price)],
      ['Down Payment', money(contract.down_payment)],
      ['Remaining Balance', money(contract.remaining_balance)],
      ['Handover Date', date(contract.handover_date)],
      ...(isImport ? [['Importing Country', contract.importing_country] as [string, string | number | null | undefined]] : []),
      ...(contract.vat_enabled ? [['VAT (5%) / Total', `${money(contract.vat_amount)} / ${money(contract.total_amount)}`] as [string, string | number | null | undefined]] : []),
    ])}</div>
    ${section('Section 3 &mdash; Purchase Price & Payment Terms', `
      ${clause('3.1', 'The total purchase price is as stated above.')}
      ${clause('3.2', 'Any down payment paid by the Buyer is strictly non-refundable under all circumstances, unless the puppy is deemed unhealthy during the veterinary examination conducted at the time of handover only.')}
      ${clause('3.3', 'Full payment must be completed on or before the handover date.')}
      ${clause('3.4', 'Failure to complete payment or collect the puppy authorizes the Seller to retain all paid amounts in full and resell the puppy to another party without liability.')}
    `)}
    ${section('Section 4 &mdash; Reservation & Handover', `
      ${clause('4.1', 'The down payment constitutes a final reservation of the puppy.')}
      ${clause('4.2', 'The Buyer must collect the puppy on the agreed handover date. Any delay in collection shall be at the Buyer&rsquo;s full risk and expense.')}
      ${clause('4.3', 'Upon physical handover, full possession, risk, and responsibility transfer irrevocably to the Buyer.')}
    `)}
  `, watermarkUrl, true);

  const pageTwo = page(2, `
    ${section('Section 5 &mdash; Health Status & Veterinary Disclosure', `
      ${clause('5.1', 'The Buyer acknowledges that the puppy is delivered in good apparent health at the time of handover.')}
      ${clause('5.2', 'The Buyer has the right to conduct a veterinary examination at their own expense prior to or at handover. If the Buyer chooses not to conduct such examination, the Seller bears no responsibility for future claims.')}
    `)}
    ${section('Section 6 &mdash; Vaccinations', `
      ${clause('6.1', 'The Seller confirms that the puppy has received vaccinations appropriate to its age at the time of delivery, as recorded in the veterinary passport.')}
      ${clause('6.2', 'All future vaccinations, boosters, treatments, and preventive care after handover are the sole responsibility of the Buyer. The Seller shall not be liable for any missed, delayed, or future vaccinations after handover.')}
    `)}
    ${section('Section 7 &mdash; Full Disclaimer of Health Liability', `
      ${clause('7.1', 'The Seller shall bear absolutely no responsibility for the puppy&rsquo;s health after handover, including but not limited to: illnesses, genetic conditions, behavioral issues, injuries, medical complications, or death.')}
      ${clause('7.2', 'Any veterinary, medical, surgical, or treatment expenses after handover are entirely borne by the Buyer. The Buyer irrevocably waives any claim related to the puppy&rsquo;s health after delivery.')}
    `)}
    ${section('Section 8 &mdash; No Warranty / Waiver of Claims', `
      ${clause('8.1', 'The Buyer expressly waives any express or implied warranty, including fitness for a particular purpose, future health condition, temperament or behavior.')}
      ${clause('8.2', 'The Buyer shall have no right to compensation, replacement, refund, or return under any circumstances.')}
    `)}
    ${section('Section 9 &mdash; No Return Policy', `
      ${clause('9.1', 'The puppy cannot be returned for any reason, including but not limited to: house-training issues, allergies, housing restrictions, family or pet incompatibility, or change of mind.')}
    `)}
    ${section('Section 10 &mdash; After-Sales Support', `
      ${clause('10.1', 'Any advice or support provided by the Seller after sale is voluntary, non-binding, and not a legal obligation. Such advice does not constitute a warranty or responsibility.')}
    `)}
  `, watermarkUrl);

  const pageThree = page(3, `
    ${section('Section 11 &mdash; Buyer Acknowledgment', `
      ${clause('11.1', 'The Buyer confirms that all terms have been read and understood, that no verbal promises exist outside this Contract, and that this Contract represents the entire agreement.')}
    `)}
    ${section('Section 12 &mdash; Governing Law & Jurisdiction', `
      ${clause('12.1', 'This Contract shall be governed by the laws of the United Arab Emirates. Courts of the UAE shall have exclusive jurisdiction.')}
      ${clause('12.2', 'This Contract is drafted in English; Arabic translation may be used for reference only unless otherwise agreed.')}
    `)}
    <div class="section">
      <h2>Section 13 &mdash; Signatures</h2>
      <div class="section-body">
        <p class="sig-instruction">By signing below, both parties acknowledge and accept all terms and conditions set forth in this Contract.</p>
        <div class="signature-area">
          <div class="sig-block">
            <div class="sig-header">Seller &mdash; ${escapeHtml(companyName)}</div>
            <div class="sig-line">
              <div class="sig-image-area">${sigImg}${stampImg}</div>
              <div class="sig-underline"></div>
              <div class="sig-label">Signature</div>
            </div>
            <div class="sig-details">
              <div class="sig-detail-row"><span>Name:</span><strong>${escapeHtml(companyName)}</strong></div>
              <div class="sig-detail-row"><span>Date:</span><strong>${date(contract.contract_date)}</strong></div>
              <div class="sig-detail-row"><span>Email:</span><strong>${escapeHtml(companyEmail)}</strong></div>
            </div>
          </div>
          <div class="sig-block">
            <div class="sig-header">Buyer &mdash; Client</div>
            <div class="sig-line">
              <div class="sig-image-area"></div>
              <div class="sig-underline"></div>
              <div class="sig-label">Signature</div>
            </div>
            <div class="sig-details">
              <div class="sig-detail-row"><span>Name:</span><strong>${value(contract.buyer_name)}</strong></div>
              <div class="sig-detail-row"><span>Date:</span><strong>${date(contract.contract_date)}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `, watermarkUrl);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${isImport ? 'Puppy Importing Contract' : 'Puppy Purchase Contract'} &mdash; ${value(contract.contract_number)}</title><style>
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
    .company-accent{color:#c9a96e}
    .company-tagline{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#444;letter-spacing:2px;margin-top:2px;text-transform:uppercase}
    .company-contact{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#666;margin-top:2px}
    .doc-title-bar{text-align:center;margin-bottom:6mm;padding:5mm 0;background:linear-gradient(135deg,#0f3d2e 0%,#1a5a44 100%);border:2px solid #c9a96e}
    .doc-title-bar h1{font-size:18pt;color:#fff;letter-spacing:1px;font-weight:400;text-decoration:underline}
    .contract-meta{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#c9a96e;margin-top:3px;letter-spacing:1px}
    .intro{margin-bottom:4mm;text-align:justify;font-size:11pt}
    .section{margin-bottom:5mm}
    .section h2{font-size:14pt;color:#0f3d2e;border-bottom:2px solid #c9a96e;padding-bottom:2px;margin-bottom:3mm;letter-spacing:.5px}
    .section-body{padding-left:4mm}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 8mm;margin-bottom:3mm}
    .info-row{display:flex;flex-direction:column;padding:2mm 0;border-bottom:1px solid #ccc}
    .info-label{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:1px}
    .info-value{font-size:11.5pt;color:#111;font-weight:600}
    .price-summary{background:#f8fafc;border:2px solid #ccc;padding:4mm 5mm;margin-bottom:5mm}
    .clause{margin-bottom:3mm;text-align:justify;padding-left:7mm;position:relative;font-size:11pt}
    .clause-num{position:absolute;left:0;font-weight:700;color:#0f3d2e}
    .clause.emphasis{font-weight:600}
    .sub-list{margin:2mm 0 3mm 10mm}
    .sub-list li{margin-bottom:1.5mm;list-style:none;position:relative;padding-left:5mm;font-size:11pt}
    .sub-list li:before{content:'';position:absolute;left:0;top:9px;width:4px;height:4px;background:#c9a96e;border-radius:50%}
    .sig-instruction{font-style:italic;color:#444;margin-bottom:6mm;font-size:11pt}
    .signature-area{display:flex;gap:12mm;margin-top:5mm}
    .sig-block{flex:1}
    .sig-header{font-family:Arial,Helvetica,sans-serif;font-size:12pt;font-weight:700;color:#0f3d2e;text-transform:uppercase;letter-spacing:1px;margin-bottom:5mm;padding-bottom:2mm;border-bottom:2px solid #ccc}
    .sig-line{margin-bottom:3mm}
    .sig-image-area{position:relative;min-height:26mm;display:flex;align-items:flex-end;gap:10mm;padding-bottom:1mm}
    .sig-img{max-height:22mm;max-width:55mm;object-fit:contain;position:relative;z-index:1}
    .stamp-img{max-height:24mm;max-width:24mm;object-fit:contain;position:relative;z-index:1;opacity:.9}
    .sig-underline{border-bottom:2px solid #0f3d2e;margin-top:2mm}
    .sig-label{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#555;text-transform:uppercase;letter-spacing:1px;margin-top:1mm}
    .sig-details{margin-top:4mm}
    .sig-detail-row{display:flex;gap:3mm;margin-bottom:2mm;font-size:11pt}
    .sig-detail-row span{color:#555;min-width:14mm;font-family:Arial,Helvetica,sans-serif;font-size:10pt}
    .sig-detail-row strong{color:#111;font-weight:600}
    @media print{body{background:#fff}.page{margin:0;box-shadow:none;page-break-after:always}.page:last-child{page-break-after:auto}.watermark{opacity:.08}}
    @media screen and (max-width:900px){.page{transform-origin:top left;transform:scale(.72);margin-bottom:-82mm}}
  </style></head><body>${pageOne}${pageTwo}${pageThree}</body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] || character);
}
