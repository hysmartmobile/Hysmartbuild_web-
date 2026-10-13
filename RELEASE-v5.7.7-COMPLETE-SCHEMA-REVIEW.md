# HySmart Build v5.7.7 — Today Endpoint Schema Alignment

## Fix
- Corrected the Today endpoint's attendance query to use `attendance_records`, the actual table defined by the workforce migration.
- Corrected company-memory source metadata to use `daily_site_reports` and `attendance_records`.
- Added regression tests that compare the service's attendance table reference to the migration.
- Aligned backend/web package versions and API startup banner to v5.7.7.

## Schema audit
A static audit compared literal Supabase `.from('table')` calls in backend JavaScript with tables created by the repository's SQL migrations. After the correction, the only names not represented by `CREATE TABLE` declarations are `project_commercial_summary_v` and `project_cost_ledger_v`, which are intended views. This static audit does not replace checking the actual deployed Supabase schema or PostgREST schema cache.

## Validation
- `node --check` passed for every backend JavaScript source file.
- Full backend test suite: 330 passed, 0 failed.
- No SQL migration is required for this fix.
