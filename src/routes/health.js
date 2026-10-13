import { Router } from "express";

export function createHealthRouter({ service }) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      success: true,
      data: service.getHealth()
    });
  });

  router.get("/ready", async (_req, res, next) => {
    try {
      const result = await service.checkReadiness();
      res.status(result.ready ? 200 : 503).json({ success: result.ready, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get("/supabase", async (_req, res, next) => {
    try {
      const result = await service.checkSupabase();
      const status = result.connected ? 200 : 503;
      res.status(status).json({
        success: result.connected,
        data: result
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
