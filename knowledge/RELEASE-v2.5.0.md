# HySmart Build V2.5.0 — Quality, Safety & Compliance Intelligence

## What changed
- Quality checklist template foundation and reusable inspection items.
- Quality inspections with pass/fail scoring and approval workflow.
- Non-conformance reports (NCRs) with severity, root cause, corrective and preventive actions.
- Corrective/preventive/safety/quality action register with verification workflow.
- Safety observations and safety incident / near-miss register.
- Compliance permit register with expiry monitoring.
- Evidence metadata fields across quality, safety and compliance records.
- Project quality/safety/compliance dashboard and management alerts.
- Append-only quality audit-event stream.
- Tenant-safe project/site/template/NCR relationships and RLS.
- Dedicated RBAC permissions for quality, safety and compliance.
- New Quality & Safety PWA workspace.

## Verification
- Backend regression: 146/146 tests passing.
- Modified backend JavaScript syntax checks: passing.
- Web production build: not executed successfully in the offline environment because the npm cache is missing `yallist-3.1.1.tgz`; run `npm ci && npm run build` in CI/deployment environment.

## Migration
Apply:
`HySmart-Build-Backend/supabase/migrations/20261004190000_v2_5_quality_safety_compliance.sql`

## Production notes
- Evidence fields store structured references/metadata; use the existing Documents storage workflow for binary files/photos and reference the resulting document identifiers.
- Review and seed company-specific checklist templates before broad site rollout.
- Configure notification/automation policies for overdue NCRs/actions and expiring permits in the deployment environment.
