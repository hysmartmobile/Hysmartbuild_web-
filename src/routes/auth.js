import { Router } from "express";
import { z } from "zod";

const registerSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(128), fullName: z.string().trim().min(2).max(120) });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });

export function createAuthRouter({ supabase, rateLimiter }) {
  const router = Router();

  router.post("/register", rateLimiter.middleware((req) => `register:${req.ip}`), async (req, res, next) => {
    try {
      const input = registerSchema.parse(req.body);
      const { data, error } = await supabase.auth.signUp({ email: input.email, password: input.password, options: { data: { full_name: input.fullName } } });
      if (error) return res.status(400).json({ success: false, error: { code: "AUTH_REGISTER_FAILED", message: error.message } });
      res.status(201).json({ success: true, data: { user: data.user, session: data.session }, message: data.session ? "Registration successful" : "Registration successful. Check your email to verify your account." });
    } catch (error) { next(error); }
  });

  router.post("/login", rateLimiter.middleware((req) => `login:${req.ip}`), async (req, res, next) => {
    try {
      const input = loginSchema.parse(req.body);
      const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
      if (error) return res.status(401).json({ success: false, error: { code: "AUTH_LOGIN_FAILED", message: "Invalid email or password" } });
      res.json({ success: true, data: { user: data.user, session: data.session } });
    } catch (error) { next(error); }
  });

  router.post("/password-reset", rateLimiter.middleware((req) => `password-reset:${req.ip}`), async (req, res, next) => {
    try {
      const input = z.object({ email: z.string().email() }).parse(req.body);
      const { error } = await supabase.auth.resetPasswordForEmail(input.email);
      if (error) return res.status(400).json({ success: false, error: { code: "AUTH_PASSWORD_RESET_FAILED", message: error.message } });
      res.json({ success: true, data: null, message: "If the account exists, password reset instructions have been sent." });
    } catch (error) { next(error); }
  });

  router.post("/logout", async (req, res) => {
    const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
    if (token) await supabase.auth.admin.signOut(token).catch(() => undefined);
    res.json({ success: true, data: null, message: "Signed out" });
  });

  return router;
}
