// Is this access token the session a password-reset link just created?
//
// The reset page (/auth/reset) used to accept any #access_token /
// #refresh_token pair with type=recovery in the fragment, and the fragment
// is whatever the link says: an insider could send a colleague a link with
// the insider's own tokens and silently sign them into the insider's
// account. The token itself says how its session was obtained, in the
// "amr" (authentication methods) claim, which GoTrue signs:
//
//   - the implicit flow this app uses (lib/supabase/recoveryMail.ts): the
//     /verify endpoint issues the session with method "otp"
//     (supabase/auth internal/api/verify.go, verifyGet:
//     issueRefreshToken(..., models.OTP, ...));
//   - the PKCE flow: the code is exchanged with the link's type, "recovery".
//
// A password sign-in says "password", and a refresh keeps the session's
// original entries and timestamps. So the reset page requires the most
// recent entry to be "otp" or "recovery", with a timestamp of the last few
// minutes (the link is opened, the session minted and this page loaded
// within seconds). Residual risk, by design of GoTrue: "otp" is also what a
// magic link or an emailed one-time code gives, so an insider who opens
// their own reset (or magic) link and forwards the tokens at once is still
// accepted within that window; the page then refuses anyway when another
// user is already signed in on the device (ResetPasswordForm).

/** How old (since the link was opened) a recovery session may be. */
export const RECOVERY_MAX_AGE_MS = 10 * 60 * 1000;
// Device clocks drift: a timestamp this far in the future still counts.
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const RECOVERY_METHODS = new Set(["otp", "recovery"]);

/** The JWT's payload, NOT verified (GoTrue verifies it on setSession). */
export function jwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  try {
    const part = (token ?? "").split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) =>
        "%" + c.charCodeAt(0).toString(16).padStart(2, "0")
      ).join("")
    );
    const v: unknown = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type RecoveryCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: "malformed" | "not-recovery" | "stale" };

export function checkRecoveryToken(token: string | null | undefined, now: number): RecoveryCheck {
  const p = jwtPayload(token);
  const sub = p?.sub;
  if (!p || typeof sub !== "string" || !sub) return { ok: false, reason: "malformed" };
  // Only the detailed form ({method, timestamp}) is accepted: GoTrue issues
  // it; the bare-string form (custom access-token hooks) has no time.
  const entries = Array.isArray(p.amr)
    ? p.amr.filter(
        (e): e is { method: string; timestamp: number } =>
          !!e && typeof e === "object" &&
          typeof (e as { method?: unknown }).method === "string" &&
          typeof (e as { timestamp?: unknown }).timestamp === "number"
      )
    : [];
  if (!entries.length) return { ok: false, reason: "not-recovery" };
  const latest = entries.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
  if (!RECOVERY_METHODS.has(latest.method)) return { ok: false, reason: "not-recovery" };
  const at = latest.timestamp * 1000;
  if (now - at > RECOVERY_MAX_AGE_MS || at - now > CLOCK_SKEW_MS) {
    return { ok: false, reason: "stale" };
  }
  return { ok: true, userId: sub };
}
