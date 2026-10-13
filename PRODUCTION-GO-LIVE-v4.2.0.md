# V4.2 Production Go-Live

## Backend
1. `npm ci --no-audit --no-fund`
2. `npm test` — expected 218 passing.
3. Configure production Supabase credentials and environment variables.
4. Run migrations in order through `20261005030000_v3_8_to_v4_1_strategic_intelligence.sql` plus the existing migration set; V4.2 adds no database migration.
5. Configure load balancer/container health checks:
   - Liveness: `GET /api/health`
   - Readiness: `GET /api/health/ready`
6. Route traffic only to instances whose readiness endpoint returns HTTP 200.
7. Preserve `x-request-id` for support tracing.

## Web
1. `npm ci --no-audit --no-fund`
2. `npm run build`
3. Deploy the generated `dist` directory.
4. Configure the production API base URL.
5. Test authentication, offline sync, field capture and file/photo flows on a real mobile device.

## Operational requirements
- Configure Supabase backups/PITR according to the production plan.
- Configure error/log aggregation using request IDs.
- Configure alerting for readiness failures, elevated 5xx responses and failed background/webhook processing.
- Verify Paystack/Flutterwave/Stripe credentials only for providers actually enabled.
- Do not enable autonomous AI actions; V4.1 intelligence remains human-reviewed.
- Perform a real tenant-isolation smoke test before onboarding customers.
