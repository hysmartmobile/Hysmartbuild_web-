# HySmart Build API V1.2

## Analytics
- `GET /api/v1/companies/:companyId/analytics/overview`
- `GET /api/v1/companies/:companyId/reports/:reportType.csv`

Supported CSV report types: `finance`, `workforce`, `progress`, `expenses`.

Optional filters: `projectId`, `siteId`, `fromDate`, `toDate`.

All routes require authenticated company membership and the corresponding `report:analytics` or `report:export` permission.
