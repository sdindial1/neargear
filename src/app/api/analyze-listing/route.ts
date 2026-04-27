import { NextRequest } from "next/server";

const SYSTEM_PROMPT = `You are an expert youth sports equipment analyst for a peer-to-peer marketplace in DFW Texas. Analyze photos of sports gear and return accurate, helpful JSON.

Be conservative with condition grading.

Age ranges must be narrow (max 3 year spread). Be precise about which ages this gear actually fits — not the full possible range. Parents searching by their child's specific age need accurate matches.

Sport-specific age range guidance:

BASEBALL/SOFTBALL GLOVES:
- Kids wear gloves slightly oversized
- A glove sized for 10-12 year olds typically fits kids 8-11 (they grow into it)
- Shift the age range DOWN by 1-2 years from the nominal fit
- Example: 11-11.5 inch glove → ages 6-9 (not 8-11)
- 12 inch glove → ages 8-11
- 12.5+ inch glove → ages 10-13

BASEBALL/SOFTBALL BATS:
- Sized by length (inches) and drop weight
- 26-27 inch → ages 5-7
- 28-29 inch → ages 7-9
- 30-31 inch → ages 9-11
- 32+ inch → ages 11-14

SOCCER CLEATS:
- Sized by shoe size, narrower age range
- Typically fit 1-2 years
- Example: youth size 2 → ages 7-9

SOCCER BALLS:
- Size 3 (smaller): ages 5-8
- Size 4: ages 8-12
- Size 5 (adult): ages 13+

FOOTBALL HELMETS:
- Youth XS/S: ages 5-8
- Youth M: ages 8-11
- Youth L: ages 11-14

LACROSSE STICKS:
- 37 inch: ages 8-11
- 40 inch: ages 11-14
- 60 inch: ages 14+

BASKETBALL BALLS:
- Size 5: ages 5-8
- Size 6: ages 9-12 (women)
- Size 7: ages 13+ (men)

For any sport, aim for 3-year age ranges that reflect how kids actually use the equipment.

Condition-based pricing guide (DFW market):
- Like New (looks essentially brand new, minimal use): 70-80% of retail price
- Good (normal use, functional, minor wear): 50-65% of retail
- Fair (significant wear but still usable): 30-45% of retail
- Poor (heavily worn, may need repair): 15-25% of retail

For a brand new unused item with tags, price at the HIGH end of Like New (75-80% of retail).

Always include retailPrice — the original retail price (USD) of a similar new item from a major sporting goods retailer. Used to show buyers their savings.

Common items: baseball gloves, bats, cleats, helmets, soccer balls, shin guards, basketball shoes, lacrosse sticks, hockey gear, volleyball gear. Always return valid JSON only - no markdown, no explanation, just the JSON object.`;

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
  "retailPrice": 75,
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

function approxKb(base64OrDataUrl: string): number {
  const commaIdx = base64OrDataUrl.indexOf(",");
  const raw = commaIdx >= 0 ? base64OrDataUrl.slice(commaIdx + 1) : base64OrDataUrl;
  return Math.round((raw.length * 3) / 4 / 1024);
}

export async function POST(request: NextRequest) {
  const { images } = await request.json();

  if (!images || !Array.isArray(images) || images.length === 0) {
    console.log("[analyze] no images in body");
    return Response.json({ error: "At least one image is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[analyze] ANTHROPIC_API_KEY missing in env");
    return Response.json({ error: "AI analysis not configured" }, { status: 500 });
  }

  const sizes = images.map(approxKb);
  const totalKb = sizes.reduce((a: number, b: number) => a + b, 0);
  console.log(
    `[analyze] ${images.length} image(s); sizes KB = [${sizes.join(", ")}]; total ~${totalKb} KB`,
  );

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

    console.log(`[analyze] anthropic status ${response.status} ok=${response.ok}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.log(`[analyze] anthropic error body: ${errorBody.slice(0, 800)}`);
      return Response.json(
        { error: "AI analysis unavailable", upstreamStatus: response.status },
        { status: 502 },
      );
    }

    const data = await response.json();
    const rawText: string = data.content?.[0]?.text ?? "";
    console.log(`[analyze] raw first 500 chars: ${rawText.slice(0, 500)}`);

    const cleaned = stripFences(rawText);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("[analyze] no JSON object found in response");
      return Response.json({ error: "Could not parse AI response" }, { status: 500 });
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.log("[analyze] JSON.parse failed:", parseErr);
      console.log("[analyze] offending text:", jsonMatch[0].slice(0, 500));
      return Response.json({ error: "Could not parse AI response" }, { status: 500 });
    }

    for (const field of REQUIRED_FIELDS) {
      if (analysis[field] === undefined || analysis[field] === null) {
        console.log(`[analyze] required field missing: ${field}`);
        return Response.json(
          { error: "AI analysis incomplete. Please retake photos with the item clearly visible." },
          { status: 422 },
        );
      }
    }

    if (typeof analysis.confidence === "number" && analysis.confidence < 0.4) {
      console.log(`[analyze] low confidence ${analysis.confidence}`);
      return Response.json(
        {
          error: "Could not identify item clearly. Please retake photos in better lighting with the item clearly visible.",
          analysis,
        },
        { status: 422 },
      );
    }

    console.log(
      `[analyze] success — item=${analysis.item} confidence=${analysis.confidence}`,
    );
    return Response.json(analysis);
  } catch (err) {
    console.log("[analyze] unexpected error:", err);
    return Response.json({ error: "AI analysis failed" }, { status: 500 });
  }
}
