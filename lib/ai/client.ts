// Single AI abstraction for the vision + text proxies.
//
// Provider is chosen by env (the user never sees which one):
//   AI_PROVIDER=gemini|anthropic   — explicit override
//   otherwise: Gemini if GEMINI_API_KEY is set, else Anthropic.
// Default is Gemini (free tier). Anthropic stays available as a fallback.
import Anthropic from "@anthropic-ai/sdk";

type Provider = "gemini" | "anthropic";

export type AiMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

export interface AiRequest {
  system: string;
  userText: string;
  maxTokens: number;
  json?: boolean;
  image?: { base64: string; mediaType: AiMediaType };
}

export function aiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

function selectProvider(): Provider {
  const p = process.env.AI_PROVIDER?.toLowerCase();
  if (p === "anthropic") return "anthropic";
  if (p === "gemini") return "gemini";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "anthropic";
}

// Returns the model's raw text output. Throws on transport failure.
// If the primary provider fails and the other provider's key is configured,
// fall back to it transparently — keeps the user moving when Gemini's free
// tier hits its quota.
export async function aiGenerate(req: AiRequest): Promise<string> {
  const primary = selectProvider();
  try {
    return primary === "gemini" ? await viaGemini(req) : await viaAnthropic(req);
  } catch (e) {
    const haveAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const haveGemini = Boolean(process.env.GEMINI_API_KEY);
    if (primary === "gemini" && haveAnthropic) {
      console.warn("[ai] gemini failed, falling back to anthropic:", e);
      return viaAnthropic(req);
    }
    if (primary === "anthropic" && haveGemini) {
      console.warn("[ai] anthropic failed, falling back to gemini:", e);
      return viaGemini(req);
    }
    throw e;
  }
}

// ── Gemini (Google AI Studio, free tier) ────────────────────────────────────
interface GeminiPart {
  text?: string;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}
type GeminiReqPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

async function viaGemini(req: AiRequest): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const parts: GeminiReqPart[] = [];
  if (req.image) {
    parts.push({
      inline_data: { mime_type: req.image.mediaType, data: req.image.base64 },
    });
  }
  parts.push({ text: req.userText });

  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      maxOutputTokens: req.maxTokens,
      temperature: 0,
      ...(req.json ? { responseMimeType: "application/json" } : {}),
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Gemini ${res.status} (model=${model}): ${detail.slice(0, 300)}`
    );
  }
  const data = (await res.json()) as GeminiResponse;
  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
}

// ── Anthropic (fallback) ─────────────────────────────────────────────────────
async function viaAnthropic(req: AiRequest): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey: key });

  const content: Anthropic.ContentBlockParam[] = [];
  if (req.image) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: req.image.mediaType,
        data: req.image.base64,
      },
    });
  }
  content.push({ type: "text", text: req.userText });

  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: "user", content }],
  });
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
}
