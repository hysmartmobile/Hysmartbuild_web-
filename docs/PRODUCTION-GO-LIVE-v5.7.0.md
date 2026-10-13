# HySmart Build v5.7.0 — Production Go-Live Checklist

## 1. Backend environment

Copy `.env.example` to the deployment secret store and set real values. Never commit the populated file.

Required:
- `NODE_ENV=production`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGIN` — exact production web origin(s), comma separated if needed
- `WEB_APP_URL` — production web URL
- `BILLING_CALLBACK_URL` — production billing callback URL

Set `TRUST_PROXY=true` only when the API is behind a trusted reverse proxy/load balancer that correctly supplies the client IP. Leave it `false` for direct exposure.

## 2. Database

V5.7.0 has **no new migration**. Deploy the already-required migrations through `20261006170000_v5_6_1_access_lifecycle.sql` before go-live.

Then verify:
- `GET /api/v1/health` → HTTP 200 and version `5.7.0`.
- `GET /api/v1/health/ready` → HTTP 200 and `ready: true`.

## 3. Backend install and run

```bash
npm ci
npm test
npm start
```

Expected test result for this source tree: **305/305 passing**.

The server is configured for bounded request/header timeouts and graceful SIGTERM/SIGINT draining.

## 4. Web environment and build

Copy `HySmart-Build-Web/.env.example` to the deployment environment and set:
- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then:

```bash
npm ci
npm run build
```

Deploy the generated `dist` directory behind HTTPS.

## 5. Smoke test

- Login and logout.
- Company selection/switching.
- Today and Control Tower.
- Projects and project detail.
- People, Team and access lifecycle.
- BOQ Control.
- Procurement, Materials and Production.
- Daily Reports, Attendance and Field Mode.
- Quality & Safety.
- Documents, Collaboration, Comments, RFIs and Tasks.
- Revenue & Margin and Treasury.
- Autopilot, Evidence, Network and Reality.
- Financial Intelligence and Lifecycle Intelligence.
- Offline queue: create an approved offline-safe field mutation, reconnect, and verify sync.

## 6. Security acceptance

- Production CORS contains no localhost origin.
- Production web/callback URLs are HTTPS and non-localhost.
- Service-role key exists only in backend secret storage.
- No populated `.env` files are deployed from source control.
- Cross-tenant access checks remain enforced.
- Reversible access lifecycle is used instead of deleting people/history.
- Payment/variation/claim/safety approvals remain human-controlled.

## 7. Important validation boundary

Source-level and backend tests are green. A real production build and live Supabase readiness response cannot be truthfully marked complete until they are executed against the actual production environment.
