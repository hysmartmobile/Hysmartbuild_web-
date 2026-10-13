# HySmart Build PWA release and acceptance checklist

## What was changed

- Added a responsive install prompt that uses the browser's native install event when available.
- Added platform-specific instructions for iOS/iPadOS, Android, and desktop browsers.
- Updated the web app manifest with app identity, standalone display, and 192/512 pixel icon declarations.
- Added mobile web-app metadata and safe-area-aware install UI.
- Reworked the service worker to precache the public app shell, use network-first navigation with a safe offline shell fallback, and cache only same-origin static build assets/public resources. API calls, authenticated requests, and non-GET requests are not cached.
- Added SPA history fallback and no-cache headers for service-worker updates on compatible static hosts.
- Corrected `VITE_API_URL` in `.env.example`: the frontend itself appends `/api/v1`, so set the base URL to `http://localhost:3001`, not a URL already ending in `/api/v1`.

## Install behavior (browser rules)

A PWA cannot silently install itself. Browsers require an explicit user gesture/confirmation. Android Chrome and some desktop browsers can show the native install prompt; iOS/iPadOS generally use Safari Share → Add to Home Screen. The install card appears until dismissed or the app is installed. Browser support and eligibility vary.

## Production requirements

1. Serve the app over HTTPS (localhost is allowed for development).
2. Set the production `VITE_API_URL` to the backend origin, without the `/api/v1` suffix.
3. Set `VITE_SUPABASE_URL` and the public anon key in the hosting environment. Never ship service-role, database-password, Stripe secret, Paystack secret, or other private keys to the web build.
4. Configure the hosting platform to serve `index.html` for client-side routes. `public/_redirects` supports Netlify/Cloudflare Pages-compatible hosts; configure equivalent rewrites if using another host.
5. Configure host/CDN caching so `/sw.js` is not served with long-lived immutable caching. The included `_headers` file covers compatible static hosts.
6. Rebuild and deploy the web app after each release. Confirm the deployed manifest, icons, and `/sw.js` are available on the same origin.

## Acceptance checklist

- [ ] Production build completes without errors.
- [ ] Browser DevTools → Application shows a valid manifest and active service worker.
- [ ] Fresh install is offered where the browser supports it.
- [ ] Android: native Install prompt installs an app icon and launches in standalone display.
- [ ] iOS/iPadOS: Safari Share → Add to Home Screen creates a working home-screen icon.
- [ ] Desktop Chrome/Edge: browser install entry installs and launches a standalone window.
- [ ] Open `/projects`, `/today`, and `/billing` directly and refresh; the host returns the SPA shell.
- [ ] After the app shell has loaded once, disconnect the network and verify that navigation can display the cached app shell. Authenticated data and API operations are expected to require a network connection unless the existing offline queue handles them.
- [ ] Reconnect and confirm normal API access and offline mutation synchronization.
- [ ] Deploy a second build and verify `/sw.js` updates and old `hysmart-pwa-shell-*` caches are removed.
- [ ] Confirm that no secret `.env` files are included in the release archive.

## Scope note

Offline shell availability does not mean the entire authenticated construction ERP works offline. Data access, authorization, subscription checks, uploads, and server-backed workflows still depend on the backend unless explicitly supported by the app's existing offline queue. Run the full production build and device acceptance tests in CI and on actual devices before declaring the release production-approved.
