import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/supabase/adminGuard";
import { rateLimit } from "@/lib/utils/rateLimit";

// 10 MB file -> ~13.7 MB base64 (matches the storage bucket limit).
const MAX_BASE64_LENGTH = 14_000_000;
// Vision calls are expensive; cap per admin per minute.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

const SYSTEM =
  "You are a corrosion assessment expert for offshore drilling units. " +
  "Analyze the provided photo and return a JSON object with these exact " +
  "fields: corrosionType (string: one of Galvanic, Atmospheric, Pitting, " +
  "Crevice, MIC, Erosion-Corrosion, Uniform, Unknown), severity (string: one " +
  "of Low, Moderate, High, Critical), affectedAreaPct (number 0-100), " +
  "pitDepthEstMM (number, 0 if not pitting), immediateAction (string: one of " +
  "Monitor, Inspect Closely, Treat Soon, Urgent Treatment Required), findings " +
  "(string: 2-3 sentence description), recommendation (string: 1-2 sentence " +
  "next step). Return ONLY the JSON object, no markdown, no preamble.";

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const rl = rateLimit(`photo:${guard.ctx.userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  const { base64, mediaType } = (await request.json()) as {
    base64?: string;
    mediaType?: string;
  };
  if (!base64) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }
  if (base64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json(
      { error: "Image too large (max 10 MB)" },
      { status: 413 }
    );
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 600,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: (mediaType as MediaType) || "image/jpeg",
                data: base64,
              },
            },
            {
              type: "text",
              text: "Analyse this corrosion photo from an offshore semisubmersible drilling unit.",
            },
          ],
        },
      ],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const clean = text.replace(/```json|```/g, "").trim();
    try {
      return NextResponse.json(JSON.parse(clean));
    } catch {
      return NextResponse.json(
        { error: "Could not parse AI response." },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "AI analysis request failed." },
      { status: 502 }
    );
  }
}
