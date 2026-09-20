/*
# Update expense categories

1. sale_expenses: Change category constraint to puppy_cost, delivery, other, vat
2. expenses: Change category constraint to bills, rent, vet, subscriptions, marketing, misc

## Notes
- Drops and recreates the CHECK constraint on category columns
- Existing rows with old categories will need updating; old categories are mapped to 'other'/'misc'
*/

-- Update sale_expenses categories
ALTER TABLE sale_expenses DROP CONSTRAINT IF EXISTS sale_expenses_category_check;
UPDATE sale_expenses SET category = 'other' WHERE category NOT IN ('puppy_cost', 'delivery', 'other', 'vat');
ALTER TABLE sale_expenses ADD CONSTRAINT sale_expenses_category_check
  CHECK (category IN ('puppy_cost', 'delivery', 'other', 'vat'));

-- Update expenses categories
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
UPDATE expenses SET category = 'misc' WHERE category NOT IN ('bills', 'rent', 'vet', 'subscriptions', 'marketing', 'misc');
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('bills', 'rent', 'vet', 'subscriptions', 'marketing', 'misc'));
