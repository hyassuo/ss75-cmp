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
  // PostgREST .or() takes a comma-separated filter list, so commas/parens in
  // the user input would break the filter syntax — strip them.
  const term = query.slice(0, MAX_QUERY_LENGTH).replace(/[,()]/g, "");
  if (term.length < 2) return NextResponse.json([]);

  const supabase = createClient();
  // Match against id OR description, case-insensitive substring. Indexed by
  // pg_trgm so it's well under 50ms across 11k+ rows.
  const pattern = `%${term}%`;
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
