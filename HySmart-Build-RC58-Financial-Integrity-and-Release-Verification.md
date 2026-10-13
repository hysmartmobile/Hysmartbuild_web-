# HySmart Build RC58 — Financial Integrity and Release Verification

## Implemented in source

Migration `supabase/migrations/20261010170000_v1_15_atomic_financial_workflows.sql` adds service-role-only PostgreSQL functions for:

1. **Supplier invoice approval + journal:** locks the invoice; checks company ownership of its supplier and purchase order; validates totals and accounting accounts; creates a posted, balanced payable/expense journal and updates approval status in one transaction. Replays return the existing invoice only when its posted journal exists.
2. **Receivable invoice + journal:** validates amounts and optional project ownership; inserts the issued invoice and its posted balanced AR/revenue journal in one transaction. Missing accounts or invalid totals fail the whole operation rather than silently creating an unjournaled invoice.
3. **Manual journal posting:** validates each account, optional project, cost code and site against the selected company; validates every line and balance; inserts the header, lines and posted status atomically.
4. **Payroll run + items:** validates date range, worker company ownership, nonnegative amounts, deductions/tax not exceeding gross, and a single currency; inserts the run and all items atomically.
5. **Payroll status transitions:** row-locks the run and enforces DRAFT → APPROVED → PAID or permitted VOID transitions. PAID transition writes the gross-expense, net-cash and deductions/tax-liability journal in the same transaction and fails if required accounts are missing.
6. **Bank transaction creation and reconciliation flag:** creation validates active bank-account ownership inside the database transaction. Reconciliation marking is company-scoped, row-locked and idempotent.

All new RPCs revoke execution from `PUBLIC`, `anon` and `authenticated` and grant it only to `service_role`. API routes must continue to enforce authenticated membership and feature permissions before calling these functions.

## Verification performed locally

- Backend `npm test`: **503 passed, 0 failed**.
- Backend `npm run verify:release`: **16 passed, 0 failed**.
- Frontend `npm test`: **20 passed, 0 failed**.
- RC58 source-contract tests cover transaction boundaries, tenant-scoped references, journal balance, payroll transitions, and RPC grants.
- `scripts/restore-rehearsal.sh` was added with strict target-name/acknowledgement/empty-database guards. It was syntax-checked only; it has **not** been run against a real backup or database.
- Frontend production build was not run. No deployment was performed.

These local tests inspect source contracts and execute Node tests; they do **not** execute the new SQL against PostgreSQL. No `psql`/PostgreSQL instance or staging credentials were available in this workspace, so migration compilation, DB rollback/concurrency behavior, and actual RLS/storage enforcement remain unverified.

## Remaining external acceptance blockers

| Acceptance item | Current evidence | Still required |
|---|---|---|
| Apply V1.15 migration | Source and grants reviewed; contract tests pass | Apply to disposable staging first; verify function creation and API schema reload |
| Finance transaction rollback/concurrency | SQL transaction design and source tests | Live DB tests for invalid totals, duplicate requests, simultaneous approval/payment and rollback |
| BOQ → procurement → delivery → inventory → field consumption → progress → profitability | Existing service/source fixtures and release checks | Seed controlled staging project and prove row IDs, quantities and amounts at each real DB/API step |
| Cross-company negative tests | Company guards in new RPCs; existing source/RLS checks | Use two real test companies; test API, direct REST/RPC and storage-object reads/writes with unauthorized tokens |
| Backup restoration | Guarded restore rehearsal script added | Obtain real off-host backup, restore to empty isolated DB, verify representative financial/BOQ/inventory totals and storage objects, record measured RPO/RTO |
| Bank reconciliation | Atomic transaction insertion and reconciliation flag | True statement import/matching, difference handling and live reconciliation test remain separate work; marking a transaction reconciled is not a full statement-matching workflow |
| Payroll | Atomic creation, guarded transitions and PAID journal in source | Live tests and confirmation that the company's payroll rules, tax/deduction mapping and payment execution match operational requirements |

## Restore rehearsal command (isolated target only)

After provisioning an empty database whose exact name contains `restore_test` or `staging_restore`, provide `BACKUP_FILE`, `RESTORE_TARGET_DATABASE_URL`, `RESTORE_TARGET_DATABASE_NAME`, and `RESTORE_REHEARSAL_ACK=RESTORE_TO_EMPTY_ISOLATED_DATABASE`, then run:

```bash
bash scripts/restore-rehearsal.sh
```

The script accepts a custom-format `pg_dump` archive. It restores database data only; object storage requires its own backup/restore procedure. Never point this script at production or a database containing data.

## Release status

**RC58 is a code-level release candidate, not yet verified production-ready.** The source fixes are implemented and local test suites pass. Do not treat staging-only acceptance items above as complete until real evidence is recorded.
