# HySmart Build V1.7.0 — Project Operations & Control Center

## Purpose
Turns the project module into a controlled operating workflow rather than a basic CRUD project list.

## Project lifecycle
- PLANNING → ACTIVE
- ACTIVE → ON_HOLD / COMPLETED / CANCELLED
- ON_HOLD → ACTIVE / COMPLETED / CANCELLED
- COMPLETED and CANCELLED are terminal.
- Starting a project records the transition and automatically supplies a start date when missing.
- Completing a project records the actual end date and sets progress to 100%.
- Direct status mutation through the generic project update endpoint is blocked; status changes use the workflow endpoint.

## Control center
- project health: GREEN / AMBER / RED
- priority: LOW / NORMAL / HIGH / CRITICAL
- lifecycle phase: PRECONSTRUCTION / MOBILIZATION / CONSTRUCTION / CLOSEOUT / DEFECTS_LIABILITY
- contract value, currency and client contact metadata
- delivery snapshot
- budget / committed / actual / variance snapshot
- open task and issue counts
- sites and team counts
- risk register
- change-order register
- readiness checklist
- status history

## Financial/project controls
- project budget lines by category/cost code
- committed and actual values per budget line
- change-order amounts and approval state
- project variance visibility

## Database
Migration:
`supabase/migrations/20261003220000_v1_7_project_operations.sql`

## Existing modules retained
Projects, sites, teams, milestones, tasks, issues, daily reports/photos, materials, inventory, workforce, attendance, expenses, procurement, accounting, documents, messaging, notifications, billing, global identity and offline sync remain in the product.

## Validation
Backend changed files pass `node --check`.
A fresh Web Vite build requires dependency installation; this workspace did not contain `node_modules` during packaging, so no fresh production Web build is claimed.
