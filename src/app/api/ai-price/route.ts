import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const { sport, category, condition, brand } = await request.json();

  if (!sport || !category || !condition) {
    return Response.json(
      { error: "sport, category, and condition are required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI pricing not configured" }, { status: 500 });
  }

  const prompt = `You are a sports gear pricing expert. Based on the DFW Texas used sports equipment market, suggest a fair resale price range for: Sport: ${sport}, Category: ${category}, Condition: ${condition}${brand ? `, Brand: ${brand}` : ""}. Return ONLY valid JSON (no markdown): { "min": number, "max": number, "suggested": number, "reasoning": "string" }. Prices in USD.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic API error:", await response.text());
      return Response.json({ error: "AI pricing unavailable" }, { status: 502 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "Could not parse AI response" }, { status: 500 });
    }

    return Response.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error("AI price error:", err);
    return Response.json({ error: "AI pricing unavailable" }, { status: 500 });
  }
}
