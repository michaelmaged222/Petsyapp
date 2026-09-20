import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: string;
  trendUp?: boolean;
  accent?: 'green' | 'blue' | 'amber' | 'red' | 'teal';
}

const ACCENT_COLORS: Record<string, string> = {
  green: 'bg-brand-sage/15 text-secondary-300 border-brand-sage/30',
  blue: 'bg-secondary-400/10 text-secondary-300 border-secondary-400/20',
  amber: 'bg-warning-500/10 text-warning-400 border-warning-500/20',
  red: 'bg-error-500/10 text-error-400 border-error-500/20',
  teal: 'bg-accent-500/10 text-accent-400 border-accent-500/20',
};

export default function StatCard({ label, value, icon, trend, trendUp, accent = 'green' }: StatCardProps) {
  return (
    <div className="card card-hover p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${ACCENT_COLORS[accent]}`}>
          {icon}
        </div>
        {trend && (
          <div className={`text-xs font-medium px-2 py-1 rounded-full ${trendUp ? 'bg-success-500/10 text-success-400' : 'bg-error-500/10 text-error-400'}`}>
            {trend}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  );
}
