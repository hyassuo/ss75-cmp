import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Cookies written by the browser (sign-in) are Secure over https too.
    {
      cookieOptions: {
        secure: typeof window !== "undefined" && window.location.protocol === "https:",
      },
    }
  );
}
