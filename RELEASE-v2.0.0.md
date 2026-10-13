# HySmart Build V2.0.0 — Commercial & Project Controls

## Purpose
V2.0 turns the V1.9 foundation into a controlled construction-commercial workflow.

### Delivered
- Project commercial control-center summary.
- Unified project cost ledger remains the costing source of truth.
- BOQ/estimate CSV import API and Web workflow.
- Cost-code master data table/API.
- WBS foundation table with tenant-safe RLS.
- Controlled change-order state machine: DRAFT → SUBMITTED → APPROVED/REJECTED; cancellation rules included.
- Change-order approval identity, notes, client approval and time/cost impact fields.
- Approved commercial summary for estimate, budget, variations, certification, invoicing, commitments and actual cost.
- Existing Project Control Center PATCH route can no longer bypass change-order approvals.
- Web Commercial tab upgraded with commercial KPIs, BOQ CSV import, controlled change-order actions and IPC/profitability refresh.
- 106 automated backend tests passing.

## Database migration
Apply:
`supabase/migrations/20261004150000_v2_0_commercial_project_controls.sql`

Apply migrations in chronological order. Do not skip V1.9.

## BOQ CSV format
Recommended headers:
`item_no,section,description,category,quantity,unit,unit_rate,tax_rate`

`category` values: MATERIAL, LABOUR, EQUIPMENT, SUBCONTRACTOR, OTHER.

## Deployment gate
Before production:
1. Apply the V2.0 migration in staging.
2. Run backend tests: `npm test`.
3. Run Web: `npm ci && npm run build`.
4. Verify Construction ERP → Commercial for a staging project.
5. Import a small BOQ CSV and verify totals.
6. Submit and approve a test change order.
7. Verify approved variation appears in project profitability/commercial summary.
8. Verify IPC creation/approval/invoicing still works.

## Note
The current sandbox could not complete `npm ci` for the Web package because dependency retrieval timed out. The source was TypeScript-transpiled with zero JS/JSX diagnostics, but the final deployment environment must run the real Vite build successfully before release promotion.
