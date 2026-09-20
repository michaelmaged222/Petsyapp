/*
# Add API key column to tenants for Enterprise tier API access

Each tenant gets a unique API key that authenticates REST API requests
to the /api-v1 edge function. Only Enterprise tier tenants can use the API.
*/

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_key text UNIQUE;

-- Generate API keys for existing tenants
UPDATE tenants
SET api_key = encode(gen_random_bytes(32), 'hex')
WHERE api_key IS NULL;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_tenants_api_key ON tenants(api_key) WHERE api_key IS NOT NULL;
