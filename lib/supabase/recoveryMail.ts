import { createClient } from "@supabase/supabase-js";

// Sends Supabase's password-reset email with the implicit flow: the link
// itself carries the session (#access_token…&type=recovery), so it works in
// any browser: including an installed iOS web app, whose cookies are
// separate from the Mail app's browser. The SSR clients force PKCE, whose
// one-time code is redeemable only by the client that asked (this server).
// The service-role key keeps a CAPTCHA setting from blocking server calls.
export async function sendRecoveryEmail(email: string, appUrl: string) {
  const mailer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
  // Supabase follows the link only if it is listed in Auth → Redirect URLs
  // (otherwise it falls back to the Site URL; RecoveryRedirect forwards).
  return mailer.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/reset`,
  });
}
