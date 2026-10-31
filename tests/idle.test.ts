import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVITY_PING_MS,
  IDLE_TIMEOUT_MS,
  SERVER_IDLE_LIMIT_MS,
  formatLastSeen,
  idleVerdict,
  lastSeenCookieOptions,
  lastSeenRecent,
  parseLastSeen,
  readLastActivity,
  sessionKey,
  sessionStart,
  writeLastActivity,
} from "@/lib/security/idle";

const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const SID = "0c9e1d2a-1111-4222-8333-944455556666";
const MIN = 60_000;
const claims = (startedMsAgo: number | null, extra: Record<string, unknown> = {}) => ({
  sub: "00000000-0000-0000-0000-00000000c001",
  session_id: SID,
  ...(startedMsAgo === null ? {} : { amr: [{ method: "password", timestamp: Math.floor((NOW - startedMsAgo) / 1000) }] }),
  ...extra,
});
const cookie = (msAgo: number, sid = SID) => parseLastSeen(formatLastSeen(sid, NOW - msAgo));

describe("idle limits", () => {
  it("the server allows the client's limit plus one ping interval", () => {
    expect(IDLE_TIMEOUT_MS).toBe(30 * MIN);
    expect(SERVER_IDLE_LIMIT_MS).toBe(IDLE_TIMEOUT_MS + ACTIVITY_PING_MS);
  });
});

describe("last-seen cookie", () => {
  it("round-trips session id and time; rejects anything else", () => {
    expect(parseLastSeen(formatLastSeen(SID, NOW))).toEqual({ sid: SID, t: NOW });
    for (const bad of [undefined, null, "", "x", `${SID}.`, `.${NOW}`, `${SID}.12ab`, `a;b.${NOW}`, `${SID}.1.2`]) {
      expect(parseLastSeen(bad)).toBeNull();
    }
  });

  it("is HttpOnly, SameSite=Lax, session-only, Secure only over https", () => {
    expect(lastSeenCookieOptions(true)).toEqual({ path: "/", httpOnly: true, sameSite: "lax", secure: true });
    expect(lastSeenCookieOptions(false).secure).toBe(false);
    expect(lastSeenCookieOptions(false)).not.toHaveProperty("maxAge");
    expect(lastSeenCookieOptions(false)).not.toHaveProperty("expires");
  });
});

describe("session identity from the token", () => {
  it("session id (else the user id)", () => {
    expect(sessionKey(claims(0))).toBe(SID);
    expect(sessionKey({ sub: "u-1" })).toBe("u-1");
    expect(sessionKey({ session_id: "bad id;" })).toBe("none");
  });
  it("start = newest amr timestamp", () => {
    expect(sessionStart({ amr: [{ method: "password", timestamp: 100 }, { method: "otp", timestamp: 200 }] })).toBe(200_000);
    expect(sessionStart({ amr: ["password"] })).toBeNull();
    expect(sessionStart({})).toBeNull();
  });
});

describe("idleVerdict", () => {
  it("a recent last-seen of this session: ok", () => {
    expect(idleVerdict(cookie(5 * MIN), claims(3 * 3600_000), NOW)).toBe("ok");
    expect(idleVerdict(cookie(SERVER_IDLE_LIMIT_MS), claims(3 * 3600_000), NOW)).toBe("ok");
  });
  it("an old last-seen of this session: expired", () => {
    expect(idleVerdict(cookie(SERVER_IDLE_LIMIT_MS + 1), claims(0), NOW)).toBe("expired");
    expect(idleVerdict(cookie(2 * 3600_000), claims(0), NOW)).toBe("expired");
  });
  it("no cookie (or another session's): judged by when the session started", () => {
    // Just signed in (or a reset link): ok, the cookie starts now.
    expect(idleVerdict(null, claims(10_000), NOW)).toBe("ok");
    expect(idleVerdict(cookie(5 * 3600_000, "older-session"), claims(10_000), NOW)).toBe("ok");
    // Browser restarted with the Supabase cookies but not ours, long after
    // sign-in: expired.
    expect(idleVerdict(null, claims(2 * 3600_000), NOW)).toBe("expired");
    expect(idleVerdict(cookie(MIN, "another-session"), claims(2 * 3600_000), NOW)).toBe("expired");
  });
  it("a cookie dated in the future counts as none", () => {
    expect(idleVerdict(cookie(-3600_000), claims(2 * 3600_000), NOW)).toBe("expired");
  });
  it("no cookie and no amr timestamp: let through (not what GoTrue issues)", () => {
    expect(idleVerdict(null, claims(null), NOW)).toBe("ok");
  });
  it("prefetch pre-check: recent cookie only", () => {
    expect(lastSeenRecent(formatLastSeen(SID, NOW - MIN), NOW)).toBe(true);
    expect(lastSeenRecent(formatLastSeen(SID, NOW - SERVER_IDLE_LIMIT_MS - 1), NOW)).toBe(false);
    expect(lastSeenRecent(undefined, NOW)).toBe(false);
  });
});

describe("browser activity clock", () => {
  afterEach(() => vi.unstubAllGlobals());
  const storage = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };

  it("persists per user (another user's time doesn't count)", () => {
    vi.stubGlobal("window", { localStorage: storage() });
    expect(readLastActivity("u1")).toBeNull();
    writeLastActivity("u1", NOW);
    expect(readLastActivity("u1")).toBe(NOW);
    expect(readLastActivity("u2")).toBeNull();
  });

  it("works without storage", () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("denied");
      },
    });
    expect(() => writeLastActivity("u1", NOW)).not.toThrow();
    expect(readLastActivity("u1")).toBeNull();
  });
});
