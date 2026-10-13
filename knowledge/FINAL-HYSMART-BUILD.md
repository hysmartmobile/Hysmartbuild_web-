# HySmart Build — Final Integrated Construction ERP

This package is the consolidated HySmart Build product. Historical development labels are retained only in changelog/migration filenames; customers do not install separate feature versions.

## Included product areas

Projects and sites; BOQ/estimating; approved budget baselines; budget/committed/actual cost control; procurement and approvals; suppliers; materials/inventory; workforce/attendance; scheduling/tasks/milestones; daily site reports/photos; issues/risks/delays; subcontractors/contracts/valuations/payments/variations; progress measurement; work certificates; client IPC/valuation; retention; client invoicing and AR; accounting; profitability/forecasting; quality/NCR; health & safety; equipment/plant; document revisions/transmittals; RFIs; client portal/reports; notifications; offline sync; billing/subscriptions; closeout/handover; DLP defects; executive command center; AI-assisted management insights.

## Database

Run the existing ordered HySmart migrations in the Supabase migrations directory. The integrated construction ERP migration is `20261004090000_v1_8_integrated_construction_erp.sql` and must be run after the existing V1.6.x repair migrations and project-operations migration.

The subcontract valuation and variation relationships intentionally use `subcontract_id` and do not invent a `project_id` column. The project is reached through the subcontract relationship.

## Backend

`npm install`
`npm run test`
`npm run dev`

## Web PWA

`npm install`
`npm run dev`

The Web package requires a normal dependency installation before Vite can build. No `node_modules` directory is included in the delivery archive.
