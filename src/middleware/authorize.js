export function createAuthorizationMiddleware({ rbacService }) {
  if (!rbacService) throw new Error("RBAC service is required");

  return function requirePermission(permission, { companyParam = "companyId" } = {}) {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
        }

        const companyId = req.params[companyParam];
        if (!companyId) {
          return res.status(400).json({ success: false, error: { code: "COMPANY_CONTEXT_REQUIRED", message: "Company context is required" } });
        }

        const authorization = await rbacService.getAuthorization({ userId: req.user.id, companyId });
        if (!authorization) {
          return res.status(403).json({ success: false, error: { code: "COMPANY_ACCESS_DENIED", message: "You do not have access to this company" } });
        }

        if (!authorization.permissions.includes(permission)) {
          return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: `Permission required: ${permission}` } });
        }

        // Billing remains reachable when a subscription expires so the company can renew.
        const billingAccess = permission.startsWith("billing:");
        if (!billingAccess && typeof rbacService.getSubscriptionStatus === "function") {
          const subscription = await rbacService.getSubscriptionStatus({ companyId });
          if (!subscription) {
            return res.status(402).json({ success: false, error: { code: "SUBSCRIPTION_REQUIRED", message: "A company subscription is required to access the workspace." } });
          }
          {
            const now = Date.now();
            const trialExpired = subscription.status === "TRIAL" && (!subscription.trial_ends_at || new Date(subscription.trial_ends_at).getTime() <= now);
            const paidPeriodExpired = ["ACTIVE", "PAST_DUE", "GRACE_PERIOD", "CANCELLED"].includes(subscription.status)
              && subscription.current_period_end && new Date(subscription.current_period_end).getTime() <= now;
            const graceStillActive = subscription.grace_period_ends_at && new Date(subscription.grace_period_ends_at).getTime() > now;
            const invalidStatus = ["EXPIRED", "SUSPENDED", "CANCELLED"].includes(subscription.status);
            if (invalidStatus && !(subscription.status === "CANCELLED" && graceStillActive)
              || trialExpired
              || (paidPeriodExpired && !graceStillActive)) {
              return res.status(402).json({ success: false, error: { code: "SUBSCRIPTION_REQUIRED", message: "Your company subscription has expired or requires renewal." } });
            }
          }
        }

        req.authorization = authorization;
        next();
      } catch (error) {
        next(error);
      }
    };
  };
}
