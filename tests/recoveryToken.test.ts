import { describe, expect, it } from "vitest";
import {
  RECOVERY_MAX_AGE_MS,
  checkRecoveryToken,
  jwtPayload,
} from "@/lib/security/recoveryToken";

const UID = "00000000-0000-0000-0000-00000000c001";
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const s = (ms: number) => Math.floor(ms / 1000);

// An unsigned JWT with this payload (the check reads, GoTrue verifies).
function jwt(payload: unknown): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}
const token = (amr: unknown, extra: Record<string, unknown> = {}) =>
  jwt({ sub: UID, role: "authenticated", amr, ...extra });

describe("jwtPayload", () => {
  it("decodes base64url JSON, including non-ASCII", () => {
    expect(jwtPayload(jwt({ sub: "x", name: "João" }))).toEqual({ sub: "x", name: "João" });
  });
  it("is null for anything that isn't a JWT with an object payload", () => {
    for (const bad of [null, undefined, "", "abc", "a.b.c", "a.bnVsbA.c", `x.${Buffer.from("[1]").toString("base64url")}.y`]) {
      expect(jwtPayload(bad)).toBeNull();
    }
  });
});

describe("checkRecoveryToken", () => {
  it("accepts the session a reset link just created (implicit flow: otp)", () => {
    expect(checkRecoveryToken(token([{ method: "otp", timestamp: s(NOW - 5_000) }]), NOW)).toEqual({ ok: true, userId: UID });
  });

  it("accepts the PKCE flow's method name (recovery)", () => {
    expect(checkRecoveryToken(token([{ method: "recovery", timestamp: s(NOW) }]), NOW).ok).toBe(true);
  });

  it("refuses a password session (an insider's own tokens)", () => {
    expect(checkRecoveryToken(token([{ method: "password", timestamp: s(NOW - 1000) }]), NOW)).toEqual({
      ok: false,
      reason: "not-recovery",
    });
  });

  it("judges by the most recent method", () => {
    const older = { method: "otp", timestamp: s(NOW - 60_000) };
    const newer = { method: "password", timestamp: s(NOW - 1_000) };
    expect(checkRecoveryToken(token([older, newer]), NOW).ok).toBe(false);
    expect(checkRecoveryToken(token([newer, { method: "otp", timestamp: s(NOW) }]), NOW).ok).toBe(true);
  });

  it("refuses a recovery session that isn't fresh (tokens kept and sent later)", () => {
    const old = token([{ method: "otp", timestamp: s(NOW - RECOVERY_MAX_AGE_MS - 1000) }]);
    expect(checkRecoveryToken(old, NOW)).toEqual({ ok: false, reason: "stale" });
    const edge = token([{ method: "otp", timestamp: s(NOW - RECOVERY_MAX_AGE_MS + 1000) }]);
    expect(checkRecoveryToken(edge, NOW).ok).toBe(true);
    // A device clock a little behind is fine; a timestamp far ahead is not.
    expect(checkRecoveryToken(token([{ method: "otp", timestamp: s(NOW + 60_000) }]), NOW).ok).toBe(true);
    expect(checkRecoveryToken(token([{ method: "otp", timestamp: s(NOW + 3_600_000) }]), NOW).ok).toBe(false);
  });

  it("refuses tokens without a usable amr claim", () => {
    for (const amr of [undefined, null, [], "otp", ["otp"], [{ method: "otp" }], [{ timestamp: s(NOW) }], [{ method: 1, timestamp: s(NOW) }]]) {
      expect(checkRecoveryToken(token(amr), NOW)).toEqual({ ok: false, reason: "not-recovery" });
    }
  });

  it("refuses malformed tokens and tokens without a subject", () => {
    expect(checkRecoveryToken("nope", NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(checkRecoveryToken(null, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(checkRecoveryToken(jwt({ amr: [{ method: "otp", timestamp: s(NOW) }] }), NOW)).toEqual({ ok: false, reason: "malformed" });
  });
});
