import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const cache = new Map<string, unknown>();

const SYSTEM =
  "You are a search assistant for an IFS Equipment Register of an offshore " +
  "semisubmersible. 9276 objects with Object ID, Description, and SECE flag " +
  "(Safety Environmental Critical Element). Return up to 20 matches as a JSON " +
  'array: [{"id":"...","desc":"...","sece":true}]. Match by ID or description ' +
  "keywords. Return ONLY the JSON array, no other text.";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { query } = (await request.json()) as { query?: string };
  if (!query || query.length < 2) return NextResponse.json([]);

  const key = query.toUpperCase();
  if (cache.has(key)) return NextResponse.json(cache.get(key));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content: "Search: " + query }],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const clean = text.replace(/```json|```/g, "").trim();
    let results: unknown = [];
    try {
      const parsed = JSON.parse(clean);
      results = Array.isArray(parsed) ? parsed : [];
    } catch {
      results = [];
    }
    cache.set(key, results);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json(
      { error: "IFS search request failed" },
      { status: 502 }
    );
  }
}
