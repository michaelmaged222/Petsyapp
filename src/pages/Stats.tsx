import { DollarSign, TrendingUp, Gem, Filter, Flame, Bone, BadgePercent, Clock, CheckCircle2, Target, Megaphone, Trophy, Calendar, Check, X, FileText, Users, AlertCircle, Wallet, TrendingDown, Receipt } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { formatAED, formatNumber } from '@/lib/utils';
import { formatEGP } from '@/lib/commission';
import { formatCycleRange } from '@/lib/financialCycle';
import { useStatsData } from '@/lib/useStatsData';
import StatCard from '@/components/StatCard';
import { PageSkeleton } from '@/components/LoadingSpinner';

export default function StatsPage() {
  const { user } = useAuth();
  const {
    loading, refetching, stats, employees,
    draft, setDraftValue, apply, clear, hasChanges,
  } = useStatsData();

  if (loading) return <PageSkeleton />;

  return (
    <div className={`dashboard-light min-h-full -m-4 lg:-m-6 p-4 lg:p-6 space-y-6 transition-opacity ${refetching ? 'opacity-60' : 'opacity-100'}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Stats & Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-gray-500" />
            <input type="date" value={draft.dateFrom} onChange={(e) => setDraftValue('dateFrom', e.target.value)} className="input text-sm py-2 w-auto" placeholder="From" />
            <span className="text-gray-600 text-sm">to</span>
            <input type="date" value={draft.dateTo} onChange={(e) => setDraftValue('dateTo', e.target.value)} className="input text-sm py-2 w-auto" placeholder="To" />
          </div>
          <select value={draft.employeeFilter} onChange={(e) => setDraftValue('employeeFilter', e.target.value)} className="select text-sm py-2">
            <option value="all">All Employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
          {hasChanges && (
            <button onClick={apply} className="btn-primary text-sm py-2">
              <Check className="w-4 h-4" /> Apply
            </button>
          )}
          {(draft.dateFrom || draft.dateTo || draft.employeeFilter !== 'all') && (
            <button onClick={clear} className="btn-ghost text-sm py-2">
              <X className="w-4 h-4" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Current cycle banner */}
      <div className="card p-3 bg-primary-950/40 border-primary-800">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Calendar className="w-4 h-4 text-accent-400" />
          <span>Current cycle: <span className="text-white font-medium">{stats.currentCycle.label}</span></span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-500">{formatCycleRange(stats.currentCycle)}</span>
        </div>
      </div>

      {/* Three-Tier Financial Model */}
      <section>
        <h2 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Three-Tier Financial Model</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Sales Revenue (Tier 1)" value={formatAED(stats.tier.salesRevenue)} icon={<DollarSign className="w-5 h-5" />} accent="blue" />
          <StatCard label="Net Profit (Tier 2)" value={formatAED(stats.tier.netProfit)} icon={<TrendingUp className="w-5 h-5" />} accent={stats.tier.netProfit >= 0 ? 'green' : 'red'} />
          <StatCard label="Shareholder Dividends (Tier 3)" value={formatAED(stats.tier.shareholderDividends)} icon={<Gem className="w-5 h-5" />} accent={stats.tier.shareholderDividends >= 0 ? 'green' : 'red'} />
        </div>
      </section>

      {/* Operating Costs Breakdown */}
      <section>
        <h2 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Operating Costs Breakdown (Tier 2)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="VAT Paid" value={formatAED(stats.tier.operatingCosts.vatPaid)} icon={<BadgePercent className="w-5 h-5" />} accent="amber" />
          <StatCard label="Puppy Acquisition" value={formatAED(stats.tier.operatingCosts.puppyAcquisition)} icon={<Bone className="w-5 h-5" />} accent="red" />
          <StatCard label="Delivery Costs" value={formatAED(stats.tier.operatingCosts.deliveryCosts)} icon={<TrendingDown className="w-5 h-5" />} accent="red" />
          <StatCard label="Other Operating" value={formatAED(stats.tier.operatingCosts.otherOperating)} icon={<Receipt className="w-5 h-5" />} accent="red" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div className="card p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500">Total Operating Costs</p>
            <p className="text-2xl font-bold text-error-400 mt-2">{formatAED(stats.tier.operatingCosts.total)}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500">Cash In</p>
            <p className="text-2xl font-bold text-success-400 mt-2">{formatAED(stats.cashIn)}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500">Outstanding Payments</p>
            <p className="text-2xl font-bold text-amber-400 mt-2">{formatAED(stats.outstanding)}</p>
          </div>
        </div>
      </section>

      {/* Business Expenses Breakdown */}
      <section>
        <h2 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Business Expenses Breakdown (Tier 3)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Marketing" value={formatAED(stats.tier.businessExpenses.marketing)} icon={<Megaphone className="w-5 h-5" />} accent="teal" />
          <StatCard label="Bills & Utilities" value={formatAED(stats.tier.businessExpenses.bills)} icon={<Receipt className="w-5 h-5" />} accent="blue" />
          <StatCard label="Rent" value={formatAED(stats.tier.businessExpenses.rent)} icon={<Wallet className="w-5 h-5" />} accent="amber" />
          <StatCard label="Subscriptions" value={formatAED(stats.tier.businessExpenses.subscriptions)} icon={<Receipt className="w-5 h-5" />} accent="teal" />
          <StatCard label="Veterinary" value={formatAED(stats.tier.businessExpenses.vet)} icon={<Receipt className="w-5 h-5" />} accent="green" />
          <StatCard label="Other Business" value={formatAED(stats.tier.businessExpenses.misc)} icon={<Receipt className="w-5 h-5" />} accent="green" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="card p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500">Total Business Expenses</p>
            <p className="text-2xl font-bold text-amber-400 mt-2">{formatAED(stats.tier.businessExpenses.total)}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500">Cash Out (All Costs)</p>
            <p className="text-2xl font-bold text-error-400 mt-2">{formatAED(stats.cashOut)}</p>
          </div>
        </div>
      </section>

      {/* Contracts & Clients */}
      <section>
        <h2 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Contracts & Clients</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Contracts" value={formatNumber(stats.contractCount)} icon={<FileText className="w-5 h-5" />} accent="blue" />
          <StatCard label="Pending Contracts" value={formatNumber(stats.pendingContracts)} icon={<Clock className="w-5 h-5" />} accent="amber" />
          <StatCard label="Signed Contracts" value={formatNumber(stats.signedContracts)} icon={<CheckCircle2 className="w-5 h-5" />} accent="green" />
          <StatCard label="Clients" value={formatNumber(stats.totalClients)} icon={<Users className="w-5 h-5" />} accent="blue" />
        </div>
      </section>

      {/* Leads & Puppies */}
      <section>
        <h2 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Leads & Puppies</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Leads" value={formatNumber(stats.leadCount)} icon={<Users className="w-5 h-5" />} accent="blue" />
          <StatCard label="Hot Leads" value={formatNumber(stats.hotLeads)} icon={<Flame className="w-5 h-5" />} accent="red" />
          <StatCard label="Puppies Sold" value={formatNumber(stats.puppiesSold)} icon={<Bone className="w-5 h-5" />} accent="green" />
          <StatCard label="Avg Sale Value" value={formatAED(stats.avgSaleValue)} icon={<Target className="w-5 h-5" />} accent="blue" />
        </div>
      </section>

      {/* Marketing Performance */}
      <section>
        <h2 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-3">Marketing Performance</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="Marketing Sales Revenue" value={formatAED(stats.marketingSalesRevenue)} icon={<Megaphone className="w-5 h-5" />} accent="teal" />
          <StatCard label="Marketing Net Profit" value={formatAED(stats.marketingNetProfit)} icon={<TrendingUp className="w-5 h-5" />} accent={stats.marketingNetProfit >= 0 ? 'green' : 'red'} />
        </div>
      </section>

      {/* Marketing Commission — Admin & Marketing only */}
      {(user?.role === 'admin' || user?.role === 'marketing') && (
        <div className="card p-5 border-accent-500/20 bg-gradient-to-br from-accent-500/5 to-transparent">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-accent-400" />
            <h2 className="text-lg font-semibold text-white">Marketing Commission</h2>
            <span className="text-xs text-gray-500 ml-auto">
              {stats.periodLabel}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Net Profit (AED)</p>
              <p className="text-2xl font-bold text-white mt-1">{formatAED(stats.monthMktNetProfit)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Commission Earned</p>
              <p className="text-2xl font-bold text-accent-400 mt-1">{formatEGP(stats.commission.commission)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Bracket</p>
              <p className="text-sm font-medium text-gray-300 mt-1">{stats.commission.bracketLabel}</p>
            </div>
          </div>
          {stats.commission.nextBracket ? (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Progress to {formatEGP(stats.commission.nextBracket.commission)}</span>
                <span>{Math.round(stats.commission.progressToNext)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-primary-800 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-accent-500 to-secondary-400 transition-all duration-500" style={{ width: `${stats.commission.progressToNext}%` }} />
              </div>
              <p className="text-xs text-gray-600 mt-1.5">
                {formatAED(Math.max(stats.commission.nextBracket.threshold - stats.monthMktNetProfit, 0))} more to reach next bracket
              </p>
            </div>
          ) : (
            <p className="text-sm text-success-400 font-medium">Top bracket reached!</p>
          )}
        </div>
      )}
    </div>
  );
}
