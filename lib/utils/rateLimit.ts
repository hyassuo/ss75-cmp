// Fixed-window rate limiting for the API routes.
//
// rateLimitShared() counts in Postgres (public.rate_limit_hit, migration
// 20260929000000_rate_limits.sql), so every serverless instance shares one
// counter per key. If that call fails (migration not applied yet, database
// unreachable), it falls back to rateLimit(), which counts in this
// instance's memory only: weaker (instances are ephemeral and run in
// parallel), but never lets an outage turn into "no limit at all" or into
// refusing every request.
import { createServiceClient } from "@/lib/supabase/server";

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

let warned = false;

/**
 * Shared (all instances) fixed-window limiter; same contract as rateLimit().
 * Server-only: uses the service-role key.
 */
export async function rateLimitShared(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  try {
    const { data, error } = await createServiceClient().rpc("rate_limit_hit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
    });
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) throw error ?? new Error("empty rate_limit_hit result");
    return { allowed: row.allowed, retryAfter: row.retry_after };
  } catch (e) {
    if (!warned) {
      warned = true;
      console.warn("[rateLimit] shared limiter unavailable, using memory:", e);
    }
    return rateLimit(key, limit, windowMs);
  }
}
