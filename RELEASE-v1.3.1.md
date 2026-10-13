# HySmart Build Backend v1.3.1 — Production Alignment

- Node.js + Express API under `/api/v1`
- Supabase Auth/DB/Storage integration
- Paystack + Flutterwave subscription checkout and webhook reconciliation
- Provider reference verification before fulfillment
- Subscription expiry enforcement while keeping billing accessible for renewal
- Tenant/RBAC enforcement
- Subscription project limits
- Production error handling
- 51/51 backend regression tests pass in the validation environment

Before live launch, configure production Supabase, HTTPS, Paystack/Flutterwave live credentials, webhook URLs, and run gateway sandbox/live-readiness tests.
