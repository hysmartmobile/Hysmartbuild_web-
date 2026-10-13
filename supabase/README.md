# Supabase setup

V0.1 uses Supabase as the infrastructure provider but does not create business entities yet.

Apply the migration:

```bash
supabase db push
```

or run the SQL migration through the Supabase SQL editor.

The API health check uses `public.hysmart_system_health` to verify actual database connectivity.

Authentication, profiles, company membership, RLS policies and tenant-aware business tables are introduced in V0.2.

No Edge Functions are used.
