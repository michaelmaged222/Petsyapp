import { TrendingUp, DollarSign, Gem, Megaphone, Trophy, Filter, Calendar, Check, X, BarChart3 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { formatAED, getGreeting, timeAgo } from '@/lib/utils';
import { formatEGP } from '@/lib/commission';
import { formatCycleRange } from '@/lib/financialCycle';
import { useStatsData } from '@/lib/useStatsData';
import { PageSkeleton } from '@/components/LoadingSpinner';

interface DashboardProps {
  onNavigateToStats?: () => void;
}

export default function Dashboard({ onNavigateToStats }: DashboardProps) {
  const { user } = useAuth();
  const {
    loading, refetching, stats, employees,
    recentActivity, upcomingEvents,
    draft, setDraftValue, apply, clear, hasChanges,
  } = useStatsData();

  if (loading) return <PageSkeleton />;

  return (
    <div className={`dashboard-light min-h-full -m-4 lg:-m-6 p-4 lg:p-6 space-y-6 transition-opacity ${refetching ? 'opacity-60' : 'opacity-100'}`}>
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {getGreeting()}, {user?.name?.split(' ')[0] || 'there'} <span className="text-secondary-600">pawtner</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Filters — Date From / To + Employee */}
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

      {/* Three-tier financial stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Tier 1: Sales Revenue — blue */}
        <TierCard
          label="Sales Revenue"
          value={formatAED(stats.tier.salesRevenue)}
          icon={<DollarSign className="w-5 h-5" />}
          accent="blue"
          subtitle="Tier 1 — all completed sales"
        />
        {/* Tier 2: Net Profit — green */}
        <TierCard
          label="Net Profit"
          value={formatAED(stats.tier.netProfit)}
          icon={<TrendingUp className="w-5 h-5" />}
          accent={stats.tier.netProfit >= 0 ? 'green' : 'red'}
          subtitle="Tier 2 — after operating costs"
        />
        {/* Tier 3: Shareholder Dividends — gold */}
        <TierCard
          label="Shareholder Dividends"
          value={formatAED(stats.tier.shareholderDividends)}
          icon={<Gem className="w-5 h-5" />}
          accent={stats.tier.shareholderDividends >= 0 ? 'gold' : 'red'}
          subtitle="Tier 3 — after all expenses"
        />
      </div>

      {/* Marketing stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Marketing Net Profit */}
        <TierCard
          label="Marketing Net Profit"
          value={formatAED(stats.marketingNetProfit)}
          icon={<Megaphone className="w-5 h-5" />}
          accent={stats.marketingNetProfit >= 0 ? 'green' : 'red'}
          subtitle="Current cycle"
        />
        {/* Marketing Commission */}
        <div className="card p-5 border-accent-500/20 bg-gradient-to-br from-accent-500/5 to-transparent">
          <div className="flex items-start justify-between mb-3">
            <div className="w-11 h-11 rounded-xl border border-accent-500/20 bg-accent-500/10 text-accent-400 flex items-center justify-center">
              <Trophy className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-accent-400 tracking-tight">{formatEGP(stats.commission.commission)}</p>
          <p className="text-sm text-gray-500 mt-1">Marketing Commission</p>
          <p className="text-xs text-gray-600 mt-0.5">{stats.commission.bracketLabel}</p>
        </div>
      </div>

      {/* Link to full Stats page */}
      {onNavigateToStats && (
        <div className="flex justify-center">
          <button onClick={onNavigateToStats} className="btn-secondary text-sm inline-flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> View Full Stats & Analytics
          </button>
        </div>
      )}

      {/* Recent activity + Upcoming events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="lg:col-span-2 card p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No recent activity</p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-primary-800/30 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-accent-500/15 flex items-center justify-center text-accent-400 text-xs font-semibold shrink-0">
                    {activity.user_name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300">
                      <span className="font-medium text-white">{activity.user_name}</span>{' '}
                      <span className="text-gray-500">{activity.action}</span>
                    </p>
                    {activity.target && <p className="text-xs text-gray-600 mt-0.5">{activity.target}</p>}
                  </div>
                  <span className="text-xs text-gray-600 shrink-0">{timeAgo(activity.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming events */}
        <div className="card p-5">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-accent-400" />
            Upcoming Events
          </h2>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No upcoming events</p>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map((event) => {
                const colorClass =
                  event.type === 'handover' ? 'border-l-accent-500 bg-accent-500/5' :
                  event.type === 'follow_up' ? 'border-l-blue-500 bg-blue-500/5' :
                  'border-l-error-500 bg-error-500/5';
                return (
                  <div key={event.id} className={`px-3 py-2.5 rounded-lg border-l-2 ${colorClass}`}>
                    <p className="text-sm font-medium text-white">{event.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(event.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TierCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: 'blue' | 'green' | 'red' | 'gold';
  subtitle: string;
}

const TIER_COLORS: Record<string, string> = {
  blue: 'bg-secondary-400/10 text-secondary-300 border-secondary-400/20',
  green: 'bg-brand-sage/15 text-secondary-300 border-brand-sage/30',
  red: 'bg-error-500/10 text-error-400 border-error-500/20',
  gold: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

function TierCard({ label, value, icon, accent, subtitle }: TierCardProps) {
  return (
    <div className="card card-hover p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${TIER_COLORS[accent]}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
      <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>
    </div>
  );
}
