# RC45 — Staging financial-link verification runbook

## Purpose and limits

This release adds a **read-only SQL catalog check** for the V1.10 relationship between manually recorded expenses and supplier invoices. It is intended to be run in the actual Supabase **staging** SQL Editor. It does not connect to a database, apply migrations, modify rows, or prove cross-company behavior by itself. Do not run it against production as a substitute for a change plan.

## 1. Verify the migration in staging

1. Confirm the target Supabase project is the staging project.
2. Open SQL Editor and run `scripts/staging-financial-verification.sql`.
3. Require all checks to report `PASS`. A `FAIL` is a **NO-GO**: do not proceed to finance acceptance testing until the migration/schema is reviewed.
4. Keep the result with the release evidence. The script checks the column, validated composite tenant foreign key, parent composite unique key, lookup index, and RLS enabled/policy presence.

The RLS checks only confirm that RLS and policies exist; they do not prove that the policy predicates correctly isolate tenants.

## 2. Safe acceptance test using disposable data

Use two disposable companies (A and B), two separate authenticated member accounts, one project/BOQ item and supplier invoice per company. Use no real financial data. Record expected results before testing.

- Company A member can list and create an expense linked to Company A's invoice when currency and project match.
- A mismatched currency is rejected by the API.
- A Company A expense cannot be linked to Company B's invoice. The API should return the not-found validation result for an invoice outside Company A; a direct database insert with A's company ID and B's invoice ID must fail the composite FK.
- A BOQ item from another company or a project inconsistent with the linked invoice/PO is rejected.
- A pending expense that mirrors a supplier invoice is not counted as a second approved/direct expense in BOQ reconciliation.
- An approved expense linked to an invoice with a currency mismatch must raise a reconciliation review flag rather than silently double-counting it.
- Company B's authenticated account cannot read or modify Company A's expenses or invoices. Test both API paths and Supabase/RLS access using normal authenticated user credentials, never the service-role key.

If any tenant-isolation check fails, stop and investigate RLS policies, membership functions, route authorization, and service-role usage before continuing.

## 3. Financial acceptance evidence

Capture a small, known-value case from staging and compare the UI/API output with independently calculated values: BOQ budget, earned value, certified value, unbilled value, PO commitment, allocated supplier-invoice cost, approved direct expenses, remaining commitment, forecast cost, forecast margin, margin percentage, and reconciliation flags. Check the same currency throughout. Keep IDs redacted in shared evidence.

Current allocation limitation: invoice cost is apportioned to BOQ items using linked purchase-order line shares; there is no invoice-line-to-BOQ allocation model in this release. Treat the result as a project/BOQ allocation estimate, not invoice-line accounting.

## 4. Exit criteria

- All SQL catalog checks PASS.
- Cross-company access and link attempts are denied.
- Known-value figures reconcile independently.
- No duplicate cost is introduced by a linked expense mirror.
- Evidence and any failures are recorded before release approval.

Do not describe RC45 as live-staging-verified until a human has run these checks against the actual staging environment and reviewed the results.
