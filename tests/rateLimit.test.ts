import { beforeEach, describe, expect, it, vi } from "vitest";

// The shared limiter talks to Postgres through the service client; here the
// client is a stub whose rpc() result each test chooses.
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc }),
}));

import { rateLimit, rateLimitShared } from "@/lib/utils/rateLimit";

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("rateLimit (in-memory)", () => {
  it("allows up to the limit, then refuses with a retry time", () => {
    const key = "mem:" + Math.random();
    expect(rateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(rateLimit(key, 2, 60_000).allowed).toBe(true);
    const third = rateLimit(key, 2, 60_000);
    expect(third.allowed).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
  });
});

describe("rateLimitShared", () => {
  it("returns the database's answer", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, retry_after: 42 }], error: null });
    await expect(rateLimitShared("k", 5, 60_000)).resolves.toEqual({
      allowed: false,
      retryAfter: 42,
    });
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: "k",
      p_limit: 5,
      p_window_seconds: 60,
    });
  });

  it("rounds sub-second windows up to one second", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after: 0 }], error: null });
    await rateLimitShared("k", 5, 200);
    expect(rpc.mock.calls[0][1].p_window_seconds).toBe(1);
  });

  it("falls back to memory when the function is missing", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    const key = "fb:" + Math.random();
    expect((await rateLimitShared(key, 1, 60_000)).allowed).toBe(true);
    expect((await rateLimitShared(key, 1, 60_000)).allowed).toBe(false);
  });

  it("falls back to memory when the call throws", async () => {
    rpc.mockRejectedValue(new Error("network down"));
    const key = "throw:" + Math.random();
    expect((await rateLimitShared(key, 1, 60_000)).allowed).toBe(true);
    expect((await rateLimitShared(key, 1, 60_000)).allowed).toBe(false);
  });
});
