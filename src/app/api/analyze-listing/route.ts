import { NextRequest } from "next/server";

const SYSTEM_PROMPT = `You are an expert youth sports equipment analyst for a peer-to-peer marketplace in DFW Texas. Analyze photos of sports gear and return accurate, helpful JSON. Be conservative with condition grading. Consider the DFW Texas resale market for pricing. Common items: baseball gloves, bats, cleats, helmets, soccer balls, shin guards, basketball shoes, lacrosse sticks, hockey gear, volleyball gear. Always return valid JSON only - no markdown, no explanation, just the JSON object.`;

const USER_PROMPT = `Analyze these photos of sports equipment.
Return ONLY this JSON structure with no other text:
{
  "item": "descriptive item name",
  "brand": "brand name or Unknown",
  "model": "model name or Unknown",
  "sport": "Baseball|Softball|Soccer|Basketball|Football|Lacrosse|Hockey|Volleyball|Tennis|Other",
  "category": "Glove|Bat|Cleats|Helmet|Ball|Shin Guards|Stick|Pads|Shoes|Jersey|Bag|Other",
  "condition": "like_new|good|fair|poor",
  "conditionNotes": "specific observations about condition",
  "ageRange": "e.g. 7-10 years",
  "ageMin": 7,
  "ageMax": 10,
  "size": "specific size if visible",
  "suggestedPrice": 45,
  "priceRange": { "min": 35, "max": 55 },
  "description": "Ready-to-publish 2-3 sentence listing description",
  "confidence": 0.85,
  "photoQualityScore": 0.8,
  "photoQualityNotes": "feedback for seller"
}`;

type SupportedMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function toImageBlock(img: string) {
  const match = img.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  const media_type: SupportedMediaType = (match?.[1] as SupportedMediaType) ?? "image/jpeg";
  const data = match ? match[2] : img;
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type, data },
  };
}

function stripFences(text: string): string {
  return text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, "$1").trim();
}

const REQUIRED_FIELDS = [
  "item", "sport", "category", "condition", "suggestedPrice",
  "description", "confidence",
] as const;

export async function POST(request: NextRequest) {
  const { images } = await request.json();

  if (!images || !Array.isArray(images) || images.length === 0) {
    return Response.json({ error: "At least one image is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI analysis not configured" }, { status: 500 });
  }

  const imageContent = images.map(toImageBlock);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [...imageContent, { type: "text", text: USER_PROMPT }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Anthropic API error:", errorBody);
      return Response.json({ error: "AI analysis unavailable" }, { status: 502 });
    }

    const data = await response.json();
    const rawText: string = data.content?.[0]?.text ?? "";
    const cleaned = stripFences(rawText);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "Could not parse AI response" }, { status: 500 });
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch {
      return Response.json({ error: "Could not parse AI response" }, { status: 500 });
    }

    for (const field of REQUIRED_FIELDS) {
      if (analysis[field] === undefined || analysis[field] === null) {
        return Response.json(
          { error: "AI analysis incomplete. Please retake photos with the item clearly visible." },
          { status: 422 }
        );
      }
    }

    if (typeof analysis.confidence === "number" && analysis.confidence < 0.4) {
      return Response.json(
        {
          error: "Could not identify item clearly. Please retake photos in better lighting with the item clearly visible.",
          analysis,
        },
        { status: 422 }
      );
    }

    return Response.json(analysis);
  } catch (err) {
    console.error("AI analysis error:", err);
    return Response.json({ error: "AI analysis failed" }, { status: 500 });
  }
}
