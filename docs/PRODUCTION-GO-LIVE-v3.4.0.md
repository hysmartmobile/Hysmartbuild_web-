# Production Go-Live — v3.4.0

1. Apply Supabase migrations in order, including `20261004240000_v3_4_field_recovery_execution.sql`.
2. Run backend `npm test` — expected 190/190.
3. In CI, run web `npm ci && npm run build`.
4. Verify Recovery Plans: create a field execution, link a schedule activity and commitment, record actual quantity/evidence, and mark achieved.
5. Verify tenant isolation and `recovery:execute` authorization.
