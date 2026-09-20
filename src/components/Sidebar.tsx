import { PawPrint, LayoutDashboard, Users, DollarSign, FileText, UserCircle, Receipt, Calendar, UserCog, ScrollText, Mail, LogOut, ChevronLeft, Settings, Megaphone, BarChart3, FileBarChart, KanbanSquare, ScanLine, Package, SlidersHorizontal, Eye, Building2, CreditCard, ShieldCheck, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAppLogo } from '@/lib/useAppLogo';
import { useFeatureToggles } from '@/lib/useFeatureToggles';
import type { UserRole } from '@/lib/supabase';
import { ROLE_LABELS } from '@/lib/roles';

export type PageKey = 'dashboard' | 'stats' | 'reports' | 'leads' | 'pipeline' | 'sales' | 'contracts' | 'invoices' | 'clients' | 'expenses' | 'inventory' | 'showings' | 'marketing' | 'employees' | 'calendar' | 'activity' | 'email-logs' | 'custom-fields' | 'settings' | 'tenant' | 'billing' | 'audit-logs' | 'platform-admin';

interface SidebarProps {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS: { key: PageKey; label: string; icon: typeof LayoutDashboard; roles: UserRole[] }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'admin', 'sales', 'marketing', 'finance', 'receptionist'] },
  { key: 'stats', label: 'Stats', icon: BarChart3, roles: ['owner', 'admin', 'sales', 'marketing', 'finance'] },
  { key: 'reports', label: 'Reports', icon: FileBarChart, roles: ['owner', 'admin', 'finance'] },
  { key: 'leads', label: 'Leads', icon: Users, roles: ['owner', 'admin', 'sales', 'marketing', 'receptionist'] },
  { key: 'pipeline', label: 'Pipeline', icon: KanbanSquare, roles: ['owner', 'admin', 'sales', 'marketing'] },
  { key: 'sales', label: 'Sales', icon: DollarSign, roles: ['owner', 'admin', 'sales', 'tax_viewer'] },
  { key: 'contracts', label: 'Contracts', icon: FileText, roles: ['owner', 'admin', 'sales'] },
  { key: 'invoices', label: 'Invoices', icon: ScanLine, roles: ['owner', 'admin', 'sales'] },
  { key: 'clients', label: 'Clients', icon: UserCircle, roles: ['owner', 'admin', 'sales', 'finance', 'receptionist'] },
  { key: 'expenses', label: 'Expenses', icon: Receipt, roles: ['owner', 'admin'] },
  { key: 'inventory', label: 'Inventory', icon: Package, roles: ['owner', 'admin', 'sales'] },
  { key: 'showings', label: 'Showings', icon: Eye, roles: ['owner', 'admin', 'sales', 'marketing', 'receptionist'] },
  { key: 'marketing', label: 'Marketing', icon: Megaphone, roles: ['owner', 'admin', 'marketing'] },
  { key: 'employees', label: 'Employees', icon: UserCog, roles: ['owner', 'admin'] },
  { key: 'calendar', label: 'Calendar', icon: Calendar, roles: ['owner', 'admin', 'sales', 'marketing', 'finance', 'receptionist'] },
  { key: 'activity', label: 'Activity Log', icon: ScrollText, roles: ['owner', 'admin'] },
  { key: 'email-logs', label: 'Email Logs', icon: Mail, roles: ['owner', 'admin'] },
  { key: 'custom-fields', label: 'Custom Fields', icon: SlidersHorizontal, roles: ['owner', 'admin'] },
  { key: 'audit-logs', label: 'Audit Logs', icon: ShieldCheck, roles: ['owner'] },
  { key: 'tenant', label: 'Workspace', icon: Building2, roles: ['owner', 'admin'] },
  { key: 'billing', label: 'Billing', icon: CreditCard, roles: ['owner', 'admin'] },
  { key: 'settings', label: 'Settings', icon: Settings, roles: ['owner', 'admin'] },
  { key: 'platform-admin', label: 'Platform Admin', icon: Shield, roles: ['owner'] },
];

const FEATURE_KEY_MAP: Partial<Record<PageKey, keyof import('@/lib/useFeatureToggles').FeatureToggles>> = {
  pipeline: 'pipeline_enabled',
  invoices: 'invoices_enabled',
  inventory: 'inventory_enabled',
  showings: 'showings_enabled',
  marketing: 'marketing_enabled',
  expenses: 'expenses_enabled',
  calendar: 'calendar_enabled',
  activity: 'activity_log_enabled',
  'email-logs': 'email_logs_enabled',
  'custom-fields': 'custom_fields_enabled',
};

export default function Sidebar({ current, onNavigate, collapsed, onToggle }: SidebarProps) {
  const { user, signOut } = useAuth();
  const { logoUrl, companyName } = useAppLogo();
  const { toggles } = useFeatureToggles();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!user) return false;
    if (item.key === 'platform-admin') return user.is_platform_admin === true;
    if (!item.roles.includes(user.role)) return false;
    const toggleKey = FEATURE_KEY_MAP[item.key];
    if (toggleKey && !toggles[toggleKey]) return false;
    return true;
  });

  return (
    <aside className={`${collapsed ? 'w-20' : 'w-64'} shrink-0 bg-primary-900 border-r border-primary-800 flex flex-col transition-all duration-300 relative h-screen sticky top-0`}>
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-primary-800 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-sage to-secondary-600 flex items-center justify-center shrink-0 overflow-hidden">
          {logoUrl && (
            <img src={logoUrl} alt={companyName || 'Puppyfy'} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          )}
          {!logoUrl && (
            <PawPrint className="w-5 h-5 text-white" />
          )}
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-bold text-white text-sm leading-tight whitespace-nowrap">{companyName || 'Puppyfy CRM'}</p>
            <p className="text-xs text-gray-500 whitespace-nowrap">CRM</p>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 z-10 w-6 h-6 rounded-full bg-primary-800 border border-primary-700 flex items-center justify-center text-gray-400 hover:text-white hover:bg-primary-700 transition-colors"
      >
        <ChevronLeft className={`w-3.5 h-3.5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
      </button>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = current === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`nav-item w-full ${active ? 'nav-item-active' : 'nav-item-inactive'} ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User + Sign out */}
      <div className="border-t border-primary-800 p-3 shrink-0">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-9 h-9 rounded-full bg-accent-500/20 flex items-center justify-center text-accent-400 font-semibold text-sm shrink-0">
            {user?.name?.charAt(0).toUpperCase() || '?'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-gray-500">{ROLE_LABELS[user?.role ?? ''] || user?.role?.replace('_', ' ')}</p>
            </div>
          )}
          {!collapsed && (
            <button onClick={signOut} className="p-1.5 rounded-lg text-gray-400 hover:text-error-400 hover:bg-error-500/10 transition-colors" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
