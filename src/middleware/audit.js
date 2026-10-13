export function auditRequest({ supabase }) {
  return (req, res, next) => {
    if (["POST","PUT","PATCH","DELETE"].includes(req.method)) {
      res.on("finish", () => {
        const companyId = req.params?.companyId || null;
        const actorUserId = res.locals.actorUserId || req.user?.id || null;
        void supabase.from("audit_logs").insert({
          company_id: companyId,
          actor_user_id: actorUserId,
          action: `${req.method} ${req.route?.path || req.path}`,
          entity_type: "API_REQUEST",
          metadata: {
            requestId: req.requestId || null,
            path: req.originalUrl,
            statusCode: res.statusCode
          },
          ip_address: req.ip || null,
            user_agent: req.get("user-agent") || null
        }).then(() => undefined).catch(() => undefined);
      });
    }
    next();
  };
}
