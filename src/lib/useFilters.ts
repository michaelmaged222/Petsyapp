import { useState, useCallback, useMemo, useEffect } from 'react';

export interface FilterState {
  [key: string]: string;
}

const STORAGE_KEY = 'crm_global_filters';

const GLOBAL_DATE_KEYS = ['dateFrom', 'dateTo'] as const;

function loadPersistedFilters<T extends FilterState>(initial: T): { draft: T; applied: T } {
  const fullInitial = { dateFrom: '', dateTo: '', ...initial } as T;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { draft: fullInitial, applied: fullInitial };
    const parsed = JSON.parse(raw) as Partial<T>;
    const merged = { ...fullInitial, ...parsed } as T;
    return { draft: merged, applied: merged };
  } catch {
    return { draft: fullInitial, applied: fullInitial };
  }
}

export function useFilters<T extends FilterState>(initial: T) {
  const [state, setState] = useState(() => loadPersistedFilters(initial));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.applied));
    } catch {
      // ignore storage errors
    }
  }, [state.applied]);

  const draft = state.draft;
  const applied = state.applied;

  const setDraftValue = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setState((prev) => ({ ...prev, draft: { ...prev.draft, [key]: value } }));
  }, []);

  const apply = useCallback(() => {
    setState((prev) => ({ ...prev, applied: prev.draft }));
  }, []);

  const clear = useCallback(() => {
    const fullInitial = { dateFrom: '', dateTo: '', ...initial } as T;
    setState((prev) => ({
      draft: { ...fullInitial, dateFrom: prev.applied.dateFrom, dateTo: prev.applied.dateTo },
      applied: { ...fullInitial, dateFrom: prev.applied.dateFrom, dateTo: prev.applied.dateTo },
    }));
  }, [initial]);

  const hasChanges = useMemo(() => {
    return (Object.keys(draft) as (keyof T)[]).some((key) => draft[key] !== applied[key]);
  }, [draft, applied]);

  return { draft, applied, setDraftValue, apply, clear, hasChanges };
}
