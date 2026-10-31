import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/auth/forgot with the limiter, the service client and the
// mailer stubbed: what happens before the answer, and what after().

const state = vi.hoisted(() => ({
  deferred: [] as (() => unknown)[],
  hits: [] as { key: string; limit: number; ms: number }[],
  refuse: new Set<string>(), // key prefixes refused by the limiter
  profiles: new Map<string, { email: string; active: boolean }>(),
  lookups: [] as string[],
  sent: [] as string[],
}));

vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => void state.deferred.push(fn) };
});
vi.mock("@/lib/utils/rateLimit", () => ({
  rateLimitShared: async (key: string, limit: number, ms: number) => {
    state.hits.push({ key, limit, ms });
    const no = [...state.refuse].some((p) => key.startsWith(p));
    return { allowed: !no, retryAfter: no ? 42 : 0 };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        ilike: (_c: string, pattern: string) => ({
          maybeSingle: async () => {
            state.lookups.push(pattern);
            return { data: state.profiles.get(pattern) ?? null, error: null };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/recoveryMail", () => ({
  sendRecoveryEmail: async (email: string) => {
    state.sent.push(email);
    return { error: null };
  },
}));

const { POST } = await import("@/app/api/auth/forgot/route");

const ask = (email: unknown, ip = "203.0.113.7") =>
  POST(
    new Request("http://localhost/api/auth/forgot", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email }),
    })
  );
const runDeferred = async () => {
  for (const fn of state.deferred.splice(0)) await fn();
};

beforeEach(() => {
  state.deferred = [];
  state.hits = [];
  state.refuse.clear();
  state.lookups = [];
  state.sent = [];
  state.profiles = new Map([
    ["insp1@test", { email: "insp1@test", active: true }],
    ["off@test", { email: "off@test", active: false }],
  ]);
});

describe("POST /api/auth/forgot", () => {
  it("answers before looking the address up, the same for every address", async () => {
    for (const email of ["insp1@test", "off@test", "nobody@test"]) {
      const res = await ask(email);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
    // Nothing about the accounts was read before the answers went out.
    expect(state.lookups).toEqual([]);
    expect(state.sent).toEqual([]);
    expect(state.deferred).toHaveLength(3);
    await runDeferred();
    expect(state.lookups).toEqual(["insp1@test", "off@test", "nobody@test"]);
    expect(state.sent).toEqual(["insp1@test"]); // active accounts only
  });

  it("normalises the address (case, spaces) and escapes LIKE wildcards", async () => {
    await ask("  Insp1@Test ");
    await ask("a_b%c@test");
    await runDeferred();
    expect(state.lookups).toEqual(["insp1@test", "a\\_b\\%c@test"]);
    expect(state.sent).toEqual(["insp1@test"]);
  });

  it("limits per client, per address from that client, then per address", async () => {
    await ask("insp1@test");
    expect(state.hits.map((h) => [h.key.split(":")[0], h.limit, h.ms])).toEqual([
      ["forgot-ip", 5, 15 * 60_000],
      ["forgot-email-ip", 3, 60 * 60_000],
      ["forgot-email", 10, 60 * 60_000],
    ]);
    expect(state.hits[0].key).toBe("forgot-ip:203.0.113.7");
    // No address in clear in any key.
    expect(state.hits.some((h) => /@/.test(h.key))).toBe(false);
    // The tight key differs per client; the ceiling is the same for all.
    const first = state.hits.map((h) => h.key);
    state.hits = [];
    await ask("insp1@test", "198.51.100.9");
    expect(state.hits[1].key).not.toBe(first[1]);
    expect(state.hits[2].key).toBe(first[2]);
  });

  it("a refusal stops before the wider counters and sends nothing", async () => {
    for (const [prefix, touched] of [
      ["forgot-ip:", 1],
      ["forgot-email-ip:", 2],
      ["forgot-email:", 3],
    ] as const) {
      state.hits = [];
      state.refuse.clear();
      state.refuse.add(prefix);
      const res = await ask("insp1@test");
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("42");
      expect(state.hits).toHaveLength(touched);
    }
    await runDeferred();
    expect(state.sent).toEqual([]);
  });

  it("an attacker's client exhausting its own counter doesn't block the owner's", async () => {
    // The limiter refuses address+client keys only for the attacker.
    await ask("insp1@test", "192.0.2.66");
    state.refuse.add(state.hits[1].key);
    expect((await ask("insp1@test", "192.0.2.66")).status).toBe(429);
    expect((await ask("insp1@test", "203.0.113.7")).status).toBe(200);
  });

  it("rejects malformed input before any counter", async () => {
    for (const bad of ["", "no-at", "a b@c", 42, null, "x".repeat(250) + "@test"]) {
      expect((await ask(bad)).status).toBe(400);
    }
    expect(state.hits).toEqual([]);
  });
});
