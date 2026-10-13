# HySmart Build Backend v1.4.0 — Offline Field Sync

## Included
- `POST /api/v1/companies/:companyId/sync/push`
- `GET /api/v1/companies/:companyId/sync/status`
- Idempotent operation journal
- Optimistic concurrency/conflict detection
- Retry-safe inventory movements
- Retry-safe material requests
- Tenant/RBAC enforcement

## Supported offline operations
- Projects create/update
- Tasks create/update
- Issues create/update
- Daily reports create/update
- Attendance create/update
- Materials create
- Material requests create
- Inventory movements

The server remains authoritative. A conflict is returned instead of silently overwriting a newer server record.
