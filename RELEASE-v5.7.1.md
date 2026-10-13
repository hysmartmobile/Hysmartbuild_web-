# HySmart Build v5.7.1 — Reliability & Flow Hardening

This is a production hardening release based on the V5.7.0 codebase. No existing module or migration is removed.

## Fixed
- Offline queued mutations are now bound to the company workspace that created them.
- Generic mutations are no longer silently replayed after ambiguous network failures; only explicit idempotent offline sync operations are queued.
- Supported field/offline operations now use the server-side idempotent sync contract for projects, tasks, issues, reports, attendance, materials, material requests and inventory movements.
- Offline update operations carry an optional base timestamp for conflict detection.
- Legacy queued requests resolve company context from their own stored API path before replay, preventing cross-company replay.
- PWA shell cache version advanced so clients receive the hardened web shell.
- Duplicate browser online-sync listener removed.

## Verification
- Backend JavaScript syntax audit: PASS.
- Release-gate tests that do not require installed dependencies: PASS when run with the web package placed beside the backend package.
- Full npm dependency installation/build/live Supabase readiness could not be completed in this audit environment because npm registry access timed out; these remain deployment-environment gates.
