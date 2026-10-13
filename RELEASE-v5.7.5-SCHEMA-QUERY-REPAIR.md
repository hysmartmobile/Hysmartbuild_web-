# HySmart Build Backend v5.7.5 — Schema Query Repair

## Fixes

- Resolved PostgREST `PGRST201` ambiguity for supplier invoices joined to purchase orders by explicitly selecting `supplier_invoices_po_tenant_fk` in all supplier-invoice-to-purchase-order embeds.
- Removed invalid `project_material_plans.unit` references. The unit is read from the related `materials` record instead.
- Removed invalid `project_material_plans.received_quantity` references. Material-plan risk is now calculated using the persisted plan status and required date; it no longer pretends that a nonexistent received-quantity field exists.
- Preserved existing data and schema. No database migration is required for these query corrections.

## Deployment

Deploy this backend release and restart the service. No schema migration is required. Then verify `/api/v1/companies/:companyId/today` and `/api/v1/companies/:companyId/construction-truth` using a company with project material plans and supplier invoices.
