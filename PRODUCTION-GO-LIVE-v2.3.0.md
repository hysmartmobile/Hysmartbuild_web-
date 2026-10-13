# HySmart Build V2.3.0 — Production Go-Live Checklist

## 1. Database
- [ ] Apply migrations through `20261004170000_v2_3_execution_commercial_intelligence.sql`.
- [ ] Confirm `project_schedule_activities` has BOQ-link fields.
- [ ] Confirm execution snapshot table and RLS policy exist.
- [ ] Confirm `execution:read` / `execution:manage` permissions are present.
- [ ] Confirm the BOQ/project validation trigger exists.

## 2. API
- [ ] Deploy backend V2.3.0.
- [ ] Verify `/api/v1/companies/:companyId/projects/:projectId/execution/dashboard`.
- [ ] Verify `/execution/measurements` rejects quantities above BOQ quantity.
- [ ] Verify cross-project BOQ linkage is rejected.
- [ ] Verify project cost ledger, AR and supplier invoice joins return expected values.

## 3. Web/PWA
- [ ] Run `npm ci` in `HySmart-Build-Web` using network-enabled CI.
- [ ] Run `npm run build` and publish the resulting Vite output.
- [ ] Verify Planning → BOQ activity linking.
- [ ] Verify Execution dashboard and production measurements.
- [ ] Verify offline/PWA regression from V2.1 remains intact.

## 4. Business acceptance
- [ ] Approve a project budget/estimate before relying on earned-value financial metrics.
- [ ] Link major programme activities to BOQ items where quantity-based earned value is required.
- [ ] Approve production measurements before treating them as earned value.
- [ ] Review SPI/CPI thresholds with project leadership; the default management alert threshold is below 0.90.
- [ ] Review cash exposure against actual payment terms before using it as a treasury forecast.

## Important metric note
Where activities are not linked to BOQ values, HySmart uses schedule-weighted progress as a fallback for project-level earned-value estimation. Quantity-based BOQ measurements should be used for higher-confidence commercial control.
