## v5.7.6 — Productivity Schema Fix
- Fixed `/today` failing on nonexistent `project_productivity_records.productivity_index`, `output_quantity`, `target_quantity`, and `record_date` fields.
- Uses schema-backed `work_date`, `quantity_completed`, `labour_hours`, and `worker_count` fields.
- Derives low-productivity signals against the project's median observed output per labour hour, and avoids emitting a signal when there is insufficient valid data.
- No database migration required.

## v5.7.5 — Schema Query Repair

- Fixed ambiguous supplier invoice/purchase order embeds by naming the tenant-safe FK.
- Removed invalid material-plan columns from read queries and sourced units from materials.
- No database migration required.

# Changelog

## V2.2.0 — Planning, Scheduling & Progress Control
- Added production scheduling, WBS, CPM, baseline, progress, look-ahead and delay/EOT controls.


## 1.6.5
- Removed invalid accounting_journals project tenant FK. Project/site attribution is stored on accounting_journal_lines in V1.6.
- Retained tenant-safe procurement/accounting foreign keys for columns that actually exist in the live V1.6 schema.


## 1.6.4
- Fixed platform-admin middleware scope so `/admin/*` alone requires platform administrator access.
- Fixed V1.6.3 tenant FK repair so referenced `(company_id,id)` keys are backed by explicit unique constraints.
- Added defensive checks for parent tables/columns before composite tenant constraints.
- Corrected API runtime version labels to 1.6.4.

HySmart Build Backend Changelog

## V1.6.3 — Production schema repair
- Fixed PostgREST attendance relationship ambiguity by hydrating workers/sites with explicit tenant-scoped queries.
- Fixed ambiguous company/project member profile embeddings by naming the profile FK relationship.
- Added idempotent Supabase repair migration for legacy `enabled` versus canonical `active` payment-provider route schemas.
- Restored/hardened invitation schema and atomic manual-link acceptance RPC.
- Added tenant-safe procurement/accounting composite foreign keys for future writes.
- Added V1.6.3 regression tests.

# Changelog

## 1.6.0 — Full Procurement & Accounting
- Added complete procurement workflow from requisition through supplier payment.
- Added supplier quotation management.
- Added goods received notes and receiving controls.
- Added supplier invoice approval and AP payment tracking.
- Added chart of accounts and cost codes.
- Added double-entry accounting journal posting.
- Added accounts receivable and customer payments.
- Added tax/VAT rate management.
- Added payroll runs.
- Added bank accounts, transactions and reconciliation.
- Added trial balance, P&L, balance sheet, cash flow, AP/AR aging and project-cost reports.
- Added V1.6 authorization permissions and server-side mutation controls.
- Added Web PWA procurement and accounting workspaces.

## V1.9.0 — Production Hardening
- Fixed Construction ERP scoping, executive runtime defects, project activation, GRN validation and procurement tax normalization.
- Added unified project cost ledger view and idempotency protections.
- Removed production `.env` from release package.

## v5.7.2 — explicit subscription choice
- Removed automatic 14-day trial provisioning for newly created companies; existing subscriptions are preserved.
- Added owner-only `POST /api/v1/companies/:companyId/billing/trial` to explicitly activate a single 14-day Starter trial.
- Tightened subscription authorization so missing subscriptions and expired trials cannot access protected company APIs, while billing routes remain available for renewal.
- Added subscription-choice migration, deployment notes, and regression tests.

## v5.7.3 — Company-wide subscription lock and owner-only renewal
- Enforce the same subscription status for every active member of a company; expired trials and expired/suspended subscriptions block protected workspace API requests regardless of member role.
- Add a minimal membership-verified billing status endpoint so non-owner members can see the lock state without exposing invoices or payment history.
- Restrict trial activation, checkout, payment verification, cancellation, and resume actions to the active company owner.
- Successful owner payment restores access through the existing subscription record without changing member roles or role permissions.
