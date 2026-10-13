# HySmart Build Web V1.9.0 — Production Hardening

## Included
- Mounted the Construction ERP route so the navigation no longer lands on Not Found.
- Added role/permission-aware navigation using the existing RBAC access endpoint.
- Added unread notification badge and working notification navigation.
- Added global application error boundary.
- Added offline field mutation queue using IndexedDB for daily reports, attendance and construction ERP mutations.
- Added automatic queue replay when connectivity returns.
- Added online/offline/queued status to the application header.
- Hardened the PWA manifest, metadata, icon and service-worker shell caching.
- Added daily-report camera/photo upload workflow using Supabase signed uploads.
- Added practical worker attendance check-in/check-out workflow.
- Fixed global search handoff to the Projects search screen.
- Fixed swallowed document/expense errors and replaced the document download failure path with visible UI feedback.
- Added subscription-required event handling so a 402 subscription response can send users to Billing.
- Standardized application version to 1.9.0.

## Build verification
The source was parsed successfully with the installed TypeScript compiler across all 34 JS/JSX source files. A full Vite bundle could not be produced in the isolated build environment because the Web package dependencies were not locally cached and registry installation timed out. Run `npm ci` followed by `npm run build` in the deployment/CI environment before release.
