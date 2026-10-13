# RC56 — Security, tenant isolation, backup/restore and operational readiness

## Source-level controls checked
- Authenticated identity is checked against supplied user identity in critical inventory and GRN database functions.
- Active company membership is checked before inventory/GRN mutation; mutable purchase-order and stock-balance rows are locked.
- Core inventory tables have row-level security policies based on company membership.
- API baseline includes Helmet, explicit CORS allow-list, bounded JSON payloads, authentication token verification, explicit proxy trust and bounded HTTP timeouts.
- Read-only staging financial verification SQL exists and does not mutate application records.

## Required staging checks (not performed here)
1. **Tenant isolation:** create two disposable companies and users; verify Company A cannot read/write Company B projects, finance, inventory, documents, reports, RPCs or attachments. Test direct REST/RPC calls, not only UI hiding. Check RLS is enabled and policies exist for every tenant table.
2. **Backup:** confirm automated database backups and point-in-time recovery configuration with the provider; export storage/object metadata and document retention/encryption. Backups must be off-host and access-controlled. Never store secrets in the archive.
3. **Restore rehearsal:** restore the latest backup to an isolated environment, apply documented migrations, verify row counts and representative project/BOQ/finance/inventory totals, and record measured RPO/RTO. A backup is not accepted until restore rehearsal succeeds.
4. **Secrets:** use environment-managed secrets; rotate database/service-role/provider credentials; verify least privilege and that logs never contain tokens or payment payload secrets.
5. **Operations:** verify health/readiness probes, alert routing, error rates, queue/sync backlogs, disk/storage capacity, incident owner, rollback procedure and retention/deletion policy.
6. **Security:** run dependency/vulnerability checks, authorization matrix tests, upload limits/type checks, rate-limit checks, and production CORS/TLS checks.

## Release decision
**NO-GO for a production-ready claim** until staging evidence is attached for cross-company negative tests, real database migrations and transaction rollback/concurrency tests, backup restore rehearsal, frontend dependency installation/typecheck/build in the owner's environment, and user acceptance. This work did not deploy, apply migrations, access a live staging database, run a frontend production build, or perform a backup restore.
