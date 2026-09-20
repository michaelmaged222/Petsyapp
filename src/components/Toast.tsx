import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

let toastFn: ((type: ToastType, message: string) => void) | null = null;

export function toast(type: ToastType, message: string) {
  toastFn?.(type, message);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    toastFn = (type: ToastType, message: string) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };
    return () => { toastFn = null; };
  }, []);

  const remove = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] space-y-3">
      {toasts.map((t) => {
        const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? XCircle : Info;
        const colorClass =
          t.type === 'success' ? 'bg-success-500/20 border-success-500/40 text-success-400' :
          t.type === 'error' ? 'bg-error-500/20 border-error-500/40 text-error-400' :
          'bg-accent-500/20 border-accent-500/40 text-accent-400';

        return (
          <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-md animate-slide-up min-w-[300px] max-w-md ${colorClass}`}>
            <Icon className="w-5 h-5 shrink-0" />
            <span className="text-sm flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="opacity-60 hover:opacity-100 transition-opacity">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
