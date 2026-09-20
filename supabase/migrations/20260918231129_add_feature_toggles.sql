/*
# Add feature toggles table

Stores on/off switches for optional app features so admins can
show or hide them from the sidebar and routing.

- `id` (int, PK, always 1 — single row)
- `showings_enabled` (boolean, default true)
- `pipeline_enabled` (boolean, default true)
- `invoices_enabled` (boolean, default true)
- `inventory_enabled` (boolean, default true)
- `custom_fields_enabled` (boolean, default true)
- `marketing_enabled` (boolean, default true)
- `expenses_enabled` (boolean, default true)
- `calendar_enabled` (boolean, default true)
- `activity_log_enabled` (boolean, default true)
- `email_logs_enabled` (boolean, default true)
- `updated_by` (uuid, FK to profiles, nullable)
- `updated_at` (timestamptz, default now())
*/

CREATE TABLE IF NOT EXISTS feature_toggles (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  showings_enabled boolean NOT NULL DEFAULT true,
  pipeline_enabled boolean NOT NULL DEFAULT true,
  invoices_enabled boolean NOT NULL DEFAULT true,
  inventory_enabled boolean NOT NULL DEFAULT true,
  custom_fields_enabled boolean NOT NULL DEFAULT true,
  marketing_enabled boolean NOT NULL DEFAULT true,
  expenses_enabled boolean NOT NULL DEFAULT true,
  calendar_enabled boolean NOT NULL DEFAULT true,
  activity_log_enabled boolean NOT NULL DEFAULT true,
  email_logs_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO feature_toggles (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE feature_toggles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_feature_toggles" ON feature_toggles;
CREATE POLICY "select_feature_toggles" ON feature_toggles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "update_feature_toggles" ON feature_toggles;
CREATE POLICY "update_feature_toggles" ON feature_toggles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
