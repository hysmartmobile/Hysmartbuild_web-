# HySmart Build V2.3.0 — Execution & Commercial Intelligence

## Purpose
V2.3 connects project execution to commercial and financial reality. It answers: **How much work was planned, how much has actually been earned, what did it cost, what will it likely cost, what is the cash exposure, and what needs management action now?**

## Delivered
- BOQ-linked schedule activities with planned quantity, unit and planned value.
- Database-enforced BOQ/project ownership validation.
- Production quantity measurement against approved BOQ items.
- Measurement over-quantity protection.
- Planned Value (PV) and Earned Value (EV).
- Actual and committed project cost from the unified project cost ledger.
- Schedule Performance Index (SPI).
- Cost Performance Index (CPI).
- Forecast cost using current cost efficiency.
- Planned vs actual progress variance.
- Forecast completion date and schedule variance.
- Project receivables and supplier-payables cash exposure.
- Overdue receivable/payable detection.
- Project-linked material movement/reorder risk.
- Management alerts for schedule, cost, critical-path, materials and cash exposure.
- Daily execution snapshots for trend history.
- Dedicated `execution:read` and `execution:manage` permissions.
- New PWA Execution dashboard.
- BOQ production measurement form.
- Execution history/snapshot view.
- Planning activity form can link activities directly to BOQ items.

## Verification
- Backend regression suite: **126/126 passing**.
- Modified backend JavaScript syntax: **clean**.
- Web production build: **not executed successfully in this environment** because the npm cache is missing `yallist-3.1.1.tgz`; `npm ci --offline` therefore cannot install the existing Vite dependency tree.
- No production build pass is claimed until CI or a fully provisioned development environment runs `npm ci && npm run build`.

## Migration
`HySmart-Build-Backend/supabase/migrations/20261004170000_v2_3_execution_commercial_intelligence.sql`

Run all migrations in chronological order through Supabase before deploying the V2.3 application.
