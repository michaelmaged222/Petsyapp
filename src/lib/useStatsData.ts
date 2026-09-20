import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useFilters } from '@/lib/useFilters';
import { fetchRecentActivity } from '@/lib/activity';
import { getCurrentCycle, isInRange, formatCycleRange, type CycleRange } from '@/lib/financialCycle';
import type { Profile, ActivityLog, Contract, Sale, Expense, Lead, CalendarEvent, SalePayment, SaleExpense, BusinessSettings } from '@/lib/supabase';
import { getCommissionForProfit } from '@/lib/commission';

export interface TierBreakdown {
  salesRevenue: number;
  operatingCosts: {
    vatPaid: number;
    puppyAcquisition: number;
    deliveryCosts: number;
    otherOperating: number;
    total: number;
  };
  netProfit: number;
  businessExpenses: {
    marketing: number;
    bills: number;
    rent: number;
    subscriptions: number;
    vet: number;
    salaries: number;
    misc: number;
    total: number;
  };
  shareholderDividends: number;
}

export interface StatsData {
  cashIn: number;
  cashOut: number;
  outstanding: number;
  tier: TierBreakdown;
  marketingNetProfit: number;
  marketingSalesRevenue: number;
  monthMktNetProfit: number;
  commission: ReturnType<typeof getCommissionForProfit>;
  contractCount: number;
  pendingContracts: number;
  signedContracts: number;
  totalClients: number;
  leadCount: number;
  hotLeads: number;
  puppiesSold: number;
  avgSaleValue: number;
  vatCollected: number;
  filteredSalesCount: number;
  currentCycle: CycleRange;
  periodLabel: string;
}

export interface StatsState {
  loading: boolean;
  refetching: boolean;
  contracts: Contract[];
  clientCount: number;
  sales: Sale[];
  expenses: Expense[];
  leads: Lead[];
  salePayments: SalePayment[];
  saleExpenses: SaleExpense[];
  recentActivity: ActivityLog[];
  upcomingEvents: CalendarEvent[];
  employees: Profile[];
  businessSettings: BusinessSettings | null;
  stats: StatsData;
  draft: ReturnType<typeof useFilters<{ dateFrom: string; dateTo: string; employeeFilter: string }>>['draft'];
  applied: ReturnType<typeof useFilters<{ dateFrom: string; dateTo: string; employeeFilter: string }>>['applied'];
  setDraftValue: ReturnType<typeof useFilters<{ dateFrom: string; dateTo: string; employeeFilter: string }>>['setDraftValue'];
  apply: ReturnType<typeof useFilters<{ dateFrom: string; dateTo: string; employeeFilter: string }>>['apply'];
  clear: ReturnType<typeof useFilters<{ dateFrom: string; dateTo: string; employeeFilter: string }>>['clear'];
  hasChanges: ReturnType<typeof useFilters<{ dateFrom: string; dateTo: string; employeeFilter: string }>>['hasChanges'];
}

export function useStatsData(): StatsState {
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [salePayments, setSalePayments] = useState<SalePayment[]>([]);
  const [saleExpenses, setSaleExpenses] = useState<SaleExpense[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const { draft, applied, setDraftValue, apply, clear, hasChanges } = useFilters({
    dateFrom: '', dateTo: '', employeeFilter: 'all',
  });

  useEffect(() => {
    const fetchData = async () => {
      const isFirstLoad = contracts.length === 0 && clientCount === 0;
      if (isFirstLoad) setLoading(true); else setRefetching(true);
      const now = new Date();
      const [contractsRes, clientsRes, salesRes, expensesRes, leadsRes, paymentsRes, saleExpRes, activityRes, eventsRes, employeesRes, settingsRes] = await Promise.all([
        supabase.from('contracts').select('*').order('created_at', { ascending: false }),
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('sales').select('*').order('date', { ascending: false }),
        supabase.from('expenses').select('*').order('date', { ascending: false }),
        supabase.from('leads').select('*').order('created_at', { ascending: false }),
        supabase.from('sale_payments').select('*'),
        supabase.from('sale_expenses').select('*'),
        fetchRecentActivity(15),
        supabase.from('calendar_events').select('*').gte('date', now.toISOString().split('T')[0]).order('date', { ascending: true }).limit(5),
        supabase.from('profiles').select('*').order('name', { ascending: true }),
        supabase.from('business_settings').select('*').eq('id', 1).maybeSingle(),
      ]);

      setContracts((contractsRes.data || []) as Contract[]);
      setClientCount(clientsRes.count || 0);
      setSales((salesRes.data || []) as Sale[]);
      setExpenses((expensesRes.data || []) as Expense[]);
      setLeads((leadsRes.data || []) as Lead[]);
      setSalePayments((paymentsRes.data || []) as SalePayment[]);
      setSaleExpenses((saleExpRes.data || []) as SaleExpense[]);
      setRecentActivity(activityRes);
      setUpcomingEvents((eventsRes.data || []) as CalendarEvent[]);
      setEmployees((employeesRes.data || []) as Profile[]);
      setBusinessSettings((settingsRes.data as BusinessSettings) || { id: 1, monthly_cycle_start_day: 11, updated_by: null, updated_at: new Date().toISOString() });
      setLoading(false);
      setRefetching(false);
    };
    fetchData();
  }, []);

  const cycleStartDay = businessSettings?.monthly_cycle_start_day ?? 11;
  const currentCycle = useMemo(() => getCurrentCycle(cycleStartDay), [cycleStartDay]);

  const stats = useMemo<StatsData>(() => {
    const from = applied.dateFrom ? new Date(applied.dateFrom) : currentCycle.start;
    const to = applied.dateTo ? new Date(applied.dateTo + 'T23:59:59') : currentCycle.end;

    const inDateRange = (d: string) => {
      const date = new Date(d);
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    };

    const filterByEmployee = <T extends { created_by?: string | null; employee_id?: string | null; added_by?: string | null; assigned_to?: string | null }>(arr: T[]) => {
      if (applied.employeeFilter === 'all') return arr;
      return arr.filter((item) => {
        const empId = item.created_by || item.employee_id || item.added_by || item.assigned_to;
        return empId === applied.employeeFilter;
      });
    };

    const filteredSales = filterByEmployee(sales.filter((s) => inDateRange(s.date) && s.status === 'completed'));
    const filteredContracts = filterByEmployee(contracts.filter((c) => inDateRange(c.created_at)));
    const filteredExpenses = filterByEmployee(expenses.filter((e) => inDateRange(e.date)));
    const filteredSaleExpenses = saleExpenses.filter((e) => inDateRange(e.date || e.created_at) && filteredSales.some((sale) => sale.id === e.sale_id));

    const paymentsBySale = new Map<string, number>();
    salePayments.forEach((p) => {
      paymentsBySale.set(p.sale_id, (paymentsBySale.get(p.sale_id) || 0) + (p.amount || 0));
    });
    const filteredSaleIds = new Set(filteredSales.map((s) => s.id));
    const cashIn = salePayments.filter((p) => inDateRange(p.created_at) && filteredSaleIds.has(p.sale_id)).reduce((sum, p) => sum + (p.amount || 0), 0);

    // Tier 1: Sales Revenue
    const salesRevenue = filteredSales.reduce((sum, s) => sum + (s.amount || 0), 0);

    // Tier 2: Operating Costs
    const vatPaid = filteredSales.reduce((sum, s) => sum + (s.vat_amount || 0), 0);
    const puppyAcquisition = filteredSaleExpenses.filter((e) => e.category === 'puppy_cost').reduce((sum, e) => sum + (e.amount || 0), 0)
      + filteredSales.reduce((sum, s) => sum + (s.puppy_cost || 0), 0);
    const deliveryCosts = filteredSaleExpenses.filter((e) => e.category === 'delivery').reduce((sum, e) => sum + (e.amount || 0), 0)
      + filteredSales.reduce((sum, s) => sum + (s.delivery_cost || 0), 0);
    const otherOperating = filteredSaleExpenses.filter((e) => e.category === 'other').reduce((sum, e) => sum + (e.amount || 0), 0)
      + filteredExpenses.filter((e) => e.expense_type === 'operating').reduce((sum, e) => sum + (e.amount || 0), 0);
    const operatingCostsTotal = vatPaid + puppyAcquisition + deliveryCosts + otherOperating;

    // Tier 2: Net Profit
    const netProfit = salesRevenue - operatingCostsTotal;

    // Tier 3: Business Expenses (only non-operating from expenses table)
    const businessExpensesList = filteredExpenses.filter((e) => e.expense_type !== 'operating');
    const marketingExp = businessExpensesList.filter((e) => e.category === 'marketing').reduce((sum, e) => sum + (e.amount || 0), 0);
    const billsExp = businessExpensesList.filter((e) => e.category === 'bills').reduce((sum, e) => sum + (e.amount || 0), 0);
    const rentExp = businessExpensesList.filter((e) => e.category === 'rent').reduce((sum, e) => sum + (e.amount || 0), 0);
    const subscriptionsExp = businessExpensesList.filter((e) => e.category === 'subscriptions').reduce((sum, e) => sum + (e.amount || 0), 0);
    const vetExp = businessExpensesList.filter((e) => e.category === 'vet').reduce((sum, e) => sum + (e.amount || 0), 0);
    const miscExp = businessExpensesList.filter((e) => e.category === 'misc').reduce((sum, e) => sum + (e.amount || 0), 0);
    const businessExpensesTotal = marketingExp + billsExp + rentExp + subscriptionsExp + vetExp + miscExp;

    // Tier 3: Shareholder Dividends
    const shareholderDividends = netProfit - businessExpensesTotal;

    const cashOut = operatingCostsTotal + businessExpensesTotal;
    const outstanding = filteredSales.reduce((sum, s) => {
      const paid = paymentsBySale.get(s.id) || 0;
      const owed = Math.max((s.amount || 0) - paid, 0);
      return sum + owed;
    }, 0);

    // Marketing separation
    const marketingSales = filteredSales.filter((s) => s.sale_source === 'new_client_marketing');
    const marketingSalesRevenue = marketingSales.reduce((sum, s) => sum + (s.amount || 0), 0);
    const marketingSaleIds = new Set(marketingSales.map((s) => s.id));
    const marketingOpEx = filteredSaleExpenses.filter((e) => marketingSaleIds.has(e.sale_id)).reduce((sum, e) => sum + (e.amount || 0), 0)
      + marketingSales.reduce((sum, s) => sum + (s.puppy_cost || 0) + (s.delivery_cost || 0) + (s.vat_amount || 0), 0);
    const marketingNetProfit = marketingSalesRevenue - marketingOpEx;

    const commission = getCommissionForProfit(marketingNetProfit);
    const periodLabel = (applied.dateFrom || applied.dateTo)
      ? `${from.toLocaleDateString('en-GB')} – ${to.toLocaleDateString('en-GB')}`
      : formatCycleRange(currentCycle);

    const filteredLeads = filterByEmployee(leads.filter((l) => inDateRange(l.created_at)));
    const leadCount = filteredLeads.length;
    const hotLeads = filteredLeads.filter((l) => l.quality === 'hot').length;
    const puppiesSold = filteredSales.length;
    const avgSaleValue = filteredSales.length > 0 ? salesRevenue / filteredSales.length : 0;
    const vatCollected = filteredSales.reduce((sum, s) => sum + (s.vat_amount || 0), 0);
    const pendingContracts = filteredContracts.filter((c) => c.status === 'draft' || c.status === 'sent').length;
    const signedContracts = filteredContracts.filter((c) => c.status === 'signed').length;

    return {
      cashIn, cashOut, outstanding,
      tier: {
        salesRevenue,
        operatingCosts: { vatPaid, puppyAcquisition, deliveryCosts, otherOperating, total: operatingCostsTotal },
        netProfit,
        businessExpenses: { marketing: marketingExp, bills: billsExp, rent: rentExp, subscriptions: subscriptionsExp, vet: vetExp, salaries: 0, misc: miscExp, total: businessExpensesTotal },
        shareholderDividends,
      },
      marketingNetProfit, marketingSalesRevenue, monthMktNetProfit: marketingNetProfit, commission, periodLabel,
      contractCount: filteredContracts.length, pendingContracts, signedContracts, totalClients: clientCount,
      leadCount, hotLeads, puppiesSold, avgSaleValue, vatCollected, filteredSalesCount: filteredSales.length,
      currentCycle,
    };
  }, [contracts, clientCount, sales, expenses, leads, salePayments, saleExpenses, applied, currentCycle]);

  return {
    loading, refetching, contracts, clientCount, sales, expenses, leads, salePayments, saleExpenses,
    recentActivity, upcomingEvents, employees, businessSettings, stats,
    draft, applied, setDraftValue, apply, clear, hasChanges,
  };
}
