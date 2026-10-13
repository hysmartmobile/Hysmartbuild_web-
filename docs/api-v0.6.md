# HySmart Build API V0.6

All endpoints require a Supabase bearer token and a company membership with the required permission.

## Daily site reports
- `GET /api/v1/companies/:companyId/projects/:projectId/reports`
- `POST /api/v1/companies/:companyId/projects/:projectId/reports`
- `GET /api/v1/companies/:companyId/projects/:projectId/reports/:reportId`
- `PATCH /api/v1/companies/:companyId/projects/:projectId/reports/:reportId`
- `DELETE /api/v1/companies/:companyId/projects/:projectId/reports/:reportId`

Supported fields include report date, site, weather, workforce count, work completed/in progress, materials received/used, equipment, issues, safety observations, delays, notes and overall progress.

## Photos
- `POST /api/v1/companies/:companyId/projects/:projectId/reports/:reportId/photos/upload-url`
- `POST /api/v1/companies/:companyId/projects/:projectId/reports/:reportId/photos`

The upload-url endpoint returns a signed Supabase Storage upload token. Accepted images are JPEG, PNG or WebP up to 10 MB.
