import { Router } from "express";
import { z } from "zod";
import { ROLES } from "../rbac.js";

const roleSchema = z.object({ role: z.enum(ROLES.filter((role) => !["SUPER_ADMIN", "COMPANY_OWNER"].includes(role))) });

export function createRbacRouter({ rbacService, authMiddleware, authorize }) {
  const router = Router();

  router.get("/roles", authMiddleware, async (_req, res, next) => {
    try {
      res.json({ success: true, data: await rbacService.listRoles() });
    } catch (error) { next(error); }
  });

  router.get("/companies/:companyId/access", authMiddleware, authorize("company:read"), async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: {
          companyId: req.authorization.company_id,
          userId: req.authorization.user_id,
          role: req.authorization.role,
          permissions: req.authorization.permissions
        }
      });
    } catch (error) { next(error); }
  });

  router.patch("/companies/:companyId/members/:userId/role", authMiddleware, authorize("user:update"), async (req, res, next) => {
    try {
      const { role } = roleSchema.parse(req.body);
      const membership = await rbacService.updateMemberRole({
        actorUserId: req.user.id,
        companyId: req.params.companyId,
        targetUserId: req.params.userId,
        role
      });
      res.json({ success: true, data: membership, message: "Member role updated successfully" });
    } catch (error) { next(error); }
  });

  return router;
}
