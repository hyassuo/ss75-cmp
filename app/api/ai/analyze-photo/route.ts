import { NextResponse } from "next/server";
import { readJson, requireUser, sameOrigin } from "@/lib/supabase/adminGuard";
import { rateLimitShared } from "@/lib/utils/rateLimit";
import { FREQUENCIES } from "@/lib/utils/constants";
import {
  ACTIONS,
  CORROSION_TYPES,
  sanitizeAnalysis,
} from "@/lib/ai/sanitize";
import {
  aiGenerate,
  aiConfigured,
  type AiJsonSchema,
  type AiMediaType,
} from "@/lib/ai/client";

// Forces Gemini to emit every field in the exact type/range we expect.
// Without this, prob/cons/inspectionFrequency were occasionally omitted
// and the UI showed empty pickers.
const RESPONSE_SCHEMA: AiJsonSchema = {
  type: "object",
  required: [
    "corrosionType",
    "componentName",
    "probability",
    "consequence",
    "affectedAreaPct",
    "pitDepthEstMM",
    "immediateAction",
    "inspectionFrequency",
    "findings",
    "recommendation",
  ],
  propertyOrdering: [
    "corrosionType",
    "componentName",
    "probability",
    "consequence",
    "affectedAreaPct",
    "pitDepthEstMM",
    "immediateAction",
    "inspectionFrequency",
    "findings",
    "recommendation",
  ],
  properties: {
    corrosionType: {
      type: "string",
      enum: CORROSION_TYPES,
    },
    componentName: { type: "string" },
    probability: { type: "integer", minimum: 1, maximum: 5 },
    consequence: { type: "integer", minimum: 1, maximum: 5 },
    affectedAreaPct: { type: "number", minimum: 0, maximum: 100 },
    pitDepthEstMM: { type: "number", minimum: 0 },
    immediateAction: {
      type: "string",
      enum: ACTIONS,
    },
    inspectionFrequency: {
      type: "string",
      enum: [...FREQUENCIES],
    },
    findings: { type: "string" },
    recommendation: { type: "string" },
  },
};

export const runtime = "nodejs";

// 10 MB file -> ~13.7 MB base64 (matches the storage bucket limit).
const MAX_BASE64_LENGTH = 14_000_000;
// Vision calls are expensive; cap per admin per minute.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
// Daily quotas (UTC days) on top of the per-minute burst limit: one person
// can't spend the project's Gemini quota, and the whole app has a ceiling.
const DAILY_PER_USER = 60;
const DAILY_TOTAL = 500;
const DAY_MS = 86_400_000;

const SYSTEM = [
  "You are a corrosion assessment expert for offshore drilling units.",
  "Analyse the photo and return ONLY a JSON object (no markdown, no preamble)",
  "with these exact fields:",
  "- corrosionType: one of Galvanic, Atmospheric, Pitting, Crevice, MIC,",
  "  Erosion-Corrosion, Uniform, Unknown.",
  "- componentName: 1-3 word identifier of the item shown, e.g. Handrail,",
  "  Pipeline, Flange, Valve, Bolt, Walkway grating, Beam, Bracket. Use",
  "  Unknown if you cannot tell.",
  "- probability: integer 1-5 on the unit risk matrix:",
  "  1 = Never occurred in the Industry,",
  "  2 = Has occurred in the Industry,",
  "  3 = Has occurred in the Company,",
  "  4 = Multiple occurrences per year in the Company,",
  "  5 = Multiple occurrences per year at the Facility.",
  "  Choose based on how common this corrosion mode + extent is on offshore",
  "  rigs. Atmospheric corrosion on external steel is typically 4-5. Pitting",
  "  on internal piping is typically 3-4. Exotic failures are 1-2.",
  "- consequence: integer 1-5 on the unit risk matrix:",
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
  "Never invent a severity field: priority is computed downstream from",
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
  // Admins and inspectors only: viewers can't record evidence, so they have
  // no reason to call the model (the UI hides the button from them too).
  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (guard.ctx.role !== "admin" && guard.ctx.role !== "inspector") {
    return NextResponse.json(
      { error: "Photo analysis is available to admins and inspectors." },
      { status: 403 }
    );
  }

  const rl = await rateLimitShared(
    `photo:${guard.ctx.userId}`,
    RATE_LIMIT,
    RATE_WINDOW_MS
  );
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

  const body = await readJson<{ base64?: string; mediaType?: string }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { base64, mediaType } = body;
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

  // Daily quotas, counted only for a request that will reach the model (a
  // missing key, bad body or oversize image doesn't spend them). The
  // per-user quota goes first so a user over it doesn't eat the app-wide
  // one; the reverse (a user's count rising while only the app-wide quota
  // refuses) is accepted: it lasts at most until midnight UTC.
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const mine = await rateLimitShared(
    `photo-day:${guard.ctx.userId}:${day}`,
    DAILY_PER_USER,
    DAY_MS
  );
  const all = mine.allowed
    ? await rateLimitShared(`photo-day:all:${day}`, DAILY_TOTAL, DAY_MS)
    : mine;
  if (!all.allowed) {
    // The keys carry the UTC date, so the quota reopens at the next UTC
    // midnight, whatever the counter's own window says.
    const nextMidnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1
    );
    const retryAfter = Math.max(1, Math.ceil((nextMidnight - now.getTime()) / 1000));
    return NextResponse.json(
      { error: "Daily photo-analysis limit reached. Try again tomorrow." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  try {
    const text = await aiGenerate({
      system: SYSTEM,
      userText:
        "Analyse this corrosion photo from an offshore semisubmersible drilling unit.",
      maxTokens: 1200,
      json: true,
      jsonSchema: RESPONSE_SCHEMA,
      image: { base64, mediaType: media },
    });
    const clean = text.replace(/```json|```/g, "").trim();
    try {
      const sanitized = sanitizeAnalysis(JSON.parse(clean));
      if (!sanitized) {
        console.error(
          "[ai/analyze-photo] schema violation:",
          clean.slice(0, 1000)
        );
        return NextResponse.json(
          { error: "AI returned invalid data. Please try again." },
          { status: 502 }
        );
      }
      return NextResponse.json(sanitized);
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
