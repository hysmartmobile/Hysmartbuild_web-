# V1.6 Database Deployment

Run migrations in chronological order. If the existing database is already at V1.5, the new required migration is:

`supabase/migrations/20261003150000_v1_6_procurement_accounting.sql`

It adds the full procurement and accounting model and its authorization/RLS controls.

After migration:

1. Restart the Node API.
2. Verify `GET /api/v1/health`.
3. Verify the authenticated company can load `/api/v1/me`.
4. Open Procurement and Accounting in the Web PWA.
5. Configure provider credentials separately in the backend environment.
6. Never put service-role/payment secret keys in the Web PWA.
