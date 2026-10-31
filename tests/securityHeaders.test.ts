import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";
import { requestIsHttps, sessionCookieOptions } from "@/lib/supabase/cookieOptions";

describe("next.config security settings", () => {
  it("every response carries the security headers, COOP included", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/(.*)")!;
    const h = Object.fromEntries(all.headers.map((x) => [x.key, x.value]));
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(h["Content-Security-Policy"]).toContain("default-src 'none'");
  });

  it("the image optimiser is off (the app has no next/image)", () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });
});

describe("session cookie options", () => {
  it("session-only, but a deletion stays a deletion", () => {
    const keep = sessionCookieOptions({ path: "/", maxAge: 400 * 86400, sameSite: "lax" }, false);
    expect(keep).toEqual({ path: "/", sameSite: "lax" });
    expect(sessionCookieOptions({ path: "/", maxAge: 0 }, false)).toEqual({ path: "/", maxAge: 0 });
    const past = new Date(0);
    expect(sessionCookieOptions({ expires: past }, false)).toEqual({ expires: past });
    expect(sessionCookieOptions({ expires: new Date(Date.now() + 1e9) }, false)).toEqual({});
  });

  it("Secure only over https", () => {
    expect(sessionCookieOptions({ path: "/" }, true)).toEqual({ path: "/", secure: true });
    expect(sessionCookieOptions({ path: "/" }, false).secure).toBeUndefined();
    const h = (v?: string) => new Headers(v ? { "x-forwarded-proto": v } : {});
    expect(requestIsHttps("http://inner:3000/x", h("https"))).toBe(true);
    expect(requestIsHttps("https://app.example/x", h("http"))).toBe(false);
    expect(requestIsHttps("https://app.example/x", h())).toBe(true);
    expect(requestIsHttps("http://localhost:55436/", h())).toBe(false);
    expect(requestIsHttps(null, h("https, http"))).toBe(true);
    expect(requestIsHttps(null, h())).toBe(false);
  });
});
