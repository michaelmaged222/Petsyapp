import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/lib/supabase';

interface AuthContextType {
  user: Profile | null;
  loading: boolean;
  isRecoverySession: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string, role: UserRole) => Promise<{ error: string | null }>;
  signUpNewBusiness: (email: string, password: string, name: string, businessName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  isAdmin: boolean;
  isPlatformAdmin: boolean;
  canAccess: (page: string) => boolean;
}

const PAGE_ACCESS: Record<UserRole, string[]> = {
  owner: ['dashboard', 'stats', 'reports', 'leads', 'pipeline', 'sales', 'contracts', 'invoices', 'clients', 'expenses', 'inventory', 'showings', 'marketing', 'employees', 'calendar', 'activity', 'email-logs', 'custom-fields', 'settings', 'tenant', 'audit-logs', 'billing'],
  admin: ['dashboard', 'stats', 'reports', 'leads', 'pipeline', 'sales', 'contracts', 'invoices', 'clients', 'expenses', 'inventory', 'showings', 'marketing', 'employees', 'calendar', 'activity', 'email-logs', 'custom-fields', 'settings', 'tenant', 'billing'],
  finance: ['dashboard', 'stats', 'reports', 'sales', 'invoices', 'clients', 'expenses', 'calendar'],
  sales: ['dashboard', 'stats', 'leads', 'pipeline', 'sales', 'contracts', 'invoices', 'clients', 'inventory', 'showings', 'calendar'],
  marketing: ['dashboard', 'leads', 'pipeline', 'showings', 'marketing', 'calendar'],
  receptionist: ['dashboard', 'leads', 'clients', 'showings', 'calendar'],
  tax_viewer: ['sales'],
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  return data as Profile | null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('Authentication request timed out')), timeoutMs);
    }),
  ]);
}

function clearStaleSession() {
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('sb-') || key === 'puppyfy-auth') {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const recoveryRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          5000,
        );

        if (session && mounted) {
          const profile = await fetchProfile(session.user.id);
          if (mounted) {
            if (profile) {
              setUser(profile);
            } else {
              clearStaleSession();
            }
          }
        }
      } catch {
        clearStaleSession();
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // Safety net: if auth check hangs, fall through to login after 8s
    const timeout = window.setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsRecoverySession(false);
          recoveryRef.current = false;
        }
        if (event === 'PASSWORD_RECOVERY') {
          setIsRecoverySession(true);
          recoveryRef.current = true;
          setLoading(false);
        }
        if (event === 'SIGNED_IN' && session && !recoveryRef.current) {
          (async () => {
            const profile = await fetchProfile(session.user.id);
            if (mounted && profile) setUser(profile);
          })();
        }
      },
    );

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      const maxAttempts = 5;
      for (let i = 0; i < maxAttempts; i++) {
        const profile = await fetchProfile(data.user.id);
        if (profile) {
          setUser(profile);
          return { error: null };
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      clearStaleSession();
      return { error: 'Profile not found. Please contact an administrator.' };
    }
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string, role: UserRole) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role } },
    });
    if (error) return { error: error.message };

    if (data.session && data.user) {
      const maxAttempts = 10;
      for (let i = 0; i < maxAttempts; i++) {
        const profile = await fetchProfile(data.user.id);
        if (profile) {
          setUser(profile);
          return { error: null };
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      clearStaleSession();
      return { error: 'Account created but profile setup failed. Please sign in.' };
    }

    if (data.user && !data.session) {
      return { error: 'Account created. Please sign in with your email and password.' };
    }

    return { error: null };
  }, []);

  const signUpNewBusiness = useCallback(async (email: string, password: string, name: string, businessName: string) => {
    const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role: 'owner', new_business: true, business_name: businessName, business_slug: slug } },
    });
    if (error) return { error: error.message };

    if (data.session && data.user) {
      const maxAttempts = 10;
      for (let i = 0; i < maxAttempts; i++) {
        const profile = await fetchProfile(data.user.id);
        if (profile) {
          setUser(profile);
          return { error: null };
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      clearStaleSession();
      return { error: 'Account created but workspace setup failed. Please sign in.' };
    }

    if (data.user && !data.session) {
      return { error: 'Account created. Please sign in with your email and password.' };
    }

    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    clearStaleSession();
    setUser(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    setIsRecoverySession(false);
    recoveryRef.current = false;
    await supabase.auth.signOut();
    clearStaleSession();
    setUser(null);
    return { error: null };
  }, []);

  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
  const isPlatformAdmin = user?.is_platform_admin === true;

  const canAccess = useCallback((page: string) => {
    if (!user) return false;
    if (page === 'platform-admin' && user.is_platform_admin) return true;
    return PAGE_ACCESS[user.role]?.includes(page) ?? false;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, isRecoverySession, signIn, signUp, signUpNewBusiness, signOut, resetPassword, updatePassword, isAdmin, isPlatformAdmin, canAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
