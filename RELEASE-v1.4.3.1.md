# HySmart Build Backend V1.4.3.1

## Migration hotfix

Fixed `supabase/migrations/20261002180000_v1_4_3_global_billing_identity.sql`:

1. `subscription_plan_prices` is created before any pricing seed INSERT.
2. Pricing seed now joins each pricing CTE row to its matching `subscription_plans.code` instead of cross-joining every plan with every pricing row.
3. The migration remains rerunnable with `ON CONFLICT` handling.

This resolves the V1.4.3 pricing migration failures:
- `42P01 relation "public.subscription_plan_prices" does not exist` when the pricing block is executed without the preceding schema block.
- `21000 ON CONFLICT DO UPDATE command cannot affect row a second time` caused by the incorrect plan/pricing cross join.

## Verification

- Backend test suite: **65/65 passing**
- No fresh npm dependency installation/build claimed.
- Apply the migration as one complete SQL migration, not by selecting only the pricing INSERT block.
