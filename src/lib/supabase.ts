import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: true,
    storageKey: 'puppyfy-auth',
  },
});

export type UserRole = 'owner' | 'admin' | 'sales' | 'marketing' | 'tax_viewer' | 'finance' | 'receptionist';
export type PlanTier = 'basic' | 'pro' | 'enterprise';
export type TenantStatus = 'active' | 'suspended' | 'cancelled' | 'trial';
export type SubscriptionStatus = 'trial' | 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan_tier: PlanTier;
  status: TenantStatus;
  trial_ends_at: string | null;
  api_key: string | null;
  setup_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantMember {
  id: string;
  tenant_id: string;
  user_id: string;
  role: UserRole;
  invited_by: string | null;
  created_at: string;
}

export interface TenantSettings {
  id: string;
  tenant_id: string;
  business_name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  currency: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: number;
  tier: PlanTier;
  name: string;
  price_monthly: number;
  price_yearly: number;
  max_employees: number;
  features: Record<string, boolean>;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
}

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  plan_id: number;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  last_login: string | null;
  created_at: string;
  tenant_id: string;
  is_platform_admin: boolean;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  breed_interested: string | null;
  source: 'whatsapp' | 'instagram' | 'google' | 'referral';
  status: 'new' | 'contacted' | 'qualified' | 'lost';
  quality: 'hot' | 'warm' | 'cold';
  assigned_to: string | null;
  notes: string;
  created_at: string;
  assigned_profile?: Profile | null;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  id_passport: string | null;
  breed: string | null;
  contract_id: string | null;
  purchase_date: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  contract?: Contract | null;
}

export interface Contract {
  id: string;
  contract_number: string | null;
  client_id: string | null;
  buyer_name: string;
  buyer_email: string | null;
  buyer_phone: string | null;
  buyer_id_passport: string | null;
  contract_date: string;
  puppy_dob: string | null;
  puppy_gender: 'male' | 'female' | null;
  breed: string | null;
  color: string | null;
  microchip_number: string | null;
  purchase_price: number;
  down_payment: number;
  remaining_balance: number;
  type: 'local' | 'imported';
  importing_country: string | null;
  amount: number;
  vat_enabled: boolean;
  vat_amount: number;
  total_amount: number;
  handover_date: string | null;
  status: 'draft' | 'sent' | 'signed';
  sale_source: SaleSource | null;
  pdf_url: string | null;
  signature_data: string | null;
  signed_at: string | null;
  created_by: string | null;
  created_at: string;
  client?: Client | null;
  created_by_profile?: Profile | null;
  activities?: ContractActivity[];
}

export type SaleSource = 'new_client_marketing' | 'referral' | 'returning_client' | 'direct_walkin';

export interface ContractActivity {
  id: string;
  contract_id: string;
  action: string;
  ip_address: string | null;
  created_at: string;
}

export interface Sale {
  id: string;
  client_id: string | null;
  contract_id: string | null;
  breed: string | null;
  sale_type: 'local' | 'imported';
  amount: number;
  vat_type: 'on_tax' | 'off_tax';
  vat_amount: number;
  net_amount: number;
  employee_id: string | null;
  date: string;
  status: 'pending' | 'completed' | 'cancelled';
  sale_source: SaleSource | null;
  puppy_cost: number;
  delivery_cost: number;
  created_at: string;
  client?: Client | null;
  employee?: Profile | null;
}

export interface Expense {
  id: string;
  category: 'bills' | 'rent' | 'vet' | 'subscriptions' | 'marketing' | 'misc';
  expense_type: 'operating' | 'business';
  description: string;
  amount: number;
  date: string;
  added_by: string | null;
  created_at: string;
  added_by_profile?: Profile | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  type: 'handover' | 'follow_up' | 'overdue';
  date: string;
  linked_id: string | null;
  linked_type: 'contract' | 'lead' | 'client' | null;
  created_by: string | null;
  notes: string;
  created_at: string;
}

export interface EmailLog {
  id: string;
  to_email: string;
  subject: string;
  body: string | null;
  status: 'sent' | 'failed';
  sent_at: string;
  sent_by: string | null;
  sent_by_profile?: Profile | null;
}

export interface SalePayment {
  id: string;
  sale_id: string;
  amount: number;
  method: 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'online' | 'other';
  note: string;
  recorded_by: string | null;
  created_at: string;
  recorded_by_profile?: Profile | null;
}

export interface SaleExpense {
  id: string;
  sale_id: string;
  category: 'puppy_cost' | 'delivery' | 'other' | 'vat';
  description: string;
  amount: number;
  date: string;
  payment_method: 'cash' | 'card' | 'bank_transfer' | 'other';
  recorded_by: string | null;
  created_at: string;
  recorded_by_profile?: Profile | null;
}

export interface CommissionPayment {
  id: string;
  period_month: string;
  net_profit_aed: number;
  commission_egp: number;
  paid_by: string | null;
  paid_at: string;
  notes: string | null;
  created_at: string;
  paid_by_profile?: Profile | null;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  target: string | null;
  target_id: string | null;
  ip_address: string | null;
  created_at: string;
  user_profile?: Profile | null;
}

export interface BusinessSettings {
  id: number;
  monthly_cycle_start_day: number;
  updated_by: string | null;
  updated_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string | null;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  vat_enabled: boolean;
  vat_rate: number;
  vat_amount: number;
  discount: number;
  total: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: InvoiceItem[];
  created_by_profile?: Profile | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  low_stock_threshold: number;
  unit_cost: number;
  unit_price: number;
  currency: string;
  supplier: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  item_id: string;
  type: 'stock_in' | 'stock_out' | 'adjustment';
  quantity: number;
  reason: string | null;
  reference: string | null;
  created_by: string | null;
  created_at: string;
  created_by_profile?: Profile | null;
}

export type CustomFieldEntity = 'lead' | 'client' | 'contract' | 'sale' | 'invoice' | 'inventory';
export type CustomFieldType = 'text' | 'number' | 'select' | 'date' | 'checkbox';

export interface CustomField {
  id: string;
  entity: CustomFieldEntity;
  field_key: string;
  field_label: string;
  field_type: CustomFieldType;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface Showing {
  id: string;
  type: 'showing_in' | 'showing_out';
  lead_id: string | null;
  client_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  breed: string | null;
  puppy_name: string | null;
  location: string | null;
  scheduled_date: string;
  duration_minutes: number;
  assigned_to: string | null;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  notes: string | null;
  outcome: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assigned_profile?: Profile | null;
  lead?: Lead | null;
  client?: Client | null;
}
