# HySmart Build v5.7.4 — Production Theme Implementation

This release builds on the v5.7.3 company-wide subscription gate and improves theme consistency across the web/PWA application.

## Theme behavior
- Light and dark modes are available from the persistent top navigation toggle and Settings > Workspace.
- Theme selection is stored locally and restored before React renders, preventing a first-render theme flash in normal browser sessions.
- Theme changes broadcast to mounted components so Settings and the global toggle stay synchronized.
- Storage failures do not prevent changing the theme for the current session.
- Semantic CSS tokens bridge current and legacy component styles, including shared surfaces, borders, text, inputs, tables, modal panels, alerts, project cards, ERP modules, and status chips.
- Dark mode preserves readable contrast for primary actions and gives warning/error states distinct surfaces.
- Keyboard focus, disabled controls, small-screen navigation, and reduced-motion preferences are addressed.

## Release scope
- Web package version: 5.7.4
- Backend: unchanged from v5.7.3
- Database migration: none required for this theme-only release
- Theme preference: browser-local per user/device; it is not a company-wide setting

## Validation
Run in the web directory:

```bash
npm ci
npm run build
```

Then test the built PWA in desktop and mobile widths, with both themes, across dashboard, projects, tables/forms, modals, billing, and Settings. Confirm the selected theme survives a reload and remains synchronized when toggled from either the top bar or Settings.
