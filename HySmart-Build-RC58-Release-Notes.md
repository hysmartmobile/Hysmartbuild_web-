# HySmart Build v5.7.8 RC58 Release Notes

## Financial integrity
- Added transactional supplier invoice approval and posted AP journal creation.
- Added transactional receivable invoice creation and posted AR journal creation.
- Moved manual journal header, line validation/insertion and posting into one database RPC.
- Made payroll header/items creation atomic and guarded payroll transitions; marking payroll paid now posts a balanced accounting journal in the same transaction.
- Added company-validated atomic bank transaction creation and row-locked idempotent reconciliation marking.
- Restricted all new RPCs to the backend service role.
- Added an isolated-database backup restore rehearsal script with destructive-target guards.
- Added eight RC58 workflow and operational-script contract tests.

## Test results
- Backend tests: 503 passed, 0 failed.
- Backend release gate: 16 passed, 0 failed.
- Frontend tests: 20 passed, 0 failed.
- Frontend production build: intentionally not run.
- Deployment and live database migration: not performed.

## Important limitations
New SQL has not been applied or executed against PostgreSQL in this environment. Real BOQ-to-profitability end-to-end DB proof, two-company API/RPC/storage penetration checks, and a successful backup restoration with measured RPO/RTO still require staging credentials, fixtures, and a real backup. Bank reconciliation remains a reconciled-flag operation, not a full bank-statement import/matching system.
