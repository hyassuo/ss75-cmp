import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { Database } from "@/lib/types/database.types";
import { requestIsHttps, sessionCookieOptions } from "@/lib/supabase/cookieOptions";

export async function createClient() {
  // cookies() is async (Next 15+; Next 16 removed the sync fallback).
  const cookieStore = await cookies();
  const secure = requestIsHttps(null, await headers());

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            // Session-only (ends when the browser closes: required by the
            // session-policy decision), Secure over https.
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, sessionCookieOptions(options, secure))
            );
          } catch {
            // Called from a Server Component: the proxy refreshes the session.
          }
        },
      },
    }
  );
}

// Service-role client for admin server actions (bypasses RLS). Server-only.
export function createServiceClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
