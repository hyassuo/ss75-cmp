import { NextResponse } from "next/server";
import { requireUser, sameOrigin } from "@/lib/supabase/adminGuard";
import { rateLimit } from "@/lib/utils/rateLimit";
import { aiGenerate, aiConfigured, type AiMediaType } from "@/lib/ai/client";

export const runtime = "nodejs";

// 10 MB file -> ~13.7 MB base64 (matches the storage bucket limit).
const MAX_BASE64_LENGTH = 14_000_000;
// Vision calls are expensive; cap per admin per minute.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

const SYSTEM = [
  "You are a corrosion assessment expert for offshore drilling units.",
  "Analyse the photo and return ONLY a JSON object (no markdown, no preamble)",
  "with these exact fields:",
  "- corrosionType: one of Galvanic, Atmospheric, Pitting, Crevice, MIC,",
  "  Erosion-Corrosion, Uniform, Unknown.",
  "- componentName: 1-3 word identifier of the item shown, e.g. Handrail,",
  "  Pipeline, Flange, Valve, Bolt, Walkway grating, Beam, Bracket. Use",
  "  Unknown if you cannot tell.",
  "- probability: integer 1-5 on the unit risk matrix —",
  "  1 = Never occurred in the Industry,",
  "  2 = Has occurred in the Industry,",
  "  3 = Has occurred in the Company,",
  "  4 = Multiple occurrences per year in the Company,",
  "  5 = Multiple occurrences per year at the Facility.",
  "  Choose based on how common this corrosion mode + extent is on offshore",
  "  rigs. Atmospheric corrosion on external steel is typically 4-5. Pitting",
  "  on internal piping is typically 3-4. Exotic failures are 1-2.",
  "- consequence: integer 1-5 on the unit risk matrix —",
  "  1 = Insignificant, 2 = Minor, 3 = Moderate, 4 = Serious, 5 = Critical.",
  "  Choose based on what the affected item likely is. A handrail or",
  "  walkway is 2-3. A pressure-containing component, lifting equipment or",
  "  safety-critical element is 4-5. Decorative or non-load-bearing is 1-2.",
  "  If you cannot identify the component, default to 3.",
  "- affectedAreaPct: number 0-100 (visible affected area).",
  "- pitDepthEstMM: number, 0 if not pitting.",
  "- immediateAction: one of Monitor, Inspect Closely, Treat Soon,",
  "  Urgent Treatment Required.",
  "- inspectionFrequency: recommended re-inspection cadence, EXACTLY one of:",
  "  Weekly, Monthly, Quarterly, Semi-annual, Annual, Every 2 years,",
  "  Every 2.5 years, Every 5 years, Per operation, As required. Pick a",
  "  shorter interval for advanced or fast-growing corrosion on critical",
  "  items, longer for minor cosmetic atmospheric attack.",
  "- findings: 2-3 sentence description of what you see.",
  "- recommendation: 1-2 sentence next step.",
  "Never invent a severity field — priority is computed downstream from",
  "probability × consequence.",
].join(" ");

const ALLOWED: AiMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Free Gemini tier removed the cost rationale for admin-only access;
  // any active authenticated user (rate-limited below) may analyse a photo.
  const guard = await requireUser();
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

  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI provider not configured" },
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
  const media: AiMediaType = ALLOWED.includes(mediaType as AiMediaType)
    ? (mediaType as AiMediaType)
    : "image/jpeg";

  try {
    const text = await aiGenerate({
      system: SYSTEM,
      userText:
        "Analyse this corrosion photo from an offshore semisubmersible drilling unit.",
      maxTokens: 600,
      json: true,
      image: { base64, mediaType: media },
    });
    const clean = text.replace(/```json|```/g, "").trim();
    try {
      return NextResponse.json(JSON.parse(clean));
    } catch {
      // Full raw output to server logs only; clients get a generic message.
      console.error("[ai/analyze-photo] parse failed:", clean.slice(0, 1000));
      return NextResponse.json(
        { error: "Could not parse AI response. Please try again." },
        { status: 502 }
      );
    }
  } catch (e) {
    // Log the full upstream reason (quota, model, key) to Vercel for
    // diagnostics, but don't echo provider internals back to the client.
    console.error("[ai/analyze-photo] upstream failed:", e);
    return NextResponse.json(
      { error: "AI analysis is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
