import { Router } from "express";
export function createOperatingSystemRouter({
  service,
  authMiddleware,
  authorize,
}) {
  const r = Router();
  r.use(authMiddleware);
  const wrap = (fn) => async (req, res, next) => {
    try {
      res.json({ success: true, data: await fn(req) });
    } catch (e) {
      next(e);
    }
  };
  r.get(
    "/companies/:companyId/today",
    authorize("operating-system:read"),
    wrap((req) =>
      service.today({ companyId: req.params.companyId, userId: req.user.id }),
    ),
  );
  r.get(
    "/companies/:companyId/today/intelligence",
    authorize("operating-system:read"),
    wrap((req) =>
      service.dailyIntelligence({
        companyId: req.params.companyId,
        userId: req.user.id,
        projectId: req.query?.projectId || null,
        refresh: false,
      }),
    ),
  );
 

r.post(
  "/companies/:companyId/today/intelligence/refresh",
  authorize("operating-system:refresh"),

    wrap((req) =>
      service.dailyIntelligence({
        companyId: req.params.companyId,
        userId: req.user.id,
        projectId: req.body?.projectId || null,
        refresh: true,
      }),
    ),
  );
  r.post(
    "/companies/:companyId/today/intelligence/:snapshotId/outcome",
    authorize("workflow:execute"),
    wrap((req) =>
      service.recordIntelligenceOutcome({
        companyId: req.params.companyId,
        userId: req.user.id,
        snapshotId: req.params.snapshotId,
        input: req.body || {},
      }),
    ),
  );
  r.get(
    "/companies/:companyId/money-leak",
    authorize("dashboard:finance"),
    wrap((req) => service.moneyLeak({ companyId: req.params.companyId })),
  );
  r.get(
    "/companies/:companyId/projects/:projectId/boq-intelligence",
    authorize("boq:read"),
    wrap((req) =>
      service.boq({
        companyId: req.params.companyId,
        projectId: req.params.projectId,
      }),
    ),
  );
  r.get(
    "/companies/:companyId/projects/:projectId/boq/:itemId",
    authorize("boq:read"),
    wrap((req) =>
      service.boqItem({
        companyId: req.params.companyId,
        projectId: req.params.projectId,
        itemId: req.params.itemId,
      }),
    ),
  );
  r.get(
    "/companies/:companyId/projects/:projectId/consequence",
    authorize("operating-system:read"),
    wrap((req) =>
      service.consequence({
        companyId: req.params.companyId,
        projectId: req.params.projectId,
      }),
    ),
  );
  r.post(
    "/companies/:companyId/integrations/voice-report",
    authorize("report:create"),
    wrap((req) =>
      service.voiceReport({
        companyId: req.params.companyId,
        userId: req.user.id,
        projectId: req.body?.projectId,
        transcript: req.body?.transcript,
      }),
    ),
  );
  r.post(
    "/companies/:companyId/integrations/field-message",
    authorize("message:create"),
    wrap((req) =>
      service.ingestFieldMessage({
        companyId: req.params.companyId,
        userId: req.user.id,
        input: req.body || {},
      }),
    ),
  );
  return r;
}
