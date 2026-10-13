# HySmart Build Backend — V4.6.0

Production-oriented multi-tenant construction operating system API for HySmart Build.

## Stack
- Node.js + Express 5
- Supabase Auth + PostgreSQL + RLS + Storage
- Zod request validation
- Helmet + CORS allowlist + request IDs
- Tenant/RBAC authorization
- Server-side subscription billing integrations

## V4.6 operating layer
- HySmart Today / role-driven daily operating surface
- BOQ operating chain
- Control Tower, Revenue & Margin, Treasury and Recovery intelligence
- Production/workfront readiness
- Quality, safety, collaboration and people accountability
- Daily Intelligence Loop: changed → explained → prioritized → acted → measured

## Production deployment
1. Set every required environment variable. Never expose the Supabase service-role key or payment secrets to the web client.
2. Apply every migration in `supabase/migrations/` in filename order.
3. Run `npm ci` then `npm test` in the deployment environment.
4. Start with `npm start` behind HTTPS/reverse proxy.
5. Confirm `/api/v1/health` and `/api/v1/health/ready` both behave as expected; readiness must be HTTP 200 before traffic is enabled.
6. Configure the production CORS allowlist, web URL, billing callback URL and payment-provider webhooks.

## Required server variables
`NODE_ENV`, `PORT`, `API_PREFIX`, `CORS_ORIGIN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WEB_APP_URL`, `BILLING_CALLBACK_URL`.

Payment providers are optional at boot for installations that do not offer paid plans yet; when enabled, keep all gateway secrets server-side.

## Security boundary
All company-scoped application routes require Supabase authentication plus centralized RBAC authorization. Database RLS remains enabled. The backend uses the Supabase service role for server-side data access, so tenant authorization in the API is mandatory and is tested as part of the application suite.

## Operational endpoints
- `GET /api/v1/health` — liveness
- `GET /api/v1/health/ready` — dependency/schema readiness
- `GET /api/v1/health/supabase` — Supabase connectivity diagnostic

For the final launch checklist, see `PRODUCTION-GO-LIVE-v4.6.0.md` at the release root.
# HySmart-Build-Backend

## Self-hosted HySmart intelligent Customer Care (no OpenAI dependency)
- `CUSTOMER_CARE_LOCAL_MODEL_URL` — private Ollama server URL; defaults to `http://127.0.0.1:11434`.
- `CUSTOMER_CARE_LOCAL_MODEL_NAME` — locally installed model name; defaults to `qwen2.5:7b`.
- Install Ollama on the backend host or a private model host, then pull the chosen model (for example, `ollama pull qwen2.5:7b`) and ensure the Ollama service is reachable from the backend. The backend calls Ollama's native `/api/chat` endpoint; it does not use an OpenAI API, key, or account.
- If the model service is unavailable or returns invalid output, Customer Care safely falls back to retrieved official HySmart help articles. The assistant receives product documentation, not live company/project/payment records.
- Keep the model endpoint on a private network and apply network access controls. Model hardware needs depend on model size, concurrent users and response-time targets.
