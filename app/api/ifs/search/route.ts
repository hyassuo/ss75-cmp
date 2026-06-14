import { NextResponse } from "next/server";
import { requireUser, sameOrigin } from "@/lib/supabase/adminGuard";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 80;
const RESULT_LIMIT = 25;
// Fetch a wider candidate set, then rank by relevance and trim to
// RESULT_LIMIT so the most likely matches always surface first.
const CANDIDATE_LIMIT = 200;

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
    .limit(CANDIDATE_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: "IFS search failed" },
      { status: 502 }
    );
  }

  // Rank: exact id match > id startsWith > description startsWith >
  // description contains (with shorter descriptions favoured as more
  // specific). Without this, ORDER BY id alone buries obvious hits.
  const lcTerm = escaped.toLowerCase();
  const score = (row: { id: string; description: string }) => {
    const id = row.id.toLowerCase();
    const desc = row.description.toLowerCase();
    if (id === lcTerm) return 0;
    if (id.startsWith(lcTerm)) return 1;
    if (desc.startsWith(lcTerm)) return 2;
    if (id.includes(lcTerm)) return 3;
    return 4;
  };
  const ranked = (data ?? [])
    .map((r) => ({ r, s: score(r) }))
    .sort(
      (a, b) =>
        a.s - b.s ||
        a.r.description.length - b.r.description.length ||
        a.r.id.localeCompare(b.r.id)
    )
    .slice(0, RESULT_LIMIT)
    .map((x) => x.r);

  const results = ranked.map((r) => ({
    id: r.id,
    desc: r.description,
    sece: r.sece,
  }));
  return NextResponse.json(results);
}
