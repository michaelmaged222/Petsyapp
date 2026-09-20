/*
# Add payment_method to sale_expenses
Allows tracking how each sale expense was paid (cash, card, bank_transfer, other).
*/
ALTER TABLE sale_expenses
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash'
  CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'other'));
