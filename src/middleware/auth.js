export function createAuthMiddleware({ supabase } = {}) {
  if (!supabase) throw new Error("Supabase client is required for auth middleware");
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      }
      const token = header.slice("Bearer ".length).trim();
      if (!token) {
        return res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      }
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        return res.status(401).json({ success: false, error: { code: "INVALID_TOKEN", message: "Invalid or expired session" } });
      }
      req.user = data.user;
      res.locals.actorUserId = data.user.id;
      req.accessToken = token;
      next();
    } catch (error) {
      next(error);
    }
  };
}
