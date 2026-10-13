# v5.7.16 workflow hardening — staging rollout

1. Back up the staging database and confirm the target Supabase project is not production.
2. Apply migrations in order, including `20261013130000_v5_7_16_workflow_security_routing_hardening.sql`, using the team's normal Supabase migration process.
3. Confirm the `my_work_events_actor_insert` policy is absent and `anon`/`authenticated` cannot insert, update or delete audit events.
4. Verify the legacy `approve_expense` and `mark_expense_paid` RPCs work through the authenticated API path, enforce active membership/role permission, reject self-approval, reject invalid state transitions and create exactly one audit/notification/financial record.
5. Verify RFI submission and response notifications; verify site-instruction issue and acknowledgement notifications. Confirm no duplicate notifications from application-level code.
6. Run `npm test` in the backend package and `npm run verify:release`. Then run `npm run smoke:staging` with staging-only credentials.
7. In the web package run `npm ci`, `npm test`, and `npm run build`.
8. Use distinct test accounts for Company Owner, Company Admin, Director, Project Manager, Site Engineer, Site Supervisor, Worker, Accountant, Procurement Officer, Storekeeper, HR Manager, Client, and remaining specialist roles. Test both allowed and denied actions.
9. Do not deploy to production until all test failures are explained, RLS/tenant-isolation checks pass, financial journals reconcile, and the operations acceptance checklist in `HYSMART-CONSTRUCTION-OPERATIONS-ROLE-FLOW-AUDIT-2026-10-13.md` is signed off.

**Important:** the migration has not been applied to any live database by this source-only audit. Run it on staging first.
