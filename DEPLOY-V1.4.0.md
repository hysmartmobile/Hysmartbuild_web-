# HySmart Build Backend V1.4.0 deployment checklist

1. Configure production Supabase URL, anon key and service-role key on the Node server only.
2. Apply every migration in `supabase/migrations/` in order, including `20261002140000_v1_4_offline_sync.sql`.
3. Configure production CORS to the exact Web origin(s).
4. Configure Paystack/Flutterwave secrets only on the server if billing is enabled.
5. Deploy Node and expose HTTPS `/api/v1`.
6. Test `POST /api/v1/companies/:companyId/sync/push` with an authenticated field user.
7. Test duplicate operation replay: submit the same `operationId` twice and verify only one business change occurs.
8. Test conflict handling: change a task/report on Web, then sync an offline update carrying the older `baseUpdatedAt`; the server must return `CONFLICT`.
9. Test inventory movement replay and material-request replay.
10. Monitor the `offline_sync_operations` table for conflicts and failed operational patterns.

Do not put Supabase service-role, Paystack secret, or Flutterwave secret keys into Web or Mobile builds.
