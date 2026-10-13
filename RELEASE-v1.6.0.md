# HySmart Build V1.6.0 — Full Procurement & Accounting Production Completion

## Included

### Procurement
- Purchase requisitions and approval workflow
- Supplier quotations and acceptance/rejection
- Purchase orders and approval/sending workflow
- Goods received notes with over-receipt protection
- Supplier invoices with approval workflow
- Supplier payment tracking and outstanding-balance protection
- Supplier master data
- Procurement permissions and tenant isolation

### Accounting
- Chart of accounts
- Construction cost codes
- Double-entry accounting journals
- Server-side balanced journal posting
- Accounts payable
- Accounts receivable and customer payments
- Tax/VAT rate master data
- Payroll runs and approval/payment lifecycle
- Bank accounts
- Bank transactions
- Bank reconciliation
- Trial balance
- Profit & loss
- Balance sheet
- Cash flow
- AP aging
- AR aging
- Project cost reporting

### Controls
- Company-scoped RLS read boundary
- Server-side mutation through authenticated API + service role
- Accounting RPC execution restricted from public/authenticated direct execution
- Tenant validation for suppliers, accounts and bank accounts
- Supplier invoice accounting posts only after approval
- Purchase-order receiving updates receipt state and blocks over-receipt

## Migration

Apply after the existing V1.5 migration:

`supabase/migrations/20261003150000_v1_6_procurement_accounting.sql`

## Verification

- Backend JavaScript syntax: PASS
- Backend test suite: 77/77 PASS
- Web dependency installation/build could not be completed in the audit environment because the npm registry dependency download timed out; the release package therefore does not claim a fresh Vite build.
