import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/domain";

export interface AppSession {
  supabase: Awaited<ReturnType<typeof createClient>>;
  /** The verified user's id; null without a valid session. */
  userId: string | null;
  /** That user's profile, when it exists and RLS lets them read it. */
  profile: Profile | null;
}

// One Supabase client per request, shared by the helpers below (and so one
// cookie session: an expired token is refreshed once, not per caller).
const requestClient = cache(createClient);

// The `sub` claim of a JWT, NOT verified: only used to start the profile
// query early; the result counts only if it matches the verified id.
function unverifiedSub(jwt: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")
    ) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

// The signed-in user and their profile, in one round-trip: the JWT
// verification and the profile query run in parallel instead of one after
// the other. React's cache() shares the result between the layout and the
// pages of the same request.
//
// getClaims() verifies the JWT's signature and expiry locally against the
// project's public keys (JWKS, cached per server instance) when Supabase
// signs with asymmetric keys; with the legacy shared secret (HS256) it
// asks GoTrue (/auth/v1/user), exactly like getUser(). The asymmetric path
// cannot see a ban or a revoked session before the token expires: the
// layout's profile.active check and RLS (inactive = no rows) cover a
// deactivated user either way.
export const getAppSession = cache(async (): Promise<AppSession> => {
  const supabase = await requestClient();
  const none = { supabase, userId: null, profile: null };
  // Cookie read, no network (unless the access token must be refreshed).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const sub = session ? unverifiedSub(session.access_token) : null;
  if (!session || !sub) return none;

  const [claims, profileRes] = await Promise.all([
    supabase.auth.getClaims(session.access_token).catch(() => null),
    supabase.from("profiles").select("*").eq("id", sub).single(),
  ]);
  const userId = claims?.data?.claims.sub ?? null;
  if (!userId) return none;
  return {
    supabase,
    userId,
    profile:
      profileRes.data?.id === userId ? (profileRes.data as Profile) : null,
  };
});

// How many items the user can see (RLS applies; null on any failure). The
// (app) layout fetches it alongside getAppSession() so the client can
// request every page of its paged item load at once (fetchAll `expected`).
// Only a hint: fetchAll still pages on if the table has grown meanwhile.
export const getVisibleItemCount = cache(async (): Promise<number | null> => {
  const supabase = await requestClient();
  const { count, error } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true });
  return error ? null : count;
});
