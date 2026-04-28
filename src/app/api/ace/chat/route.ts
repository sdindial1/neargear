import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  checkUserLimit,
  checkDailyLimit,
  incrementCounters,
} from "@/lib/ace-rate-limit";
import { sanitizeText, LIMITS } from "@/lib/sanitize";

interface AceContext {
  page?: string;
  user?: { firstName?: string; city?: string | null; zipcode?: string | null };
  listing?: {
    title: string;
    sport: string;
    condition: string;
    price: number;
    retailPrice: number | null;
    description: string | null;
    sellerCity: string | null;
  };
  meetup?: {
    status: string;
    date: string | null;
    timeWindow: string | null;
    location: string | null;
    offeredPrice: number | null;
  };
}

const BASE_PROMPT = `You are Ace, NearGear's AI assistant. NearGear is a youth sports gear marketplace in Dallas-Fort Worth where parents buy and sell used gear for their kids.

Your personality:
- Friendly, warm, parent-to-parent tone
- Knowledgeable about youth sports gear
- Helpful and encouraging
- Brief and conversational (2-4 sentences max per response unless explaining something complex)
- Use emojis sparingly but naturally
- Never use corporate marketing speak

What you help with:
- Gear sizing by sport and age
- Fair pricing for used gear
- How NearGear transactions work
- Photo tips for better listings
- Safe meetup advice
- General youth sports gear knowledge

Sport-specific sizing knowledge:
- Baseball/softball gloves: kids wear them slightly oversized; shift the age range DOWN 1-2 years from nominal fit
- Soccer cleats: match shoe size closely
- Baseball bats: sized by height/weight
- Football helmets: measure head circumference
- Basketball shoes: true to size

Pricing guidelines (% of retail):
- Like New: 70-80%
- Good: 50-65%
- Fair: 30-45%
- Poor: 15-25%

Keep responses conversational and helpful. If you don't know something specific, say so honestly and suggest next steps. Never make up prices or specific product details you're not sure about.`;

function buildContextBlock(ctx: AceContext): string {
  const lines: string[] = ["", "Current user context:"];
  if (ctx.user?.firstName) {
    lines.push(`- User: ${ctx.user.firstName}${ctx.user.city ? ` in ${ctx.user.city}` : ""}${ctx.user.zipcode ? ` (${ctx.user.zipcode})` : ""}`);
  }
  if (ctx.page) lines.push(`- Currently viewing: ${ctx.page} page`);
  if (ctx.listing) {
    const priceDollars = (ctx.listing.price / 100).toFixed(2);
    const retailDollars =
      ctx.listing.retailPrice != null
        ? `$${(ctx.listing.retailPrice / 100).toFixed(2)}`
        : "unknown";
    lines.push(
      `- Listing: "${ctx.listing.title}" — ${ctx.listing.sport}, ${ctx.listing.condition}, asking $${priceDollars}, retail ${retailDollars}${ctx.listing.sellerCity ? `, seller in ${ctx.listing.sellerCity}` : ""}.`,
    );
    if (ctx.listing.description) {
      lines.push(`  Description: ${ctx.listing.description.slice(0, 200)}`);
    }
  }
  if (ctx.meetup) {
    const offer =
      ctx.meetup.offeredPrice != null
        ? `$${(ctx.meetup.offeredPrice / 100).toFixed(2)}`
        : "unknown";
    lines.push(
      `- Meetup: status ${ctx.meetup.status}, ${ctx.meetup.date ?? "date TBD"} ${ctx.meetup.timeWindow ?? ""}, at ${ctx.meetup.location ?? "TBD"}, offered ${offer}.`,
    );
  }
  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json(
        { error: "auth_required", message: "Sign in to chat with Ace" },
        { status: 401 },
      );
    }

    const dailyCheck = checkDailyLimit();
    if (!dailyCheck.allowed) {
      return Response.json(
        {
          error: "daily_cap",
          message:
            "Ace is taking a break for today and will be back tomorrow! 🌙 In the meantime check out our Help section for common questions.",
        },
        { status: 429 },
      );
    }

    const userCheck = checkUserLimit(user.id);
    if (!userCheck.allowed) {
      return Response.json(
        {
          error: "rate_limit",
          message:
            "You've been busy! Ace needs a quick breather — try again in an hour 😊",
        },
        { status: 429 },
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Ace not configured" },
        { status: 500 },
      );
    }

    let body: {
      message?: string;
      conversationHistory?: Array<{
        role: "user" | "assistant";
        content: string;
      }>;
      context?: AceContext;
    };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Bad request" }, { status: 400 });
    }

    if (!body.message || typeof body.message !== "string") {
      return Response.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    const cleanMessage = sanitizeText(body.message, LIMITS.ACE_MESSAGE);
    if (!cleanMessage) {
      return Response.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    const history = (body.conversationHistory ?? [])
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string",
      )
      .map((m) => ({
        role: m.role,
        content: sanitizeText(m.content, LIMITS.ACE_MESSAGE),
      }));

    const messages = [
      ...history.slice(-12),
      { role: "user" as const, content: cleanMessage },
    ];

    const system = `${BASE_PROMPT}\n${buildContextBlock(body.context ?? {})}`;

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 500,
        system,
        messages,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      console.error(
        "[ace] anthropic error",
        upstream.status,
        text.slice(0, 500),
      );
      return Response.json(
        { error: "Ace upstream error" },
        { status: 502 },
      );
    }

    incrementCounters(user.id);

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[ace] unexpected error", err);
    Sentry.captureException(err);
    return Response.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
