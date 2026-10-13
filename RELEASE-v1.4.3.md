# HySmart Build V1.4.3 — Global SaaS Identity & Billing

## Scope
- One authenticated user can create exactly one company.
- A user may still belong to additional companies through single-use, expiring company invitations.
- Company is the billing tenant.
- Company country, billing country, tax country, currency, locale, timezone and unit system are stored explicitly.
- 14-day Starter trial starts automatically for new companies.
- Subscription lifecycle supports TRIAL, ACTIVE, PAST_DUE, GRACE_PERIOD, SUSPENDED, CANCELLED and EXPIRED.
- Starter/Growth/Business pricing is stored in `subscription_plan_prices`, not hard-coded in the frontend.
- Nigeria launch pricing: NGN 150,000 / 350,000 / 500,000 monthly.
- International baseline: USD 149 / 349 / 499 monthly and GBP 119 / 279 / 399 monthly.
- Annual pricing uses a 10x-monthly baseline (two months saved).
- Initial African country catalog includes Nigeria, Ghana, Kenya, South Africa, Rwanda, Tanzania, Uganda, Zambia, Malawi, Sierra Leone, Côte d’Ivoire, Senegal, Cameroon, Egypt, Ethiopia, Morocco, Mauritius, Botswana, Namibia, Mozambique, Angola, Algeria and Tunisia, with additional global markets.
- Payment routing is database configuration: Paystack, Flutterwave and optional Stripe.
- Stripe integration is implemented server-side but requires a Stripe merchant account and credentials before it can be used.
- Browser/client never supplies the payable amount; backend resolves country + plan + currency + provider and sends the server-derived amount to the gateway.
- Webhook verification remains authoritative for subscription activation and renewal.
- Recurring renewal events are reconciled to the company subscription.
- Expired/suspended/cancelled subscriptions are gated from normal application permissions while billing remains accessible.

## Important deployment step
Apply the new migration after V1.4.2:
`supabase/migrations/20261002180000_v1_4_3_global_billing_identity.sql`

The migration intentionally stops if duplicate `companies.created_by` ownership already exists. It does not delete or merge existing companies.

## Payment environment
Set these on the backend only:
- `PAYSTACK_SECRET_KEY`
- `FLW_SECRET_KEY`
- `FLW_SECRET_HASH`
- `STRIPE_SECRET_KEY` (when Stripe is enabled)
- `STRIPE_WEBHOOK_SECRET` (when Stripe is enabled)
- `BILLING_CALLBACK_URL`

## Verification
Backend:
- `node --test` → 64/64 passing
- `tsc --noEmit` → passing
- Node syntax checks → passing

Web dependencies were not installed in this build environment because npm registry packages were unavailable from the local cache, so a fresh Vite production build was not claimed.
