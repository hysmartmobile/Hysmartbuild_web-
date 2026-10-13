# HySmart Build V3.6.0 — Workfront & Production Intelligence

## Purpose
V3.6 makes HySmart operational at the workfront level: management can see whether work can actually start, record what was produced, measure labour productivity, capture blockers, and receive evidence-driven recovery recommendations.

## Delivered
- Tenant-safe workfront register linked to schedule activities.
- Nine-condition workfront readiness engine:
  - Drawing approved
  - Material available
  - Labour available
  - Predecessor complete
  - RFI resolved
  - Permit available
  - Inspection ready
  - Access ready
  - Equipment available
- Automatic readiness status: READY / BLOCKED / PENDING.
- Daily production entries with quantity, unit, labour hours, worker count and shift.
- Target productivity versus actual productivity.
- Blocker/root-cause taxonomy:
  - Material
  - Labour
  - Equipment
  - Drawing/RFI
  - Access/workfront
  - Rework
  - Weather/logistics
  - Client decision
  - Other
- Evidence notes and evidence URL support.
- Management recommendations for blocked workfronts, productivity recovery and inactive starts.
- Production dashboard at `/production`.
- New permissions: `production:read`, `production:manage`.
- RLS tenant protection and composite project/workfront foreign-key protection.
- API endpoints for dashboard, workfronts, readiness and production capture.

## Strategic effect
V3.6 closes the loop between:

**Schedule → Workfront readiness → Field production → Productivity variance → Blocker → Recovery action → Commercial/time impact**

This is the foundation for the Site Production System and later procurement, subcontractor and claims intelligence.

## Verification
- Backend test suite: **200/200 passing**.
- Backend syntax checks passed for new service/router and application wiring.
- Web production build: **not run** in this environment because the Web package has no installed dependency cache/node_modules. CI should run `npm ci && npm run build` in `HySmart-Build-Web`.

## Migration
Apply:
`supabase/migrations/20261005010000_v3_6_workfront_production_intelligence.sql`

## API
- `GET /api/v1/companies/:companyId/projects/:projectId/production`
- `GET /api/v1/companies/:companyId/projects/:projectId/workfronts`
- `POST /api/v1/companies/:companyId/projects/:projectId/workfronts`
- `POST /api/v1/companies/:companyId/projects/:projectId/workfronts/:workfrontId/readiness`
- `POST /api/v1/companies/:companyId/projects/:projectId/production`
