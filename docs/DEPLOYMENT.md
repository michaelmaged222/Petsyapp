# DigitalOcean App Platform Deployment

## Prerequisites

1. A DigitalOcean account
2. A Supabase project (self-hosted or Supabase Cloud)
3. A Stripe account (for billing)
4. Domain name (optional)

## Environment Variables

Set these in the DigitalOcean App Platform dashboard:

### Required
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Edge Function Secrets (set in Supabase, not DO)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DB_URL=postgresql://...
```

### Stripe (when ready)
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## app.yaml (DigitalOcean App Platform)

```yaml
name: puppyfy-crm
services:
  - name: web
    source_dir: /
    github:
      repo: your-org/puppyfy-crm
      branch: main
    run_command: npm run preview -- --host 0.0.0.0 --port $PORT
    build_command: npm run build
    environment_slug: node-js
    env:
      - key: VITE_SUPABASE_URL
        scope: RUN_AND_BUILD_TIME
        value: https://your-project.supabase.co
      - key: VITE_SUPABASE_ANON_KEY
        scope: RUN_AND_BUILD_TIME
        value: your-anon-key
    health_check:
      http_path: /
    instance_size_slug: basic-xs
    instance_count: 1
```

## Steps

1. Push code to GitHub
2. In DigitalOcean: Apps > Create App > Choose GitHub repo
3. Set environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
4. Build command: `npm run build`
5. Run command: `npx vite preview --host 0.0.0.0 --port $PORT`
6. Deploy

## Post-Deploy

1. Configure Stripe webhook endpoint: `https://your-domain/functions/v1/stripe-webhook`
2. Add Stripe price IDs to `subscription_plans` table
3. Set up custom domain in DO dashboard
4. Run database migrations via Supabase MCP tools

## Self-Hosted Supabase (optional)

For self-hosted Supabase on DigitalOcean Droplet:
1. Use the Supabase Docker Compose setup
2. Point `VITE_SUPABASE_URL` to your Droplet IP
3. Configure SSL via Let's Encrypt / Caddy
