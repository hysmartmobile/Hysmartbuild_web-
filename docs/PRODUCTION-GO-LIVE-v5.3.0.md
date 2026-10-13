# HySmart Build v5.3.0 — Production Go-Live Checklist

## Release
V5.3 Reality Layer, additive to V5.2 Construction Network and all prior Construction Operating System features.

## New capability
- Drawing revision impact control
- Project-scoped reality observations
- Photo/video/field-note/QR reality records
- Project-scoped QR markers for assets, locations, BOQ, workfronts, equipment and materials
- As-built verification with mandatory human verification
- Reality chronology that can feed the existing Evidence Engine
- Tenant/project-safe database constraints and RLS

## Required migrations, in order
- 20261006100000_v5_0_construction_autopilot.sql
- 20261006110000_v5_1_evidence_engine.sql
- 20261006120000_v5_2_construction_network.sql
- 20261006130000_v5_3_reality_layer.sql

## Backend
1. `npm ci`
2. `npm test` — expected: 286/286 passing for this release source tree
3. `npm start`
4. `GET /api/v1/health` returns HTTP 200 and version 5.3.0
5. `GET /api/v1/health/ready` returns HTTP 200 only after all required migrations are applied.
6. Production CORS, web URL and billing callback must be HTTPS and non-localhost.

## Web
1. Set `VITE_API_URL` to the production API origin.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. `npm ci`
4. `npm run build`
5. Deploy the generated `dist` output.

## Smoke test
- Sign in / sign out
- Company switch
- Today / Control Tower
- Construction Autopilot
- Evidence Engine
- Construction Network
- Reality Layer
- Collaboration / Comments
- Drawings and drawing revisions
- BOQ Control
- Daily Reports
- Procurement
- Production
- Quality & Safety
- People
- Documents
- Treasury / Revenue & Margin

## Reality Layer acceptance
- Create a project reality observation.
- Link a reality observation to a drawing/revision and verify project ownership.
- Run drawing impact scan and verify impacts are project-scoped.
- Create and scan a project QR marker.
- Create an as-built verification and verify it manually.
- Confirm no external or cross-tenant user can read another company's reality records.
- Confirm reality evidence remains available to the existing Evidence Engine.

## Safety / governance
Reality Layer does not autonomously certify work, approve progress, determine contractual entitlement, approve variations, approve payments, or issue claims/notices. Human verification remains mandatory.

## Environment limitation during packaging
The release environment used for source validation did not have npm dependencies cached; a fresh Web `npm ci --ignore-scripts` attempt timed out. Therefore a production deployment must still perform the Web install/build gate and live Supabase readiness check with production credentials.
