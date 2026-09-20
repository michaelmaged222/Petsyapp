import { Briefcase, Calculator, Megaphone, PhoneCall, ShieldCheck, UserCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@/lib/supabase';

export interface RoleDefinition {
  value: Exclude<UserRole, 'owner'>;
  label: string;
  summary: string;
  icon: LucideIcon;
}

/** Roles that an owner or admin can assign to a team member. */
export const ASSIGNABLE_ROLES: RoleDefinition[] = [
  { value: 'admin', label: 'Admin', summary: 'Full control of the whole business, including sales, expenses, marketing, and settings.', icon: ShieldCheck },
  { value: 'sales', label: 'Sales Team', summary: 'Leads, pipeline, sales, contracts, invoices, and clients.', icon: Briefcase },
  { value: 'finance', label: 'Finance Team', summary: 'Sales records, invoices, expenses, reports, and financial stats.', icon: Calculator },
  { value: 'marketing', label: 'Marketing Team', summary: 'Leads, pipeline, showings, marketing campaigns, and calendar.', icon: Megaphone },
  { value: 'receptionist', label: 'Receptionist', summary: 'Leads, clients, showings, and the calendar.', icon: PhoneCall },
  { value: 'tax_viewer', label: 'Tax Viewer', summary: 'Read-only access to sales with the tax breakdown.', icon: UserCheck },
];

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  sales: 'Sales Team',
  finance: 'Finance Team',
  marketing: 'Marketing Team',
  receptionist: 'Receptionist',
  tax_viewer: 'Tax Viewer',
};

export function roleSummary(role: string): string {
  return ASSIGNABLE_ROLES.find((r) => r.value === role)?.summary ?? 'Team member';
}
