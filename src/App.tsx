import { useState, useEffect } from 'react';
import { Clock, AlertCircle, CreditCard } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { TenantProvider, useTenant } from '@/context/TenantContext';
import { useFeatureToggles } from '@/lib/useFeatureToggles';
import { ToastContainer } from '@/components/Toast';
import Sidebar, { type PageKey } from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import LoginPage from '@/pages/LoginPage';
import Dashboard from '@/pages/Dashboard';
import StatsPage from '@/pages/Stats';
import FinancialReports from '@/pages/FinancialReports';
import Leads from '@/pages/Leads';
import Pipeline from '@/pages/Pipeline';
import Sales from '@/pages/Sales';
import Contracts from '@/pages/Contracts';
import Invoices from '@/pages/Invoices';
import Clients from '@/pages/Clients';
import Expenses from '@/pages/Expenses';
import Inventory from '@/pages/Inventory';
import Showings from '@/pages/Showings';
import Marketing from '@/pages/Marketing';
import Employees from '@/pages/Employees';
import CalendarPage from '@/pages/Calendar';
import ActivityLogs from '@/pages/ActivityLogs';
import EmailLogs from '@/pages/EmailLogs';
import CustomFields from '@/pages/CustomFields';
import SettingsPage from '@/pages/Settings';
import TenantManagement from '@/pages/TenantManagement';
import Billing from '@/pages/Billing';
import AuditLogs from '@/pages/AuditLogs';
import PlatformAdmin from '@/pages/PlatformAdmin';
import BusinessSetupWizard from '@/pages/BusinessSetupWizard';
import LoadingSpinner from '@/components/LoadingSpinner';

export type ThemeMode = 'day' | 'night';

function AppContent() {
  const { user, loading, canAccess, isPlatformAdmin, isRecoverySession } = useAuth();
  const { isFeatureAvailable, trialDaysLeft, isTrialExpired, subscription, setupComplete, loading: tenantLoading } = useTenant();
  const { toggles, loaded: togglesLoaded } = useFeatureToggles();
  const [currentPage, setCurrentPage] = useState<PageKey>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem('puppyfy-theme') as ThemeMode) || 'night');

  useEffect(() => {
    localStorage.setItem('puppyfy-theme', theme);
  }, [theme]);

  const FEATURE_PAGE_MAP: Partial<Record<PageKey, keyof typeof toggles>> = {
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

  const featureEnabled = (page: PageKey): boolean => {
    const key = FEATURE_PAGE_MAP[page];
    if (key && !toggles[key]) return false;
    if (key && !isFeatureAvailable(key.replace('_enabled', '').replace('-', '_'))) return false;
    return true;
  };

  // Redirect away if current page's feature is disabled
  useEffect(() => {
    if (togglesLoaded && user && !featureEnabled(currentPage)) {
      setCurrentPage('dashboard');
    }
  }, [togglesLoaded, user, currentPage, toggles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary-950">
        <LoadingSpinner size="lg" label="Loading Puppyfy CRM..." />
      </div>
    );
  }

  if (!user || isRecoverySession) {
    return <LoginPage />;
  }

  // A brand-new owner must finish setting up their business before using the app.
  if (!tenantLoading && !setupComplete && (user.role === 'owner' || user.role === 'admin')) {
    return <BusinessSetupWizard />;
  }

  const canAccessPage = (page: PageKey): boolean => {
    if (page === 'platform-admin') return isPlatformAdmin;
    return canAccess(page);
  };

  const renderPage = () => {
    if (!canAccessPage(currentPage) || !featureEnabled(currentPage)) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-semibold text-white">Access Denied</p>
          <p className="text-sm text-gray-500 mt-2">This feature is not available.</p>
        </div>
      );
    }

    switch (currentPage) {
      case 'dashboard': return <Dashboard onNavigateToStats={() => setCurrentPage('stats')} />;
      case 'stats': return <StatsPage />;
      case 'reports': return <FinancialReports />;
      case 'leads': return <Leads />;
      case 'pipeline': return <Pipeline />;
      case 'sales': return <Sales />;
      case 'contracts': return <Contracts onNavigateToSales={() => setCurrentPage('sales')} />;
      case 'invoices': return <Invoices />;
      case 'clients': return <Clients />;
      case 'expenses': return <Expenses />;
      case 'inventory': return <Inventory />;
      case 'showings': return <Showings />;
      case 'marketing': return <Marketing />;
      case 'employees': return <Employees />;
      case 'calendar': return <CalendarPage />;
      case 'activity': return <ActivityLogs />;
      case 'email-logs': return <EmailLogs />;
      case 'custom-fields': return <CustomFields />;
      case 'settings': return <SettingsPage theme={theme} onThemeChange={setTheme} />;
      case 'tenant': return <TenantManagement />;
      case 'billing': return <Billing />;
      case 'audit-logs': return <AuditLogs />;
      case 'platform-admin': return <PlatformAdmin />;
      default: return <Dashboard />;
    }
  };

  // Block app when trial expired and no active subscription
  const blocked = isTrialExpired;

  return (
    <div className={`flex min-h-screen bg-primary-950 ${theme === 'day' ? 'theme-light' : ''}`}>
      <Sidebar
        current={currentPage}
        onNavigate={setCurrentPage}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
          {/* Trial banner */}
          {trialDaysLeft !== null && trialDaysLeft > 0 && trialDaysLeft <= 3 && subscription?.status === 'trialing' && currentPage !== 'billing' && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-accent-500/10 border border-accent-500/30 flex items-center gap-3">
              <Clock className="w-5 h-5 text-accent-400 shrink-0" />
              <p className="text-sm text-accent-300">
                Your free trial ends in {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'}. 
                <button onClick={() => setCurrentPage('billing')} className="underline hover:text-accent-200">Choose a plan</button>
              </p>
            </div>
          )}
          {blocked && currentPage !== 'billing' ? (
            <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-error-500/20 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-error-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Trial Expired</h2>
              <p className="text-sm text-gray-400 mb-6">Your 14-day free trial has ended. Choose a subscription plan to continue using Puppyfy CRM.</p>
              <button onClick={() => setCurrentPage('billing')} className="btn-primary flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> View Plans
              </button>
            </div>
          ) : (
            renderPage()
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <AppContent />
        <ToastContainer />
      </TenantProvider>
    </AuthProvider>
  );
}
