/*
# Add invoices, inventory, and custom fields tables

## New Tables

### 1. invoices
- Stores formal tax invoices separate from contracts.
- `id` (uuid, PK)
- `invoice_number` (text, unique) — auto-generated invoice number like INV-0001
- `client_id` (uuid, FK to clients, nullable) — optional link to a client
- `client_name` (text) — snapshot of client name at creation
- `client_email` (text, nullable)
- `client_phone` (text, nullable)
- `issue_date` (date) — date the invoice is issued
- `due_date` (date, nullable) — payment due date
- `subtotal` (numeric, default 0) — sum of line items before VAT
- `vat_enabled` (boolean, default false)
- `vat_rate` (numeric, default 5) — percentage
- `vat_amount` (numeric, default 0)
- `discount` (numeric, default 0) — flat discount amount
- `total` (numeric, default 0) — final total after VAT and discount
- `currency` (text, default 'AED') — invoice currency code
- `status` (text: draft/sent/paid/overdue/cancelled, default 'draft')
- `notes` (text, nullable)
- `created_by` (uuid, FK to profiles, nullable)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 2. invoice_items
- Line items belonging to an invoice.
- `id` (uuid, PK)
- `invoice_id` (uuid, FK to invoices ON DELETE CASCADE)
- `description` (text) — what the line item is
- `quantity` (numeric, default 1)
- `unit_price` (numeric, default 0)
- `total` (numeric, default 0) — quantity * unit_price
- `created_at` (timestamptz, default now())

### 3. inventory_items
- Tracks stock items (products, accessories, supplies, etc.)
- `id` (uuid, PK)
- `name` (text) — item name
- `sku` (text, nullable) — stock keeping unit
- `category` (text, nullable) — item category
- `quantity` (integer, default 0) — current stock
- `low_stock_threshold` (integer, default 5) — alert when below this
- `unit_cost` (numeric, default 0) — purchase cost per unit
- `unit_price` (numeric, default 0) — selling price per unit
- `currency` (text, default 'AED')
- `supplier` (text, nullable)
- `notes` (text, nullable)
- `created_by` (uuid, FK to profiles, nullable)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 4. inventory_movements
- Stock movement log (in/out adjustments).
- `id` (uuid, PK)
- `item_id` (uuid, FK to inventory_items ON DELETE CASCADE)
- `type` (text: stock_in/stock_out/adjustment)
- `quantity` (integer) — positive for in, negative for out
- `reason` (text, nullable) — why the movement happened
- `reference` (text, nullable) — linked sale/invoice number
- `created_by` (uuid, FK to profiles, nullable)
- `created_at` (timestamptz, default now())

### 5. custom_fields
- Per-entity custom field definitions for multi-business customization.
- `id` (uuid, PK)
- `entity` (text: lead/client/contract/sale/invoice/inventory)
- `field_key` (text) — machine name
- `field_label` (text) — display label
- `field_type` (text: text/number/select/date/checkbox)
- `options` (jsonb, nullable) — array of options for select type
- `is_required` (boolean, default false)
- `sort_order` (integer, default 0)
- `active` (boolean, default true)
- `created_at` (timestamptz, default now())

## Security
- RLS enabled on all new tables.
- Policies allow authenticated users full CRUD (multi-user CRM, all authenticated staff share data).
- No anon access — app requires sign-in.
*/

-- === INVOICES ===
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  client_name text NOT NULL DEFAULT '',
  client_email text,
  client_phone text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  vat_enabled boolean NOT NULL DEFAULT false,
  vat_rate numeric NOT NULL DEFAULT 5,
  vat_amount numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'AED',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_invoices" ON invoices;
CREATE POLICY "select_invoices" ON invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_invoices" ON invoices;
CREATE POLICY "insert_invoices" ON invoices FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_invoices" ON invoices;
CREATE POLICY "update_invoices" ON invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_invoices" ON invoices;
CREATE POLICY "delete_invoices" ON invoices FOR DELETE TO authenticated USING (true);

-- === INVOICE ITEMS ===
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_invoice_items" ON invoice_items;
CREATE POLICY "select_invoice_items" ON invoice_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_invoice_items" ON invoice_items;
CREATE POLICY "insert_invoice_items" ON invoice_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_invoice_items" ON invoice_items;
CREATE POLICY "update_invoice_items" ON invoice_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_invoice_items" ON invoice_items;
CREATE POLICY "delete_invoice_items" ON invoice_items FOR DELETE TO authenticated USING (true);

-- === INVENTORY ITEMS ===
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  sku text,
  category text,
  quantity integer NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 5,
  unit_cost numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'AED',
  supplier text,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inventory_items" ON inventory_items;
CREATE POLICY "select_inventory_items" ON inventory_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inventory_items" ON inventory_items;
CREATE POLICY "insert_inventory_items" ON inventory_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inventory_items" ON inventory_items;
CREATE POLICY "update_inventory_items" ON inventory_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inventory_items" ON inventory_items;
CREATE POLICY "delete_inventory_items" ON inventory_items FOR DELETE TO authenticated USING (true);

-- === INVENTORY MOVEMENTS ===
CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('stock_in','stock_out','adjustment')),
  quantity integer NOT NULL,
  reason text,
  reference text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inventory_movements" ON inventory_movements;
CREATE POLICY "select_inventory_movements" ON inventory_movements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_inventory_movements" ON inventory_movements;
CREATE POLICY "insert_inventory_movements" ON inventory_movements FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_inventory_movements" ON inventory_movements;
CREATE POLICY "update_inventory_movements" ON inventory_movements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_inventory_movements" ON inventory_movements;
CREATE POLICY "delete_inventory_movements" ON inventory_movements FOR DELETE TO authenticated USING (true);

-- === CUSTOM FIELDS ===
CREATE TABLE IF NOT EXISTS custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL CHECK (entity IN ('lead','client','contract','sale','invoice','inventory')),
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','select','date','checkbox')),
  options jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_custom_fields" ON custom_fields;
CREATE POLICY "select_custom_fields" ON custom_fields FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_custom_fields" ON custom_fields;
CREATE POLICY "insert_custom_fields" ON custom_fields FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_custom_fields" ON custom_fields;
CREATE POLICY "update_custom_fields" ON custom_fields FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_custom_fields" ON custom_fields;
CREATE POLICY "delete_custom_fields" ON custom_fields FOR DELETE TO authenticated USING (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_id ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_entity ON custom_fields(entity);
