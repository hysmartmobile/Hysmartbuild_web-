# HySmart Build V0.8 API — Workforce & Attendance

All endpoints require a verified Supabase bearer session and company membership. Company context is resolved server-side through RBAC; the API does not trust a frontend-selected tenant identity.

## Workers
- `GET /api/v1/companies/:companyId/workers` — list/search workers
- `POST /api/v1/companies/:companyId/workers` — create worker
- `PATCH /api/v1/companies/:companyId/workers/:workerId` — update worker
- `GET /api/v1/companies/:companyId/workers/:workerId/assignments` — list assignments
- `POST /api/v1/companies/:companyId/workers/:workerId/assignments` — assign to project/site
- `PATCH /api/v1/companies/:companyId/worker-assignments/:assignmentId/end` — end active assignment

## Attendance
- `GET /api/v1/companies/:companyId/attendance` — paginated attendance with date/worker/project/site/status filters
- `POST /api/v1/companies/:companyId/attendance` — record attendance
- `PATCH /api/v1/companies/:companyId/attendance/:attendanceId` — correct attendance
- `GET /api/v1/companies/:companyId/attendance/summary` — attendance totals

Statuses: `PRESENT`, `ABSENT`, `LATE`, `ON_LEAVE`.

The database enforces one attendance record per `(company_id, worker_id, site_id, attendance_date)`. RLS is enabled on workforce and attendance tables.
