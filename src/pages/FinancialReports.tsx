import { useEffect, useState, useMemo } from 'react';
import { DollarSign, TrendingUp, Gem, FileDown, Table as TableIcon, Receipt } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatAED, exportToCSV } from '@/lib/utils';
import { getLastNMonths, isInRange, formatCycleRange, type CycleRange } from '@/lib/financialCycle';
import { PageSkeleton } from '@/components/LoadingSpinner';
import { toast } from '@/components/Toast';
import type { Sale, Expense, SaleExpense, BusinessSettings } from '@/lib/supabase';

interface MonthData {
  range: CycleRange;
  salesRevenue: number;
  operatingCosts: { vatPaid: number; puppyAcquisition: number; deliveryCosts: number; otherOperating: number; total: number };
  netProfit: number;
  businessExpenses: { marketing: number; bills: number; rent: number; subscriptions: number; vet: number; misc: number; total: number };
  shareholderDividends: number;
}

export default function FinancialReports() {
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [saleExpenses, setSaleExpenses] = useState<SaleExpense[]>([]);
  const [cycleStartDay, setCycleStartDay] = useState(11);

  useEffect(() => {
    const fetchData = async () => {
      const [salesRes, expRes, saleExpRes, settingsRes] = await Promise.all([
        supabase.from('sales').select('*'),
        supabase.from('expenses').select('*'),
        supabase.from('sale_expenses').select('*'),
        supabase.from('business_settings').select('*').eq('id', 1).maybeSingle(),
      ]);
      setSales((salesRes.data || []) as Sale[]);
      setExpenses((expRes.data || []) as Expense[]);
      setSaleExpenses((saleExpRes.data || []) as SaleExpense[]);
      setCycleStartDay((settingsRes.data as BusinessSettings)?.monthly_cycle_start_day ?? 11);
      setLoading(false);
    };
    fetchData();
  }, []);

  const monthlyData = useMemo<MonthData[]>(() => {
    const months = getLastNMonths(12, cycleStartDay);
    return months.map((range) => {
      const monthSales = sales.filter((s) => isInRange(s.date, range) && s.status === 'completed');
      const monthSaleExp = saleExpenses.filter((e) => isInRange(e.date || e.created_at, range) && monthSales.some((s) => s.id === e.sale_id));
      const monthGenExp = expenses.filter((e) => isInRange(e.date, range));

      const salesRevenue = monthSales.reduce((sum, s) => sum + (s.amount || 0), 0);
      const vatPaid = monthSales.reduce((sum, s) => sum + (s.vat_amount || 0), 0);
      const puppyAcquisition = monthSaleExp.filter((e) => e.category === 'puppy_cost').reduce((sum, e) => sum + (e.amount || 0), 0)
        + monthSales.reduce((sum, s) => sum + (s.puppy_cost || 0), 0);
      const deliveryCosts = monthSaleExp.filter((e) => e.category === 'delivery').reduce((sum, e) => sum + (e.amount || 0), 0)
        + monthSales.reduce((sum, s) => sum + (s.delivery_cost || 0), 0);
      const otherOperating = monthSaleExp.filter((e) => e.category === 'other').reduce((sum, e) => sum + (e.amount || 0), 0)
        + monthGenExp.filter((e) => e.expense_type === 'operating').reduce((sum, e) => sum + (e.amount || 0), 0);
      const operatingTotal = vatPaid + puppyAcquisition + deliveryCosts + otherOperating;
      const netProfit = salesRevenue - operatingTotal;

      const bizExp = monthGenExp.filter((e) => e.expense_type !== 'operating');
      const marketing = bizExp.filter((e) => e.category === 'marketing').reduce((sum, e) => sum + (e.amount || 0), 0);
      const bills = bizExp.filter((e) => e.category === 'bills').reduce((sum, e) => sum + (e.amount || 0), 0);
      const rent = bizExp.filter((e) => e.category === 'rent').reduce((sum, e) => sum + (e.amount || 0), 0);
      const subscriptions = bizExp.filter((e) => e.category === 'subscriptions').reduce((sum, e) => sum + (e.amount || 0), 0);
      const vet = bizExp.filter((e) => e.category === 'vet').reduce((sum, e) => sum + (e.amount || 0), 0);
      const misc = bizExp.filter((e) => e.category === 'misc').reduce((sum, e) => sum + (e.amount || 0), 0);
      const bizTotal = marketing + bills + rent + subscriptions + vet + misc;
      const shareholderDividends = netProfit - bizTotal;

      return {
        range,
        salesRevenue,
        operatingCosts: { vatPaid, puppyAcquisition, deliveryCosts, otherOperating, total: operatingTotal },
        netProfit,
        businessExpenses: { marketing, bills, rent, subscriptions, vet, misc, total: bizTotal },
        shareholderDividends,
      };
    });
  }, [sales, expenses, saleExpenses, cycleStartDay]);

  const currentMonth = monthlyData[monthlyData.length - 1] || null;

  const handleExportExcel = () => {
    const rows = monthlyData.map((m) => ({
      Cycle: m.range.label,
      Period: formatCycleRange(m.range),
      SalesRevenue: m.salesRevenue,
      VATPaid: m.operatingCosts.vatPaid,
      PuppyAcquisition: m.operatingCosts.puppyAcquisition,
      DeliveryCosts: m.operatingCosts.deliveryCosts,
      OtherOperating: m.operatingCosts.otherOperating,
      TotalOperating: m.operatingCosts.total,
      NetProfit: m.netProfit,
      Marketing: m.businessExpenses.marketing,
      Bills: m.businessExpenses.bills,
      Rent: m.businessExpenses.rent,
      Subscriptions: m.businessExpenses.subscriptions,
      Vet: m.businessExpenses.vet,
      Misc: m.businessExpenses.misc,
      TotalBusiness: m.businessExpenses.total,
      ShareholderDividends: m.shareholderDividends,
    }));
    exportToCSV('puppyfy-financial-report.csv', rows);
    toast('success', 'Financial report exported');
  };

  const handleExportPDF = () => {
    window.print();
    toast('success', 'Use your browser print dialog to save as PDF');
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Financial Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Three-tier financial statement with monthly cycle comparison</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportPDF} className="btn-secondary"><FileDown className="w-4 h-4" /> Export PDF</button>
          <button onClick={handleExportExcel} className="btn-secondary"><TableIcon className="w-4 h-4" /> Export Excel</button>
        </div>
      </div>

      {currentMonth && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white">Monthly Financial Statement</h2>
            <span className="text-sm text-accent-400 font-medium">{currentMonth.range.label}</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">{formatCycleRange(currentMonth.range)}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <TierSummary label="Tier 1 — Sales Revenue" value={formatAED(currentMonth.salesRevenue)} color="blue" icon={<DollarSign className="w-5 h-5" />} />
            <TierSummary label="Tier 2 — Net Profit" value={formatAED(currentMonth.netProfit)} color="green" icon={<TrendingUp className="w-5 h-5" />} />
            <TierSummary label="Tier 3 — Shareholder Dividends" value={formatAED(currentMonth.shareholderDividends)} color="gold" icon={<Gem className="w-5 h-5" />} />
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Operating Costs Breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <BreakdownItem label="VAT Paid" value={formatAED(currentMonth.operatingCosts.vatPaid)} />
              <BreakdownItem label="Puppy Acquisition" value={formatAED(currentMonth.operatingCosts.puppyAcquisition)} />
              <BreakdownItem label="Delivery Costs" value={formatAED(currentMonth.operatingCosts.deliveryCosts)} />
              <BreakdownItem label="Other Operating" value={formatAED(currentMonth.operatingCosts.otherOperating)} />
            </div>
            <div className="mt-3 flex justify-between items-center px-4 py-2.5 rounded-lg bg-primary-950/50 border border-primary-800">
              <span className="text-sm text-gray-400">Total Operating Costs</span>
              <span className="text-sm font-semibold text-error-400">{formatAED(currentMonth.operatingCosts.total)}</span>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Business Expenses Breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <BreakdownItem label="Marketing" value={formatAED(currentMonth.businessExpenses.marketing)} />
              <BreakdownItem label="Bills & Utilities" value={formatAED(currentMonth.businessExpenses.bills)} />
              <BreakdownItem label="Rent" value={formatAED(currentMonth.businessExpenses.rent)} />
              <BreakdownItem label="Subscriptions" value={formatAED(currentMonth.businessExpenses.subscriptions)} />
              <BreakdownItem label="Veterinary Bills" value={formatAED(currentMonth.businessExpenses.vet)} />
              <BreakdownItem label="Other Business" value={formatAED(currentMonth.businessExpenses.misc)} />
            </div>
            <div className="mt-3 flex justify-between items-center px-4 py-2.5 rounded-lg bg-primary-950/50 border border-primary-800">
              <span className="text-sm text-gray-400">Total Business Expenses</span>
              <span className="text-sm font-semibold text-amber-400">{formatAED(currentMonth.businessExpenses.total)}</span>
            </div>
          </div>

          <div className="flex justify-between items-center px-5 py-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20">
            <div className="flex items-center gap-2">
              <Gem className="w-5 h-5 text-amber-400" />
              <span className="text-base font-semibold text-white">Shareholder Dividends</span>
            </div>
            <span className="text-xl font-bold text-amber-400">{formatAED(currentMonth.shareholderDividends)}</span>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <h2 className="text-lg font-semibold text-white p-5 pb-3">12-Month Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                <th className="px-4 py-3 font-medium">Cycle</th>
                <th className="px-4 py-3 font-medium text-right">Revenue</th>
                <th className="px-4 py-3 font-medium text-right">Operating Costs</th>
                <th className="px-4 py-3 font-medium text-right">Net Profit</th>
                <th className="px-4 py-3 font-medium text-right">Business Exp.</th>
                <th className="px-4 py-3 font-medium text-right">Dividends</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m, i) => (
                <tr key={i} className="table-row">
                  <td className="px-4 py-3 text-sm text-white font-medium">{m.range.label}</td>
                  <td className="px-4 py-3 text-sm text-secondary-300 text-right font-medium">{formatAED(m.salesRevenue)}</td>
                  <td className="px-4 py-3 text-sm text-error-400 text-right">{formatAED(m.operatingCosts.total)}</td>
                  <td className={`px-4 py-3 text-sm text-right font-medium ${m.netProfit >= 0 ? 'text-success-400' : 'text-error-400'}`}>{formatAED(m.netProfit)}</td>
                  <td className="px-4 py-3 text-sm text-amber-400 text-right">{formatAED(m.businessExpenses.total)}</td>
                  <td className={`px-4 py-3 text-sm text-right font-bold ${m.shareholderDividends >= 0 ? 'text-amber-400' : 'text-error-400'}`}>{formatAED(m.shareholderDividends)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TierSummary({ label, value, color, icon }: { label: string; value: string; color: 'blue' | 'green' | 'gold'; icon: React.ReactNode }) {
  const colors: Record<string, string> = {
    blue: 'border-secondary-400/20 bg-secondary-400/5 text-secondary-300',
    green: 'border-brand-sage/30 bg-brand-sage/10 text-success-400',
    gold: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-3">{icon}<span className="text-xs uppercase tracking-wider">{label}</span></div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function BreakdownItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-primary-950/40 border border-primary-800">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-white mt-1">{value}</p>
    </div>
  );
}
