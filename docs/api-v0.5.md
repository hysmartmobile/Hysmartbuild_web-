# V0.5 API — Tasks, Issues & Project Activity

All routes require a Supabase bearer token and an active company membership with the required permission.

## Tasks
- `GET /api/v1/companies/:companyId/projects/:projectId/tasks?page=1&pageSize=20&status=TODO&priority=HIGH&assignedTo=<uuid>&search=...`
- `POST /api/v1/companies/:companyId/projects/:projectId/tasks`
- `PATCH /api/v1/companies/:companyId/projects/:projectId/tasks/:taskId`
- `DELETE /api/v1/companies/:companyId/projects/:projectId/tasks/:taskId`

Task states: `TODO`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`, `CANCELLED`.
Priorities: `LOW`, `MEDIUM`, `HIGH`, `URGENT`.

## Issues
- `GET /api/v1/companies/:companyId/projects/:projectId/issues?page=1&pageSize=20&status=OPEN&severity=HIGH&assignedTo=<uuid>&search=...`
- `POST /api/v1/companies/:companyId/projects/:projectId/issues`
- `PATCH /api/v1/companies/:companyId/projects/:projectId/issues/:issueId`
- `DELETE /api/v1/companies/:companyId/projects/:projectId/issues/:issueId`

Issue states: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`.
Severities: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

## Activity
- `GET /api/v1/companies/:companyId/projects/:projectId/activity?page=1&pageSize=30`

Activity is append-only and records task/issue creation, updates, status changes, assignments and deletion events.
