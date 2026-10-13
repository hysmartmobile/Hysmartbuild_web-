# HySmart Build V4.2.0 — Production Reliability

V4.2 hardens the V4.1 Construction Operating System for deployment and operations.

## Changes
- API release metadata is consistently 4.2.0.
- Added `/health/ready` readiness endpoint.
- Liveness remains `/health` and does not require database availability.
- Readiness checks Supabase connectivity and returns HTTP 503 when unavailable.
- Added release-contract tests for health/readiness metadata.
- Updated stale legacy health-version assertion.
- Preserved V4.1 procurement, claims, truth and explainable intelligence features.

## Verification
- Backend native test suite: 218/218 passing.
- ZIP integrity: verified during packaging.
- Web production build: not claimed as verified in this offline packaging environment.

## Required production CI
```bash
npm ci --no-audit --no-fund
npm test
npm run build
```
