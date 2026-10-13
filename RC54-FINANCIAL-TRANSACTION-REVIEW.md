# RC54 — Multi-step financial transaction review

## Scope reviewed
- Supplier invoice item insertion: atomic PostgreSQL function, invoice/PO rows are checked and locked; execution is service-role scoped.
- Supplier payment: atomic function updates payment, invoice balance and accounting journal in one transaction; invoice row is locked.
- Customer receipt: atomic function locks the receivable invoice, validates company/status/currency/balance, and writes payment plus balanced journal in one transaction; company-scoped idempotency was added in RC52.
- Inventory receipt and issue: stock movement is routed through a database function that locks the balance and writes the immutable transaction alongside the balance update.

## Remaining multi-step workflows (not claimed fixed by this review)
1. Supplier invoice approval and journal posting need a single transaction boundary or a verified compensating/idempotent design.
2. Receivable invoice creation and journal posting need atomicity review.
3. Payroll calculation, approval, payment and accounting posting need transaction-boundary review.
4. Bank reconciliation and resulting journal creation need duplicate/retry/concurrency tests.
5. Manual journal creation, balancing and posting need explicit atomicity and authorization verification.

## Acceptance rule
Source-contract tests are not proof of PostgreSQL behavior. These items remain NO-GO until migration execution, concurrent duplicate requests, forced rollback tests, and ledger/balance assertions run against an isolated staging database. No live database was available in this run; no migration was applied.
