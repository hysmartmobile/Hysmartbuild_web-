# HySmart Build v3.4.0 — Field Recovery Execution

## Summary
- Connects Recovery Commitments to actual site-level execution records.
- Links field interventions to schedule activities and recovery commitments.
- Captures target/actual quantities, dates, owners, evidence notes and daily-report evidence references.
- Adds field execution summary and activity lookup APIs.
- Adds dedicated recovery:execute permission.

## Verification
- Backend: 190/190 tests passing.
- Backend source syntax checks passing.
- Web production build not verified because Vite is unavailable in the offline dependency cache; CI should run `npm ci && npm run build`.
