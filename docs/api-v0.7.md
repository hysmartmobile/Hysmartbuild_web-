# HySmart Build V0.7 API

## Materials
- `GET /api/v1/companies/:companyId/materials`
- `POST /api/v1/companies/:companyId/materials`

## Inventory
- `GET /api/v1/companies/:companyId/inventory`
- `GET /api/v1/companies/:companyId/inventory/transactions`
- `POST /api/v1/companies/:companyId/inventory/movements`

Movement types are `RECEIPT`, `ISSUE`, and `ADJUSTMENT`. Stock is changed only by the database RPC `apply_inventory_transaction`, which locks the balance row and writes an immutable transaction record in one transaction.

## Material requests
- `GET /api/v1/companies/:companyId/material-requests`
- `POST /api/v1/companies/:companyId/material-requests`
- `GET /api/v1/companies/:companyId/material-requests/:requestId`
- `POST /api/v1/companies/:companyId/material-requests/:requestId/decision`

Approval uses the database RPC `approve_material_request` and is restricted to `material:approve`.
