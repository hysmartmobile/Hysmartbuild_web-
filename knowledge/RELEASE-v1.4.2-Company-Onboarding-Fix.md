# HySmart Build Web — v1.4.2 Company Onboarding Fix

## Root cause fixed
The backend `/api/v1/me` endpoint returns the authenticated workspace payload under `data`, but the Web app previously read `companies` from the outer response object. A successfully created company therefore looked like an empty company list and the UI rendered **Create your company** again.

## Fixes
- Normalize `/api/v1/me` in `src/lib/api.js` to return its `data` payload.
- Make `App.jsx` tolerant of either wrapped or unwrapped `/me` responses.
- Correct company selection after `/me` loads.
- Await onboarding refresh after company creation.
- Validate that the create-company response contains a company ID.
- Stop silently converting `/me` failures into the onboarding screen.
- Add a retryable workspace-load error state.
- Preserve tenant/company selection in local storage.

## Expected flow
Login → Create your company → POST `/api/v1/companies` → receive company ID → select company → GET `/api/v1/me` → `companies.length > 0` → enter Dashboard.
