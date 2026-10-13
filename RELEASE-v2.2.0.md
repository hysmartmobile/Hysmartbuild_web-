# HySmart Build Backend V2.2.0 — Planning, Scheduling & Progress Control

## Delivered
- Tenant-scoped WBS management endpoints using the existing V2.0 WBS foundation.
- Programme activities with planned/actual dates, status, progress, weights and responsible users.
- Activity dependencies: Finish-to-Start, Start-to-Start, Finish-to-Finish and Start-to-Finish, including lag.
- Server-side CPM forward/backward pass with total float and critical-path identification.
- Dependency cycle prevention before persistence.
- Schedule dashboard with planned vs actual progress, forecast completion, variance, critical and delayed activity counts.
- Baseline programme snapshots and approval/superseding workflow.
- Activity progress history and actual-start/actual-finish capture.
- Delay register with reason categories, responsibility and potential EOT status.
- Look-ahead planning endpoint for 2–12 week windows.
- Composite tenant/project foreign keys for schedule relationships to prevent cross-project data attachment.
- Schedule RBAC permissions: `schedule:read`, `schedule:manage`, `schedule:approve`.

## Verification
- Backend test suite: **118/118 passing**.
- All backend source JavaScript files pass `node --check`.
- Web source: **35 JS/JSX files parsed with TypeScript's transpiler; 0 syntax diagnostics**.
- Web production build was not executable in this environment because the dependency cache is missing `yallist-3.1.1.tgz`; no build-pass claim is made.
