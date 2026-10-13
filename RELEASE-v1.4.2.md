# HySmart Build Backend v1.4.2

## Fixes

- Fixed V0.9 PostgreSQL `42830` migration failure by adding the required `expenses(company_id,id)` unique key before tenant-scoped foreign keys.
- Made V0.9 composite constraint creation rerun-safe.
- Added `has_company_permission(company_id, permission)` database authorization helper.
- Hardened expense approval/payment RPCs with database-level permission checks.
- Replaced broad finance-member RLS with permission-specific SELECT/INSERT/UPDATE policies and append-only financial records.
- Added missing-profile backfill for existing Auth users.
- Fixed `/api/v1/me` so missing profile rows are repaired automatically and concurrent profile creation is handled safely.
- Added V1.4.2 regression tests.

## Verification

- Backend tests: 59/59 passing.
- JavaScript syntax checks: passed.
