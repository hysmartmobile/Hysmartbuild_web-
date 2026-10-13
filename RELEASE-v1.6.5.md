# HySmart Build Backend V1.6.4

## Production repair

This release fixes two V1.6.3 deployment/runtime defects:

1. Platform-admin middleware was mounted globally and blocked ordinary company endpoints. It now applies only to `/admin/*`.
2. The V1.6.3 procurement/accounting tenant-FK repair relied on parent-side unique indexes that were not reliably sufficient in the existing schema. V1.6.4 uses explicit `(company_id,id)` unique constraints before adding tenant-safe foreign keys, including `suppliers`.

The runtime API version is now 1.6.4.
