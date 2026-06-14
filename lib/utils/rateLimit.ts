// Best-effort in-memory fixed-window rate limiter.
//
// NOTE: serverless instances are ephemeral and may run in parallel, so this
// throttles per warm instance, not globally. It is enough to stop a single
// client hammering the Gemini proxy and burning quota. For hard global
// limits, back this with Vercel KV / Upstash Redis.

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();
let lastSweep = 0;

function sweep(now: number) {
  // Drop expired windows occasionally so the map doesn't grow unbounded.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  buckets.forEach((w, k) => {
    if (w.resetAt <= now) buckets.delete(k);
  });
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number; // seconds until the window resets
}

/**
 * @param key      unique caller key (e.g. `ifs:<userId>`)
 * @param limit    max requests per window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const win = buckets.get(key);
  if (!win || win.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (win.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.ceil((win.resetAt - now) / 1000),
    };
  }

  win.count += 1;
  return { allowed: true, retryAfter: 0 };
}
