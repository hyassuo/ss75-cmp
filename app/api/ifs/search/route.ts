import { NextResponse } from "next/server";
import { requireUser, sameOrigin } from "@/lib/supabase/adminGuard";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/utils/rateLimit";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 80;
const RESULT_LIMIT = 25;
// Fetch a wider candidate set, then rank by relevance and trim. With multi
// word AND filters the candidate count drops naturally, so 500 keeps even
// a single-word "pump" query from being clipped before ranking.
const CANDIDATE_LIMIT = 500;
// Each query is an ILIKE scan over ~11k rows; the UI debounces to ~1 req per
// keystroke pause, so a real user stays well under this. The cap only bites
// a scripted client hammering the endpoint.
const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const rl = rateLimit(`ifs:${guard.ctx.userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
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

  // Split into space-separated tokens, escape ILIKE wildcards, drop tokens
  // shorter than 2 characters to avoid expanding the search to half the
  // table. "fire pump" → ["fire", "pump"]; each token must appear in id
  // OR description, regardless of order.
  const tokens = term
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/[%_\\]/g, (c) => "\\" + c));
  if (tokens.length === 0) return NextResponse.json([]);

  const supabase = await createClient();
  let q = supabase.from("ifs_objects").select("id, description, sece");
  // Each .or() call AND-joins with the previous filters, so chaining one
  // per token produces (id ILIKE %A% OR desc ILIKE %A%) AND
  //                    (id ILIKE %B% OR desc ILIKE %B%) ...
  for (const tok of tokens) {
    const pattern = `%${tok}%`;
    q = q.or(`id.ilike.${pattern},description.ilike.${pattern}`);
  }
  const { data, error } = await q.limit(CANDIDATE_LIMIT);

  if (error) {
    return NextResponse.json({ error: "IFS search failed" }, { status: 502 });
  }

  // Rank candidates so the most likely match floats to the top.
  // Single-token: prefer exact / startsWith hits in id or description.
  // Multi-token: prefer rows where the full phrase appears as a substring
  // (whitespace-joined), then shorter descriptions as a specificity proxy.
  const lc = (s: string) => s.toLowerCase();
  const joined = lc(tokens.join(" "));
  const single = tokens.length === 1 ? lc(tokens[0]) : null;

  const score = (row: { id: string; description: string }) => {
    const id = lc(row.id);
    const desc = lc(row.description);
    if (single) {
      if (id === single) return 0;
      if (id.startsWith(single)) return 1;
      if (desc.startsWith(single)) return 2;
      if (id.includes(single)) return 3;
      return 4;
    }
    // Multi-token: phrase appears intact → top; otherwise rely on length.
    if (desc.includes(joined) || id.includes(joined)) return 0;
    return 1;
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
