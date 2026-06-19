// Gemini-only AI client for vision + text proxies. Free-tier friendly;
// configure with GEMINI_API_KEY (and optionally GEMINI_MODEL).

export type AiMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

// Subset of OpenAPI 3.0 schema accepted by Gemini's responseSchema. Kept
// loose so callers can pass whatever the API supports without us
// reverse-engineering the full grammar here.
export type AiJsonSchema = {
  type:
    | "object"
    | "array"
    | "string"
    | "integer"
    | "number"
    | "boolean";
  properties?: Record<string, AiJsonSchema>;
  required?: string[];
  enum?: Array<string | number>;
  items?: AiJsonSchema;
  minimum?: number;
  maximum?: number;
  description?: string;
  propertyOrdering?: string[];
};

export interface AiRequest {
  system: string;
  userText: string;
  maxTokens: number;
  json?: boolean;
  // When set with json:true, Gemini is required to emit JSON matching this
  // schema — keys with required: [...] cannot be omitted, types are
  // enforced. Massively reduces "the model ignored half the fields" bugs.
  jsonSchema?: AiJsonSchema;
  image?: { base64: string; mediaType: AiMediaType };
}

export function aiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

interface GeminiPart {
  text?: string;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}
type GeminiReqPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

// Returns the model's raw text output. Throws on transport failure.
export async function aiGenerate(req: AiRequest): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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
      // 2.5-flash enables "thinking" by default and burns the token budget
      // on reasoning before emitting output — for our structured triage we
      // just want the JSON, so disable it.
      thinkingConfig: { thinkingBudget: 0 },
      ...(req.json ? { responseMimeType: "application/json" } : {}),
      ...(req.jsonSchema ? { responseSchema: req.jsonSchema } : {}),
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
      `Gemini ${res.status} (model=${model}): ${detail.slice(0, 1000)}`
    );
  }
  const data = (await res.json()) as GeminiResponse;
  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
}
