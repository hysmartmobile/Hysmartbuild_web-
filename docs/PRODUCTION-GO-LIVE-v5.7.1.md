# HySmart Build v5.7.1 — Production Go-Live Gate

## Included hardening
- Company-scoped, idempotent offline sync.
- Construction Type persisted on project creation.
- Idempotent offline project/task/issue/report/attendance/material/material-request/inventory flows.
- PWA shell cache versioned to v5.7.1.
- Duplicate online-sync listener removed.
- Existing modules, migrations, RBAC, collaboration, documents, finance, commercial, field and intelligence systems preserved.

## Verified in release workspace
- Backend JavaScript syntax: PASS.
- Frontend JSX/JS parse audit: PASS across the complete `src` tree.
- Targeted release/health/flow tests: **29/29 PASS**.
- Static relative-import audit: 0 missing backend/frontend imports.
- No `.env` secret files or temporary editor artifacts in the release source.
- No new database migration is required for v5.7.1.

## Deployment gates that require the real environment
1. Run `npm ci` and `npm run build` in the Web package using the deployment network/registry.
2. Run `npm ci` and `npm test` in the Backend package using the deployment network/registry.
3. Apply all migrations through `20261006170000_v5_6_1_access_lifecycle.sql` to the production Supabase project.
4. Verify `GET /api/v1/health` returns version `5.7.1`.
5. Verify `GET /api/v1/health/ready` returns HTTP 200 and all schema checks pass.
6. Verify production CORS, `WEB_APP_URL`, billing callback URL, Paystack/Flutterwave/Stripe credentials, and Supabase keys.
7. Run one end-to-end smoke test: sign in → select company → create project with construction type → create field record → go offline → create supported field record → change company → reconnect → verify queued record lands in the original company → verify notifications/logout.

Do not mark live production deployment verified until these environment-dependent gates pass.
