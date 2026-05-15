import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json(
      { error: "AI analysis is admin-only" },
      { status: 403 }
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
