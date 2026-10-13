import { Router } from "express";

export function createMeRouter({ authService, companyService, authMiddleware }) {
  const router = Router();
  router.use(authMiddleware);
  router.get("/", async (req, res, next) => {
    try {
      const [profile, companies] = await Promise.all([authService.getProfile(req.user.id, req.user.user_metadata ?? {}), companyService.listForUser(req.user.id)]);
      res.json({ success: true, data: { user: { id: req.user.id, email: req.user.email }, profile, companies } });
    } catch (error) { next(error); }
  });
  return router;
}
