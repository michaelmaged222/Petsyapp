import { Calendar, Eye, KanbanSquare, Mail, Megaphone, Package, Receipt, ScanLine, ScrollText, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FeatureToggles } from '@/lib/useFeatureToggles';

export interface FeatureDefinition {
  key: keyof FeatureToggles;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const FEATURE_LIST: FeatureDefinition[] = [
  { key: 'showings_enabled', label: 'Showings', description: 'Schedule and track puppy viewings — Showing In (customer visits you) and Showing Out (you go to customer).', icon: Eye },
  { key: 'pipeline_enabled', label: 'Lead Pipeline', description: 'Visual Kanban board to drag leads between stages and track their progress.', icon: KanbanSquare },
  { key: 'invoices_enabled', label: 'Invoices', description: 'Create formal tax invoices with line items, VAT, multi-currency, and print-to-PDF.', icon: ScanLine },
  { key: 'inventory_enabled', label: 'Inventory', description: 'Track stock items, quantities, low-stock alerts, and movement history.', icon: Package },
  { key: 'custom_fields_enabled', label: 'Custom Fields', description: 'Add custom data fields to any section to adapt the app to any business type.', icon: SlidersHorizontal },
  { key: 'marketing_enabled', label: 'Marketing', description: 'Marketing commission tracking and campaign management.', icon: Megaphone },
  { key: 'expenses_enabled', label: 'Expenses', description: 'Record and categorize business and operating expenses.', icon: Receipt },
  { key: 'calendar_enabled', label: 'Calendar', description: 'View handovers, follow-ups, and overdue items on a calendar.', icon: Calendar },
  { key: 'activity_log_enabled', label: 'Activity Log', description: 'Audit trail of all actions taken by team members in the app.', icon: ScrollText },
  { key: 'email_logs_enabled', label: 'Email Logs', description: 'History of emails sent from the app to clients and leads.', icon: Mail },
];

export const DEFAULT_FEATURE_TOGGLES: FeatureToggles = FEATURE_LIST.reduce(
  (acc, feature) => ({ ...acc, [feature.key]: true }),
  {} as FeatureToggles,
);

export function countEnabledFeatures(toggles: FeatureToggles): number {
  return FEATURE_LIST.filter((feature) => toggles[feature.key]).length;
}
