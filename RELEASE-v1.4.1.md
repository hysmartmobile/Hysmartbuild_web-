# HySmart Build Backend v1.4.1

## Web/backend alignment fix

### Changes
- Development CORS accepts localhost/127.0.0.1 HTTP origins so Vite port changes do not produce opaque browser `Failed to fetch` failures.
- Company create/update schemas accept `industry`.
- Company service persists and returns `industry`.
- Added migration `20261002150000_v1_4_1_web_company_industry.sql`.
- Server startup metadata now reports API v1.4.0 runtime baseline accurately rather than the stale v0.4.0 label.

### Verification
- 55/55 tests passed.
- TypeScript passed.
- JS syntax passed.
