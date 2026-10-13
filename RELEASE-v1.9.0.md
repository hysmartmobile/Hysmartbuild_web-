# HySmart Build V1.9.0 — Production Hardening

## Included
- Fixed Construction ERP route exposure in the Web application.
- Fixed executive dashboard runtime failure caused by an undefined `ar` variable.
- Reworked Construction ERP resource scoping: direct project resources, subcontract children, valuation children, equipment children and company-global resources are now handled explicitly.
- Protected tenant/system fields from generic Construction ERP mutation endpoints.
- Validated GRN items against the selected purchase order before posting receipts.
- Fixed project activation start-date transition logic.
- Corrected procurement tax calculation normalization.
- Added derived `project_cost_ledger_v` for unified project commitment/actual reporting.
- Added retention and IPC invoice idempotency protections.
- Added project/procurement indexes for reporting performance.
- Standardized application version to 1.9.0.

## Deployment
Run the V1.9 migration after V1.8 and redeploy the API and Web packages.
Never deploy a real `.env` file from the source archive; use environment variables or a secrets manager.
