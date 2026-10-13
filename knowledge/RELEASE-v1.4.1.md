# HySmart Build Web PWA v1.4.1

## Web/backend alignment fix

This patch release focuses on the company onboarding `Failed to fetch` integration path.

### Changes
- Improved API network error reporting so browser connectivity/CORS failures identify the backend URL and required checks.
- API remains centralized at `${VITE_API_URL}/api/v1`.
- Company onboarding sends `industry` through the backend contract.
- No mock/demo business data introduced.

### Local development
- Web default API: `http://localhost:3001`
- Vite default: `http://localhost:5173`
- If Vite chooses another port, backend development CORS accepts localhost/127.0.0.1 HTTP origins.


## Post-release fix: company onboarding loop
- Fixed Web `App.jsx` to consume the backend `/api/v1/me` `companies` array.
- Company creation now remains in the workspace instead of returning to onboarding.
