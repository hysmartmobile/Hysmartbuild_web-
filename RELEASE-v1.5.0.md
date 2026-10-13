# HySmart Build Backend V1.5.0 — Production Completion

This release hardens the V1.4.3 global identity/billing architecture and closes backend production gaps identified during the full requirements audit.

## Required database migration

Apply all previous migrations in order, then apply:

`supabase/migrations/20261003130000_v1_5_production_completion.sql`

It is designed to be rerunnable against the repaired V1.4.3 database.

## Fixed

- Canonical company billing identity: `billing_country` and `tax_country`
- Compatibility with earlier `*_country_code` columns
- Payment-provider route `active` flag normalized
- Stripe/Paystack/Flutterwave price-provider identifiers
- Global subscription lifecycle statuses and grace period fields
- Billing customer abstraction
- Company-wide API audit log
- Supplier master data and CRUD API
- Daily report approval/rejection workflow
- Document soft-delete and storage cleanup
- Site-report photo signed download API
- Site-report photo path isolation
- Project progress API consistency
- Site update/delete and milestone delete APIs
- Project team role update API
- Worker deactivation API
- Material update API
- Company member listing authorization
- Project/user/storage subscription-limit enforcement
- Subscription cancellation/resume APIs
- Subscription usage endpoint
- Payment failure -> PAST_DUE/grace handling
- Stripe subscription deletion/payment-failure webhook handling
- Stripe webhook timestamp replay protection
- Platform-admin API for plans, localized prices, provider routes, companies and subscriptions
- Explicit platform-admin bootstrap table

## Platform admin bootstrap

Insert the HySmart platform administrator's authenticated Supabase user ID into:

`public.platform_admins`

Example:

```sql
insert into public.platform_admins(user_id)
values ('YOUR_AUTH_USER_UUID')
on conflict (user_id) do nothing;
```

Do not expose platform-admin credentials to clients.

## Production deployment

- Use HTTPS.
- Set an explicit production `CORS_ORIGIN` allowlist.
- Use the Supabase service-role key only on the server.
- Configure live payment-provider secrets only after sandbox verification.
- Configure all provider webhook URLs.
- Use persistent/shared rate limiting when running multiple API instances.
- Create the private Storage buckets required by the document and site-report modules.
- Back up the database before applying production migrations.
