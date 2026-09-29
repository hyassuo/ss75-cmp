import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readJson, requireAdmin, sameOrigin } from "@/lib/supabase/adminGuard";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/utils/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  // Tighter than the other admin routes — each call sends an email.
  const rl = rateLimit(`users-reset:${guard.ctx.userId}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const body = await readJson<{ email?: string }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { email } = body;
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const admin = createServiceClient();
  // Only send resets to users that actually exist in this system — prevents
  // using the endpoint to fire Supabase emails at arbitrary addresses — and
  // only to users in the requesting admin's own unit.
  const { data: target } = await admin
    .from("profiles")
    .select("id, unit_id")
    .eq("email", email)
    .maybeSingle();
  if (!target || target.unit_id !== guard.ctx.unitId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // The email link must carry the session itself (implicit flow). The SSR
  // clients default to PKCE, whose one-time code can only be redeemed by the
  // client that asked — this server, not the user's browser — so the link
  // used to fail. /auth/reset turns the tokens into a session and lets the
  // user pick a new password. The link points back at the site the admin
  // is using (Supabase only follows it if it is in Auth → Redirect URLs).
  const appUrl = new URL(request.url).origin;
  const mailer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
  const { error } = await mailer.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/reset`,
  });
  if (error) {
    console.error("[users/reset]", error);
    return NextResponse.json(
      { error: "Could not send reset email" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
