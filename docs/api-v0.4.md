# HySmart Build V0.4 API

All routes are under `/api/v1` and require a Supabase bearer token unless noted.

## Projects
- `GET /companies/:companyId/projects?page=1&pageSize=20&search=&status=` — tenant-scoped paginated list.
- `POST /companies/:companyId/projects` — requires `project:create`.
- `GET /companies/:companyId/projects/:projectId` — requires `project:read`.
- `PATCH /companies/:companyId/projects/:projectId` — requires `project:update`.
- `DELETE /companies/:companyId/projects/:projectId` — requires `project:delete`.

## Sites
- `GET /companies/:companyId/projects/:projectId/sites` — requires `site:read`.
- `POST /companies/:companyId/projects/:projectId/sites` — requires `site:create`.

## Project team
- `GET /companies/:companyId/projects/:projectId/team` — requires `project_team:read`.
- `POST /companies/:companyId/projects/:projectId/team` — requires `project_team:create`.
- `DELETE /companies/:companyId/projects/:projectId/team/:userId` — requires `project_team:delete`.

## Milestones
- `GET /companies/:companyId/projects/:projectId/milestones` — requires `milestone:read`.
- `POST /companies/:companyId/projects/:projectId/milestones` — requires `milestone:create`.
- `PATCH /companies/:companyId/projects/:projectId/milestones/:milestoneId` — requires `milestone:update`.

The server derives authorization from the authenticated user and the requested company membership. A frontend-supplied company ID never grants access by itself.
