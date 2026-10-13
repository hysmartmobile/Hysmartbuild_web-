# HySmart Build V0.9 API — Finance

All routes require an authenticated Supabase session and an active company membership.

## Expenses
- `GET /api/v1/companies/:companyId/expenses`
- `POST /api/v1/companies/:companyId/expenses`
- `PATCH /api/v1/companies/:companyId/expenses/:expenseId`
- `POST /api/v1/companies/:companyId/expenses/:expenseId/decision`
- `POST /api/v1/companies/:companyId/expenses/:expenseId/pay`
- `GET /api/v1/companies/:companyId/expenses/:expenseId/approvals`

## Financial records
- `GET /api/v1/companies/:companyId/financial-records`
- `POST /api/v1/companies/:companyId/financial-records`
- `GET /api/v1/companies/:companyId/financial-summary`

Expense approval and payment are guarded PostgreSQL RPCs with row locking and authenticated identity checks. Payment automatically creates a financial record so the expense cannot be marked paid without an auditable transaction entry.
