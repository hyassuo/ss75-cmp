import { cookies } from "next/headers";
import type { Lang } from "@/lib/i18n/dict";

// Language chosen in the app (LangContext writes the cookie), or null.
export async function serverLang(): Promise<Lang | null> {
  const v = (await cookies()).get("ss75-cmp.lang")?.value;
  return v === "pt" || v === "en" ? v : null;
}
