# HySmart Build Backend V1.6.3

Production repair release for the V1.6.2 backend.

## Repairs
- Attendance endpoint no longer relies on ambiguous PostgREST relationship embedding.
- Company member and project member profile embeds use explicit FK relationship names.
- `payment_provider_routes.active` is normalized from legacy `enabled` when that column exists.
- Manual invitation link flow remains email-provider-free and uses an atomic acceptance RPC.
- Procurement/accounting tenant-safe composite FKs are added as `NOT VALID` so historical inconsistent rows do not block deployment; new writes are protected.
- PostgREST schema cache is reloaded by the migration.

## Verification
- `npm test`: 84/84 passed
- Node syntax checks passed for changed services.
- The package includes the exact Supabase migration at `supabase/migrations/20261003190000_v1_6_3_production_schema_repair.sql`.

## Deployment
1. Back up the Supabase database.
2. Run `supabase/migrations/20261003190000_v1_6_3_production_schema_repair.sql` in the Supabase SQL Editor.
3. Confirm the SQL completes without error.
4. Deploy this V1.6.3 backend.
5. Test `/api/v1/companies/{companyId}/attendance`, team members, project team, invitation preview/acceptance, and billing provider routing.
6. After historical procurement/accounting data is verified, validate the new `NOT VALID` foreign keys individually with `ALTER TABLE ... VALIDATE CONSTRAINT ...`.
