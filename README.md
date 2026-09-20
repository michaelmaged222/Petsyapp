# Puppyfy UAE — CRM Web Application

A full-stack CRM application for Puppyfy UAE, a premium puppy sales business based in Dubai. Built with React, Tailwind CSS, and Supabase (PostgreSQL).

## Features

### Authentication & Access Control
- Email & password login with JWT-based session management
- 4 role-based access levels:
  - **Admin** — Full access to everything
  - **Sales Employee** — Leads, Sales, Contracts, Clients
  - **Marketing Manager** — Leads and Dashboard only
  - **Tax Viewer** — Sales page with tax breakdown only
- Password reset via email
- Activity log recording every login, action, and change with timestamps

### Pages
1. **Dashboard** — Greeting, date range & employee filters, 8 stat cards, recent activity feed, upcoming events
2. **Leads** — Full table with search/filters, WhatsApp import, CSV export, lead profiles, WhatsApp message button
3. **Sales** — VAT-aware sales tracking (5% UAE VAT), revenue/VAT/net summary, filters by date/employee/type
4. **Contracts** — Auto-generated contract numbers (PF-YYMMDD-XXXX), full contract form, digital signature, PDF download, email sending, activity log per contract
5. **Clients** — Client profiles with purchase history and linked contracts
6. **Expenses** — Category-based expense tracking with summary cards
7. **Employees** — Team management with role editing, welcome email, per-employee activity log
8. **Calendar** — Monthly view with color-coded events (green=handover, blue=follow-up, red=overdue)
9. **Activity Log** — Admin-only full audit trail (user, action, target, IP, timestamp)
10. **Email Logs** — Full history of all sent emails with status

### Integrations
- **WhatsApp Business API** — Webhook endpoint receives incoming messages and auto-creates leads
- **Email (SMTP)** — Auto-sends contract PDFs, welcome emails, password resets, and handover reminders
- All emails logged with timestamp and status

## Tech Stack

- **Frontend**: React 18 + TypeScript + Tailwind CSS + Lucide React icons
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Build Tool**: Vite

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

The app runs on `http://localhost:5173` by default.

### Building for Production

```bash
npm run build
npm run preview
```

## Environment Variables

The following are pre-configured in the `.env` file:

```
VITE_SUPABASE_URL          # Supabase project URL
VITE_SUPABASE_ANON_KEY     # Supabase anon key
```

### Edge Function Secrets (for WhatsApp & Email)

These are configured as Supabase edge function secrets:

```
SMTP_HOST                  # SMTP server host
SMTP_PORT                  # SMTP server port (default: 587)
SMTP_USER                  # SMTP username
SMTP_PASS                  # SMTP password
FROM_EMAIL                 # Sender email address
FROM_NAME                  # Sender display name
WHATSAPP_API_TOKEN         # WhatsApp Business API token
WHATSAPP_PHONE_NUMBER_ID   # WhatsApp phone number ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN  # Webhook verification token
BASE_URL                   # App base URL for email links
```

## Database Schema

All tables are created automatically via Supabase migrations:

| Table | Description |
|-------|-------------|
| `profiles` | User profiles extending auth.users (name, role, status) |
| `leads` | Sales leads from WhatsApp/Instagram/Google/Referral |
| `contracts` | Purchase contracts with auto-generated numbers |
| `clients` | Registered clients linked to contracts |
| `sales` | Sales records with VAT tracking |
| `expenses` | Business expenses by category |
| `calendar_events` | Scheduled handovers, follow-ups, deadlines |
| `email_logs` | Log of all emails sent |
| `activity_logs` | Full audit trail of user actions |
| `contract_activity` | Per-contract view/sign/open log |

### Row Level Security (RLS)

All tables have RLS enabled with policies scoped to authenticated users.

## Edge Functions

### `send-email`
Handles all email sending: contract PDFs, welcome emails, password resets, handover reminders.

### `whatsapp-webhook`
- **GET**: WhatsApp webhook verification
- **POST**: Receives incoming WhatsApp messages and auto-creates leads
- Supports internal `import_leads` action to batch-import WhatsApp contacts

## WhatsApp Webhook Setup

1. Configure your WhatsApp Business API credentials as edge function secrets
2. Set the webhook URL in Meta Business Manager to:
   ```
   https://<your-supabase-url>/functions/v1/whatsapp-webhook
   ```
3. Set the verify token to match `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

## Deployment

### Deploy to Vercel/Netlify (Frontend)

```bash
npm run build
# Deploy the dist/ folder
```

### Supabase (Backend)

The database, auth, and edge functions are all managed by Supabase. Migrations are applied automatically.

## License

© 2026 Puppyfy UAE. All rights reserved.
