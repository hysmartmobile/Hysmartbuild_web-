# HySmart Build v5.7.0 — Production Reliability & Release Gate

V5.7.0 is an additive production-hardening release on top of V5.6.1. It does not remove or replace any Construction Operating System capability.

## What changed

- Graceful HTTP shutdown on SIGTERM/SIGINT with a bounded drain period.
- Explicit Node HTTP keep-alive, header and request timeouts.
- Explicit `TRUST_PROXY` configuration so reverse-proxy deployments do not implicitly trust forwarded client identity.
- In-memory authentication rate limiter now prunes expired entries and supports clean shutdown.
- Browser API requests have a 30-second timeout.
- Browser API retries only idempotent GET requests after transient 502/503/504 responses; mutations are never automatically retried.
- Safe `.env.example` templates added for backend and web deployment configuration.
- Release gate expanded for reliability, version alignment and artifact hygiene.
- No database migration is required for V5.7.0.

## Verification

- Backend test suite: **305/305 passing**.
- Backend JavaScript syntax audit: **0 failures**.
- Migration inventory remains at **60 migrations**; latest schema migration remains V5.6.1.
- No production `.env`, temporary editor files or swap files are included.

## Preserved

All prior modules and operating systems remain in place, including People, Comments/Communication, Documents, RFIs, Tasks, Finance, BOQ Control, Today, Control Tower, Autopilot, Evidence, Network, Reality, Financial Intelligence and Lifecycle Intelligence.

## Deployment note

The release source tree was validated without a cached dependency installation. A production Web `npm ci`/`npm run build` and live Supabase `/api/v1/health/ready` check still need to be executed in the actual deployment environment before declaring the environment live.
