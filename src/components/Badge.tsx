interface BadgeProps {
  variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'hot' | 'warm' | 'cold';
  children: React.ReactNode;
}

const VARIANTS: Record<string, string> = {
  success: 'bg-success-500/15 text-success-400 border border-success-500/20',
  warning: 'bg-warning-500/15 text-warning-500 border border-warning-500/20',
  error: 'bg-error-500/15 text-error-400 border border-error-500/20',
  info: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  neutral: 'bg-primary-700/50 text-gray-400 border border-primary-600',
  hot: 'bg-error-500/15 text-error-400 border border-error-500/20',
  warm: 'bg-warning-500/15 text-warning-500 border border-warning-500/20',
  cold: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
};

export default function Badge({ variant, children }: BadgeProps) {
  return <span className={`badge ${VARIANTS[variant]}`}>{children}</span>;
}
