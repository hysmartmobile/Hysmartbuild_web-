export class InMemoryRateLimiter {
  constructor({ windowMs = 60_000, max = 60, cleanupIntervalMs = Math.max(windowMs, 60_000) } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.entries = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    if (typeof this.cleanupTimer.unref === "function") this.cleanupTimer.unref();
  }

  cleanup(now = Date.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }

  destroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    this.entries.clear();
  }

  check(key) {
    const now = Date.now();
    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      const entry = { count: 1, resetAt: now + this.windowMs };
      this.entries.set(key, entry);
      return { allowed: true, remaining: Math.max(0, this.max - 1), resetAt: entry.resetAt };
    }
    current.count += 1;
    return { allowed: current.count <= this.max, remaining: Math.max(0, this.max - current.count), resetAt: current.resetAt };
  }

  middleware(keyFn = (req) => req.ip) {
    return (req, res, next) => {
      const result = this.check(keyFn(req));
      res.setHeader("X-RateLimit-Limit", String(this.max));
      res.setHeader("X-RateLimit-Remaining", String(result.remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
      if (!result.allowed) {
        return res.status(429).json({ success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } });
      }
      next();
    };
  }
}
