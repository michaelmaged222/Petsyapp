# Puppyfy CRM — API Documentation

## Overview

Puppyfy CRM is a multi-tenant SaaS platform for pet businesses. The API is built
on Supabase (PostgreSQL + PostgREST), with Edge Functions for server-side logic.

## Authentication

All API requests require a Supabase JWT token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Tokens are obtained via `POST /auth/v1/token` with email + password.

## Tenant Isolation

Every request is scoped to the authenticated user's tenant via JWT claim
`app_metadata.tenant_id`. Row-Level Security policies enforce that users can
only access data within their own tenant.

## Core Endpoints

### Leads
| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/leads` | List leads (tenant-scoped) |
| POST | `/rest/v1/leads` | Create a lead |
| PATCH | `/rest/v1/leads?id=eq.<uuid>` | Update a lead |
| DELETE | `/rest/v1/leads?id=eq.<uuid>` | Delete a lead |

### Clients
| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/clients` | List clients |
| POST | `/rest/v1/clients` | Create a client |
| PATCH | `/rest/v1/clients?id=eq.<uuid>` | Update a client |

### Contracts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/contracts` | List contracts |
| POST | `/rest/v1/contracts` | Create a contract (auto-generates contract number) |
| PATCH | `/rest/v1/contracts?id=eq.<uuid>` | Update/sign a contract |

### Sales
| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/sales` | List sales |
| POST | `/rest/v1/sales` | Record a sale |
| GET | `/rest/v1/sale_payments` | List payments for a sale |
| POST | `/rest/v1/sale_payments` | Record a payment |

### Invoices
| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/invoices` | List invoices |
| POST | `/rest/v1/invoices` | Create an invoice |
| POST | `/rest/v1/invoice_items` | Add line items |

### Inventory
| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/inventory_items` | List stock items |
| POST | `/rest/v1/inventory_movements` | Record stock movement |

### Tenant Management
| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/tenants` | Get current tenant info |
| GET | `/rest/v1/tenant_members` | List team members |
| POST | `/rest/v1/tenant_members` | Invite a team member |
| GET | `/rest/v1/tenant_settings` | Get branding settings |
| PATCH | `/rest/v1/tenant_settings` | Update branding |

### Billing
| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/subscription_plans` | List available plans |
| GET | `/rest/v1/tenant_subscriptions` | Get current subscription |

### Audit Logs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/rest/v1/audit_logs` | List audit entries (Enterprise only) |
| POST | `/rest/v1/audit_logs` | Create audit entry |

## Edge Functions

| Function | Method | Description |
|----------|--------|-------------|
| `/functions/v1/send-email` | POST | Send an email |
| `/functions/v1/whatsapp-webhook` | POST | WhatsApp webhook handler |
| `/functions/v1/stripe-webhook` | POST | Stripe subscription webhook |

## Subscription Tiers

| Tier | Price/mo | Max Users | Key Features |
|------|----------|-----------|--------------|
| Basic | $29 | 3 | Leads, Clients, Contracts, Sales, Calendar |
| Professional | $79 | 10 | Everything in Basic + Invoices, Inventory, Marketing, Reports |
| Enterprise | $199 | Unlimited | Everything + Audit Logs, API Access, Custom Branding |

## Query Parameters

- `select=<columns>` — select specific columns
- `order=<column>.<asc|desc>` — sort results
- `limit=<n>` — limit results
- `offset=<n>` — pagination
- `<column>=eq.<value>` — filter by equality

## Rate Limits

Supabase applies platform-level rate limits. For higher limits, contact Supabase support.

## Webhooks

Configure webhooks in the Stripe Dashboard pointing to:
```
POST /functions/v1/stripe-webhook
```

Events handled: `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.payment_failed`.
