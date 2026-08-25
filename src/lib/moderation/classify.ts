/**
 * Listing moderation — one classifier, two call sites.
 *
 * `/api/analyze-listing` calls it for an instant advisory warning in the sell
 * flow; `POST /api/listings` calls it for the authoritative publish decision.
 * The advisory pass is UX only and is never trusted: a seller can edit the
 * title after analysis, and a client-supplied verdict is forgeable, so the
 * publish route re-runs this against the final text and the stored photos.
 *
 * THE GATE IS DELIBERATELY NARROW. There is one admin. If ordinary sports gear
 * queues, the queue becomes the bottleneck the moment ads start and the spend
 * is wasted. Four things hold the review rate down:
 *
 *   1. The default is allow. `review` requires a SPECIFIC trigger, never
 *      general uncertainty. Not knowing whether a glove is Baseball or
 *      Softball is not a policy question and must never queue anything.
 *   2. A deterministic prescreen runs first, with no API call. The
 *      unambiguous cases (weapons, adult) are blocked in pure code, so they
 *      cost nothing and never reach the queue.
 *   3. Hard-blocks do not queue. They are refused outright.
 *   4. It fails OPEN. An Anthropic timeout publishes the listing and records
 *      verdict "error" for retroactive sweep, rather than queueing everything
 *      during ad spend. The prescreen still ran, so a model outage cannot let
 *      through what the keyword pass already catches.
 */

export type ModerationVerdict = "allow" | "review" | "block" | "error";
export type ModerationSource = "prescreen" | "model";

export interface ModerationResult {
  verdict: ModerationVerdict;
  /** Machine-readable trigger codes, stored on the listing and the event row. */
  reasons: string[];
  confidence: number | null;
  source: ModerationSource;
  model: string | null;
  /** What the seller is shown. Never a raw model string. */
  sellerMessage: string;
  /** True when the item is a trading card — suppresses the AI Verified badge. */
  isTradingCard: boolean;
}

export interface ClassifyInput {
  title: string;
  description: string;
  sport: string;
  category: string;
  /** Dollars, not cents — the caller converts. */
  priceDollars: number;
  /** Base64 data URLs or https URLs. The publish route passes stored URLs. */
  images: string[];
}

/**
 * Raw ungraded cards are capped here. Above it, a card goes to review rather
 * than being refused, so a legitimate high-value card can still be approved by
 * hand — we just never publish one automatically.
 */
export const CARD_VALUE_CAP_DOLLARS = 100;

export const MODERATION_MODEL = "claude-opus-5";

// ---------------------------------------------------------------------------
// Deterministic prescreen
//
// Word-boundary matched against title + description. These are the cases where
// a model adds nothing: if someone writes "Glock", no amount of nuance changes
// the answer. Kept narrow on purpose -- every false positive here is a seller
// refused with no recourse, so ambiguous words ("shot", "piece", "arms") are
// deliberately absent.
// ---------------------------------------------------------------------------
const WEAPON_TERMS =
  /\b(gun|guns|firearm|handgun|pistol|revolver|rifle|shotgun|glock|ammo|ammunition|bullets|magazine clip|silencer|suppressor|switchblade|butterfly knife|brass knuckles|taser|stun gun|pepper spray|crossbow|bb gun|airsoft|pellet gun|ghost gun)\b/i;

const ADULT_TERMS =
  /\b(porn|pornographic|nude|nudes|nsfw|escort|sex toy|sextoy|fleshlight|dildo|vibrator|lingerie|onlyfans|adult video|xxx)\b/i;

const CONTROLLED_TERMS =
  /\b(weed|marijuana|cannabis|thc|edibles|vape|vapes|e-cig|nicotine|cigarettes|alcohol|liquor|whiskey|vodka|beer keg|steroids|hgh|adderall|xanax|oxycodone|percocet|prescription pills)\b/i;

/** Card-ness. Brands and explicit phrases only -- a bare "card" is too broad. */
const CARD_TERMS =
  /\b(trading card|sports card|rookie card|card lot|topps|panini|bowman|prizm|donruss|upper deck|fleer|o-pee-chee|refractor|autograph card|numbered card|base set|hobby box|blaster box|card break)\b/i;

/** Grading. The four graders Shaun named, plus the vocabulary that implies one. */
const GRADED_TERMS =
  /\b(psa\s*\d{1,2}|bgs\s*\d{1,2}(\.\d)?|sgc\s*\d{1,2}|cgc\s*\d{1,2}|graded|gem mint|slabbed|slab|pop report|cert(ificate)? number)\b/i;

/**
 * Off-taxonomy items a keyword pass can call confidently. These go to REVIEW,
 * not block -- "iPad stand for filming swings" is a real thing a baseball
 * parent might sell, and refusing it outright would be wrong. The model
 * usually resolves these before the prescreen matters; this is the floor for
 * when the model is down.
 */
const NON_SPORTS_TERMS =
  /\b(iphone|android phone|smartphone|macbook|laptop|desktop pc|ipad|tablet|xbox|playstation|ps4|ps5|nintendo switch|airpods|smartwatch|television|couch|sofa|mattress|dresser|stroller|car seat|crib|handbag|purse|sneakerhead|gift card)\b/i;

interface Prescreen {
  verdict: Exclude<ModerationVerdict, "error"> | null;
  reasons: string[];
  isTradingCard: boolean;
}

/**
 * Pure, synchronous, no network. Returns a verdict only when it is certain;
 * otherwise `verdict: null` and the model decides.
 */
export function prescreen(input: ClassifyInput): Prescreen {
  const blob = `${input.title} ${input.description}`;
  const reasons: string[] = [];

  if (WEAPON_TERMS.test(blob)) reasons.push("weapon");
  if (ADULT_TERMS.test(blob)) reasons.push("adult_content");
  if (CONTROLLED_TERMS.test(blob)) reasons.push("controlled_substance");
  if (reasons.length) {
    return { verdict: "block", reasons, isTradingCard: false };
  }

  const isTradingCard =
    CARD_TERMS.test(blob) || /\bsports cards?\b/i.test(input.category);

  if (isTradingCard) {
    const cardReasons = ["trading_card"];
    if (GRADED_TERMS.test(blob)) cardReasons.push("graded_card");
    if (input.priceDollars > CARD_VALUE_CAP_DOLLARS) {
      cardReasons.push("card_over_value_cap");
    }
    // Raw and under the cap publishes; the badge is suppressed either way.
    if (cardReasons.length > 1) {
      return { verdict: "review", reasons: cardReasons, isTradingCard: true };
    }
    return { verdict: null, reasons: cardReasons, isTradingCard: true };
  }

  if (NON_SPORTS_TERMS.test(blob)) {
    return { verdict: "review", reasons: ["non_sports_keyword"], isTradingCard: false };
  }

  return { verdict: null, reasons: [], isTradingCard: false };
}

// ---------------------------------------------------------------------------
// Model pass
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the listing policy checker for NearGear, a marketplace for youth sports gear in Dallas-Fort Worth. You decide whether a submitted listing may publish.

ALLOWED — anything sports-related:
- Equipment and gear: bats, gloves, helmets, pads, cleats, sticks, rackets, balls, bags, skates, clubs
- Sports apparel: jerseys, uniforms, team wear, practice gear, cleats, athletic footwear
- Sports-adjacent training equipment: nets, tees, cones, radar guns, pitching machines, agility ladders
- Trading cards and sports collectibles (these are a separate category with their own rules; see below)

NOT ALLOWED — everything else: consumer electronics, furniture, general toys, non-athletic clothing, household goods.

PROHIBITED — refuse outright: weapons of any kind, ammunition, adult or sexual content, controlled substances, alcohol, tobacco or vaping products, prescription medication, stolen goods.

Return one of three verdicts.

"allow" — the item is clearly sports-related and nothing is prohibited. THIS IS THE DEFAULT AND SHOULD BE THE LARGE MAJORITY OF LISTINGS. Choose it even when you are unsure which sport or which category the item belongs to; getting the sport wrong is a cosmetic problem, not a policy one, and must never send a listing to review. A photo that is dim, cluttered, or partially cropped is still an allow as long as you can tell the item is sports gear.

"review" — a human should look. Use ONLY when one of these is true:
- The item is not identifiable as sports-related at all.
- The photo and the written listing describe materially different things — for example the photo shows a phone and the title says "baseball glove". Note this means the SUBJECT is different, not that the details differ. A photo of a Rawlings glove titled "Wilson glove" is an allow; the seller got the brand wrong.
- The item is a trading card that is graded, or priced above $${CARD_VALUE_CAP_DOLLARS}.
- The listing appears to be selling something other than the pictured item (bait and switch), or is a service, rental, or solicitation rather than an item.

"block" — refuse outright. Use ONLY for the PROHIBITED list above. Never use "block" for an item that is merely off-topic; that is "review".

TRADING CARDS: NearGear cannot authenticate or grade cards. Treat any card as a card even if the sport is right. Graded cards (PSA, BGS, SGC, CGC) and cards priced above $${CARD_VALUE_CAP_DOLLARS} always go to "review".

Judge the item, not the listing quality. Bad grammar, a low asking price, a short description, or an amateur photo are never reasons to review or block.`;

/**
 * The verdict shape. Structured outputs remove the JSON-parsing failure mode
 * the older analyze-listing route hand-rolls with fence-stripping and a regex
 * match -- there is no "Could not parse AI response" branch to hit.
 */
const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["allow", "review", "block"] },
    reasons: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "not_sports",
          "photo_text_mismatch",
          "trading_card",
          "graded_card",
          "card_over_value_cap",
          "weapon",
          "adult_content",
          "controlled_substance",
          "stolen_goods",
          "not_an_item",
          "bait_and_switch",
        ],
      },
    },
    is_trading_card: { type: "boolean" },
    confidence: { type: "number" },
    /** One short sentence, shown to the seller when held or refused. */
    seller_explanation: { type: "string" },
  },
  required: [
    "verdict",
    "reasons",
    "is_trading_card",
    "confidence",
    "seller_explanation",
  ],
  additionalProperties: false,
} as const;

function toImageBlock(img: string) {
  const match = img.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (match) {
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: match[1],
        data: match[2],
      },
    };
  }
  // Stored Supabase public URL — let the API fetch it.
  return { type: "image" as const, source: { type: "url" as const, url: img } };
}

const ALLOW_MESSAGE = "Your listing is live.";
const REVIEW_MESSAGE =
  "Your listing is under review and usually goes live within 24 hours. " +
  "We check new listings to keep the marketplace to youth sports gear. " +
  "You don't need to do anything — we'll email you when it's approved.";
const BLOCK_MESSAGE =
  "This item can't be listed on NearGear. We're a marketplace for youth " +
  "sports gear only. If you think this is a mistake, email support@near-gear.com.";

export function messageFor(verdict: ModerationVerdict): string {
  if (verdict === "review") return REVIEW_MESSAGE;
  if (verdict === "block") return BLOCK_MESSAGE;
  return ALLOW_MESSAGE;
}

/**
 * Classify a listing. Never throws — a failure returns verdict "error", which
 * callers treat as publish-and-flag.
 *
 * @param timeoutMs Publish latency the seller feels. 20s is generous for a
 *   low-effort call and still well under a user's patience for "Post listing".
 */
export async function classifyListing(
  input: ClassifyInput,
  { timeoutMs = 20_000 }: { timeoutMs?: number } = {},
): Promise<ModerationResult> {
  // --- 1. Deterministic pass. No API call, cannot fail. -------------------
  const pre = prescreen(input);
  if (pre.verdict === "block" || pre.verdict === "review") {
    return {
      verdict: pre.verdict,
      reasons: pre.reasons,
      confidence: 1,
      source: "prescreen",
      model: null,
      sellerMessage: messageFor(pre.verdict),
      isTradingCard: pre.isTradingCard,
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[moderation] ANTHROPIC_API_KEY missing — failing open");
    return failOpen(pre, "api_key_missing");
  }

  // --- 2. Model pass. ----------------------------------------------------
  const userText = [
    `Title: ${input.title}`,
    `Seller-selected sport: ${input.sport}`,
    `Seller-selected category: ${input.category}`,
    `Asking price: $${input.priceDollars.toFixed(2)}`,
    `Description: ${input.description}`,
    "",
    "Judge the listing above against the policy. The photos are the item.",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODERATION_MODEL,
        // Thinking is ON by default on Opus 5 and max_tokens caps thinking +
        // output TOGETHER. 4096 leaves room for both on what is a small JSON
        // payload; a 1024 ceiling copied from a classifier on an older model
        // would truncate mid-thought and look like a parse failure.
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        // Low effort: this is a bounded classification against an explicit
        // policy, not a reasoning problem. It also keeps publish latency down.
        output_config: {
          effort: "low",
          format: {
            type: "json_schema",
            schema: VERDICT_SCHEMA,
          },
        },
        messages: [
          {
            role: "user",
            content: [
              ...input.images.slice(0, 4).map(toImageBlock),
              { type: "text", text: userText },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[moderation] anthropic ${response.status}: ${body.slice(0, 500)}`,
      );
      return failOpen(pre, `upstream_${response.status}`);
    }

    const data = await response.json();

    // Structured outputs guarantee the shape, but a refusal stop_reason still
    // returns a well-formed response with no usable content -- check before
    // reading content[0].
    if (data.stop_reason === "refusal") {
      console.error("[moderation] classifier refused; failing open");
      return failOpen(pre, "classifier_refusal");
    }

    const raw = data.content?.[0]?.text;
    if (!raw) return failOpen(pre, "empty_response");

    const parsed = JSON.parse(raw) as {
      verdict: "allow" | "review" | "block";
      reasons: string[];
      is_trading_card: boolean;
      confidence: number;
    };

    // The prescreen's card finding is additive: the model may not recognise a
    // card from a photo of a sleeve, but "topps" in the title is decisive.
    const isTradingCard = parsed.is_trading_card || pre.isTradingCard;
    const reasons = [...new Set([...parsed.reasons, ...pre.reasons])];

    // A card the model allowed but that the prescreen knows is graded or over
    // the cap still goes to review. The deterministic rule wins on the facts
    // it can see directly.
    let verdict: ModerationVerdict = parsed.verdict;
    if (
      verdict === "allow" &&
      (reasons.includes("graded_card") || reasons.includes("card_over_value_cap"))
    ) {
      verdict = "review";
    }

    return {
      verdict,
      reasons,
      confidence: parsed.confidence ?? null,
      source: "model",
      model: MODERATION_MODEL,
      sellerMessage: messageFor(verdict),
      isTradingCard,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.error(`[moderation] ${aborted ? "timeout" : "error"}:`, err);
    return failOpen(pre, aborted ? "timeout" : "exception");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Publish, and mark it for sweep.
 *
 * Failing CLOSED here would mean one Anthropic blip queues every listing
 * submitted during ad spend, with a single admin to clear them -- the exact
 * bottleneck this design exists to avoid. The prescreen has already run and
 * returned no verdict, so the unambiguous cases are still refused; what gets
 * through is the nuanced middle, and /admin/moderation surfaces it.
 */
function failOpen(pre: Prescreen, reason: string): ModerationResult {
  return {
    verdict: "error",
    reasons: [...pre.reasons, `classifier_failed:${reason}`],
    confidence: null,
    source: "model",
    model: MODERATION_MODEL,
    sellerMessage: ALLOW_MESSAGE,
    isTradingCard: pre.isTradingCard,
  };
}
