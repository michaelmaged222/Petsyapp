import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const sizeClass = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }[size];
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 className={`${sizeClass} animate-spin text-accent-500`} />
      {label && <p className="text-sm text-gray-500">{label}</p>}
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          {[...Array(6)].map((_, j) => (
            <div key={j} className="h-10 bg-primary-800/50 rounded-lg flex-1" style={{ animationDelay: `${i * 100 + j * 50}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-primary-800/50 rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-primary-800/50 rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-primary-800/50 rounded-xl" />
    </div>
  );
}
