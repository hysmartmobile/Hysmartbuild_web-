# V4.1 Production Go-Live

1. Apply Supabase migrations in order through `20261005030000_v3_8_to_v4_1_strategic_intelligence.sql`.
2. Run `npm ci --no-audit --no-fund` in Backend and Web.
3. Run Backend `npm test` and confirm 212+ tests pass.
4. Run Web `npm run build` and serve the generated `dist` artifact.
5. Configure production `VITE_API_URL`, Supabase URL/key and backend CORS origin.
6. Confirm RLS is enabled and test two-company isolation.
7. Configure storage policies for project evidence/photos.
8. Configure billing provider secrets and webhook verification before enabling paid plans.
9. If WhatsApp is connected, use a verified provider webhook to POST to the existing field-message intake contract; do not expose unauthenticated internal endpoints.
10. Configure backups, PITR, monitoring, error alerts and database migration rollback procedure.
11. Pilot with one real project before broad rollout.
12. Validate role experiences for Owner/Director, PM, QS, Accountant, Procurement, Site Engineer and HSE.
13. Validate offline capture/sync on an actual low-connectivity site.
14. Validate that AI recommendations are advisory and human approval remains required.
15. Do not advertise automatic photo progress detection or autonomous contract claims until those capabilities are separately validated and released.
