# HySmart Build Web V5.7.1 — Packaging Audit

- Removed the local `.env` file from the distributable archive. Configure `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` through deployment environment settings.
- Preserved the existing frontend source, routes, assets, PWA manifest, and service worker.
- Backend release-gate tests that inspect the web shell pass when run against this source tree.
- A production Vite build could not be verified in this environment because dependency installation timed out while contacting the npm registry. Run `npm ci` and `npm run build` in CI or another network-enabled environment before deployment.
