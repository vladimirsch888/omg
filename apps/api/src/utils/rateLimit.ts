import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/hono";

/**
 * Fixed-window in-memory rate limiter, per client IP. Enough to blunt
 * password guessing on /auth/login on a single-process deployment; it is
 * deliberately not distributed (one Node process per environment here) and
 * forgets everything on restart, which is fine for its purpose.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  const buckets = new Map<string, Bucket>();

  // Sweep expired buckets now and then so the map can't grow without bound.
  let lastSweep = Date.now();
  const sweep = (now: number) => {
    if (now - lastSweep < options.windowMs) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  };

  return createMiddleware<AppEnv>(async (c, next) => {
    const now = Date.now();
    sweep(now);
    const key = clientIp(c.req.raw.headers) ?? "unknown";
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > options.max) {
      c.header("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return c.json({ error: options.message ?? "Слишком много попыток. Попробуйте позже." }, 429);
    }
    await next();
  });
}

/** Behind Nginx the real address arrives in X-Real-IP / X-Forwarded-For. */
export function clientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return null;
}
