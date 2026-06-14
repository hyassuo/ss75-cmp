import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database.types";

export function createClient() {
  const cookieStore = cookies();

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
            cookiesToSet.forEach(({ name, value, options }) => {
              // Strip maxAge/expires so the session ends when the browser
              // closes — required by the session-policy decision.
              const sessionOpts = { ...options };
              delete sessionOpts.maxAge;
              delete sessionOpts.expires;
              cookieStore.set(name, value, sessionOpts);
            });
          } catch {
            // Called from a Server Component — middleware refreshes the session.
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
