# HySmart Build v3.1.0 — Recovery & Accountability

## Product purpose
V3.1 turns Control Tower findings into accountable project recovery programmes. It deliberately reuses the existing Workflow/Command Centre action system rather than creating a second task database.

## Delivered
- Project recovery plans with objective, priority, target finish, target cost variance and review date.
- Recovery plan status lifecycle: PLANNED, ACTIVE, ON_TRACK, AT_RISK, COMPLETED, CANCELLED.
- Existing workflow action linkage to recovery plans with tenant-safe validation.
- Weekly recovery review that records current project health, schedule variance, cost variance, progress and open/overdue linked actions.
- Review engine derives ON_TRACK / ACTIVE / AT_RISK from current project intelligence and linked action execution.
- Recovery Plan web workspace with project selection, creation, action attachment, weekly review and recovery completion.
- Dedicated RBAC: `recovery:read`, `recovery:manage`.
- Tenant-safe RLS and composite foreign keys for project, plan and workflow-action relationships.
- API and frontend version bumped to 3.1.0.

## Verification
- Backend regression suite: **176/176 passing**.
- Backend modified source syntax checks: passing.
- Web production build: **not verified** because the environment lacks a complete offline npm cache (`yallist@3.1.1` is unavailable). Required CI verification remains:

```bash
npm ci
npm run build
```

## Migration
`HySmart-Build-Backend/supabase/migrations/20261004240000_v3_1_recovery_accountability.sql`

Apply database migrations before enabling the Recovery Plans navigation in production.
