# HySmart Build v5.7.8 — Today Role View Fix

## Fixed
- The `/api/v1/companies/:companyId/today` service now builds its dashboard `summary` once and passes it to `OperatingSystemService.roleView()`.
- The role view previously read `d.summary.moneyAtRisk` and `d.summary.unbilled` even though `summary` was omitted from its input, causing an `INTERNAL_SERVER_ERROR`.
- Optional Control Tower portfolio/time metrics are now guarded so missing optional aggregates do not throw during role-view rendering.
- Added regression tests for summary wiring and optional metrics.

## Verification
- Backend JavaScript syntax check passed.
- Full backend test suite passed after this change (see release verification in the delivery message).
- Live Supabase/API integration still needs confirmation in the target environment.
