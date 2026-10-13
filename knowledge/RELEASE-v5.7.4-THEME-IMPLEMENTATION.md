# Release v5.7.4 — Light/Dark Theme Hardening

## Included
- One validated theme utility shared by the top-bar toggle and Settings.
- Persistent per-browser preference with guarded storage access and pre-render theme initialization.
- Synchronization between mounted controls when either toggle is used.
- Semantic color tokens bridged to legacy CSS variable names used throughout the ERP modules.
- Dark-mode treatment for primary actions, inputs, tables, project cards, modals, company switching, billing/onboarding surfaces, status chips, risk alerts, and ERP-specific panels.
- Theme cache version bumped to `hysmart-shell-v5.7.4` so installed PWAs can replace older cached shell assets.
- Keyboard focus visibility, disabled control feedback, reduced-motion support, and small-screen topbar adjustments.
- Static regression tests in `test/theme-implementation.test.js`.

## Compatibility
- Web version: 5.7.4
- Backend: v5.7.3 unchanged
- No database migration required
- Theme preference is per browser/device and does not affect company data or roles

## Validation
The static theme regression suite passes. A Vite production build could not be completed in this environment because dependency installation did not finish, so run `npm ci && npm run build` in CI or the deployment environment before promoting this release.
