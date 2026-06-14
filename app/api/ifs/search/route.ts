import { NextResponse } from "next/server";
import { requireUser, sameOrigin } from "@/lib/supabase/adminGuard";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 80;
const RESULT_LIMIT = 20;

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { query } = (await request.json()) as { query?: string };
  if (!query || typeof query !== "string" || query.length < 2) {
    return NextResponse.json([]);
  }
  // Whitelist sanitisation. PostgREST .or() parses commas, parens, dots and
  // colons as syntax — anything outside [A-Za-z0-9 _-./] for an IFS lookup
  // would either be junk or attempt to break out of the ILIKE pattern.
  const term = query
    .slice(0, MAX_QUERY_LENGTH)
    .replace(/[^A-Za-z0-9 _\-/.]/g, "")
    .trim();
  if (term.length < 2) return NextResponse.json([]);
  // Escape the % / _ ILIKE wildcards so the user can't broaden their search
  // to the whole table by sending "%%".
  const escaped = term.replace(/[%_\\]/g, (c) => "\\" + c);

  const supabase = createClient();
  const pattern = `%${escaped}%`;
  const { data, error } = await supabase
    .from("ifs_objects")
    .select("id, description, sece")
    .or(`id.ilike.${pattern},description.ilike.${pattern}`)
    .order("id")
    .limit(RESULT_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: "IFS search failed" },
      { status: 502 }
    );
  }

  // Shape the response to what the autocomplete component expects.
  const results = (data ?? []).map((r) => ({
    id: r.id,
    desc: r.description,
    sece: r.sece,
  }));
  return NextResponse.json(results);
}
