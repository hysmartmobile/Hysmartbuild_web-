# V3.6 Production Go-Live Checklist

1. Apply the V3.6 Supabase migration.
2. Confirm the `production:read` and `production:manage` permissions are present.
3. Confirm project schedule activities exist for projects that will use linked workfronts.
4. Create representative workfronts for active production areas.
5. Complete readiness checks before assigning new production targets.
6. Record daily quantities and labour hours from site.
7. Require blocker notes whenever production is constrained.
8. Review Production Control daily and feed material/RFI/recovery actions into existing workflows.
9. Run the Web CI build with installed dependencies: `npm ci && npm run build`.
10. Verify offline/PWA behaviour for production capture before field rollout.
