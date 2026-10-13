# HySmart Build v5.7.6 — Productivity Schema Fix

## Fix
The `/today` endpoint runs revenue/margin analysis, which queried nonexistent `project_productivity_records.productivity_index`, `output_quantity`, `target_quantity`, and `record_date` columns. The actual v2.4 schema stores `work_date`, `quantity_completed`, `labour_hours`, and `worker_count`. The query now uses those real columns and derives a low-productivity signal from observed quantity-per-labour-hour compared with the project's median recorded rate. When there is insufficient positive-rate data, it reports no low-productivity signal rather than fabricating a baseline.

## Database
No migration required. This is a query/schema alignment fix and does not modify stored data.

## Validation
Run `node --test test/v5_7_6_productivity_schema.test.js` and the full test suite before production release.
