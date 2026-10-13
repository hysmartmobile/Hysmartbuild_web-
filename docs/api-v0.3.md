# HySmart Build V0.3 API — RBAC

Base prefix: `/api/v1`

## GET `/rbac/roles`
Returns the canonical role list and effective permission keys configured in `role_permissions`.
Requires authentication.

## GET `/rbac/companies/:companyId/access`
Returns the authenticated user's tenant-bound role and effective permissions.
Requires `user:read` for that company.

## PATCH `/rbac/companies/:companyId/members/:userId/role`
Body:
```json
{ "role": "PROJECT_MANAGER" }
```
Requires `user:update` for the target company.

Rules:
- `SUPER_ADMIN` cannot be assigned through company role management.
- `COMPANY_ADMIN` cannot assign `COMPANY_OWNER`.
- Users cannot change their own role through this endpoint.
- The last active `COMPANY_OWNER` cannot be demoted.

Authorization is evaluated from the authenticated Supabase user plus server-side company membership. A frontend-supplied role or company identifier is never trusted as proof of access.
