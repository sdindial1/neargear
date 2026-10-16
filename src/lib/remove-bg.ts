/**
 * remove.bg client — the one place that talks to the API, and the one place
 * that decides what a failure MEANS.
 *
 * WHY THIS FILE EXISTS. Background removal used to fail by returning the
 * original photo with HTTP 200 and `bgRemoved: false`, which is the same answer
 * it gives when no API key is configured, when the key is rejected, when the
 * account is out of credits and when the image simply has no clear subject.
 * One indistinguishable answer for five different causes meant nobody could
 * tell a broken integration from a bad photo. On 2026-10-15 the account ran out
 * of credits and the next three listings uploaded with their backgrounds
 * intact; the only trace was a console.error in a function log nobody reads.
 *
 * So every failure here gets a NAME, and the caller decides what to do with it.
 * Removal staying best-effort is correct — a seller must never lose a listing
 * because a cosmetic step failed — but "best effort" has to mean "we tried and
 * we know we didn't", not "we have no idea".
 */
import * as Sentry from "@sentry/nextjs";

/**
 * Warn at this many credits remaining. A seller uploads up to 10 photos and
 * each one is a credit, so anything under this is less than three listings of
 * runway — enough warning to top up before a seller sees the failure, which is
 * the entire point of checking.
 */
export const LOW_CREDIT_THRESHOLD = 25;

export type BgFailureReason =
  /** REMOVEBG_API_KEY unset. Expected locally; a deploy bug in production. */
  | "not_configured"
  /** 403 — the key exists and was rejected. Rotated, revoked or typo'd. */
  | "invalid_key"
  /** 402 — account has no credits. What happened on 2026-10-15. */
  | "insufficient_credits"
  /** 429 — too many calls. Transient; the photo is fine. */
  | "rate_limited"
  /** 400 — remove.bg could not use this image. The PHOTO's problem, not ours. */
  | "rejected_image"
  /** Any other non-OK status. */
  | "upstream_error"
  /** fetch threw, or the response could not be read. */
  | "network_error";

export interface BgSuccess {
  ok: true;
  imageBase64: string;
  mimeType: string;
  /** From X-Credits-Charged, when remove.bg sends it. */
  creditsCharged: number | null;
}

export interface BgFailure {
  ok: false;
  reason: BgFailureReason;
  /** HTTP status from remove.bg, or null if we never got a response. */
  status: number | null;
  /** Short error text for logs and Sentry. Never shown to a seller. */
  detail: string;
}

export type BgResult = BgSuccess | BgFailure;

/**
 * Is this failure OUR problem or the photo's?
 *
 * `rejected_image` is the photo's — a seller photographing a bat against a
 * cluttered garage gets it, nothing is broken, and alerting on it would train
 * us to ignore the alert. Everything else means the integration is down and a
 * human has to act, so it must reach one.
 *
 * `not_configured` counts only in production: locally the key is absent on
 * purpose and warning about it every time would be noise.
 */
export function isOperatorFault(reason: BgFailureReason): boolean {
  if (reason === "rejected_image") return false;
  if (reason === "not_configured") return process.env.NODE_ENV === "production";
  return true;
}

/** Seller-facing text. Vague on purpose where the cause is ours, not theirs. */
export function sellerMessage(reason: BgFailureReason): string {
  if (reason === "rejected_image") {
    return "We couldn't cut the background out of one of your photos — it's being used as you took it. A photo of the item against a plain wall or floor usually works better.";
  }
  return "Background cleanup is temporarily unavailable, so your photos are being used exactly as you took them. Your listing is otherwise unaffected.";
}

function reasonForStatus(status: number): BgFailureReason {
  if (status === 402) return "insufficient_credits";
  if (status === 403) return "invalid_key";
  if (status === 429) return "rate_limited";
  if (status === 400) return "rejected_image";
  return "upstream_error";
}

/**
 * Pull the human part out of a remove.bg error body.
 * Shape: {"errors":[{"title":"Insufficient credits","code":"insufficient_credits"}]}
 */
function parseErrorBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{ title?: string; code?: string }>;
    };
    const first = parsed.errors?.[0];
    if (first) return [first.code, first.title].filter(Boolean).join(": ");
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return body.slice(0, 200);
}

/**
 * Send one image to remove.bg. Never throws: every outcome is a BgResult.
 *
 * `bgColor` flattens the cut-out onto a solid background rather than leaving it
 * transparent, which is what the listing grid wants — a transparent PNG renders
 * against whatever is behind it and looks broken on a dark card.
 */
export async function removeBackground(opts: {
  imageBase64: string;
  mimeType: string;
  /** Hex without '#', e.g. "ffffff". */
  bgColor?: string;
  signal?: AbortSignal;
}): Promise<BgResult> {
  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "not_configured",
      status: null,
      detail: "REMOVEBG_API_KEY is unset",
    };
  }

  try {
    const buffer = Buffer.from(opts.imageBase64, "base64");
    const blob = new Blob([new Uint8Array(buffer)], { type: opts.mimeType });

    const formData = new FormData();
    formData.append("image_file", blob, "image.png");
    formData.append("size", "auto");
    if (opts.bgColor) formData.append("bg_color", opts.bgColor);

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: formData,
      signal: opts.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        reason: reasonForStatus(response.status),
        status: response.status,
        detail: parseErrorBody(body),
      };
    }

    const resultBuffer = await response.arrayBuffer();
    const charged = Number(response.headers.get("x-credits-charged"));
    return {
      ok: true,
      imageBase64: Buffer.from(resultBuffer).toString("base64"),
      mimeType: "image/png",
      creditsCharged: Number.isFinite(charged) ? charged : null,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      status: null,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface RemoveBgCredits {
  total: number;
  subscription: number;
  payg: number;
  enterprise: number;
  /**
   * remove.bg's `api.free_calls`. INFORMATIONAL ONLY — do not gate on it.
   * On 2026-10-16 this account reported `free_calls: -1` while every call
   * returned 402 insufficient_credits, so whatever -1 means, it does not mean
   * "calls available". `total` is the number that matched reality.
   */
  freeCalls: number | null;
}

/**
 * Read the account's remaining credits. Returns null if we cannot find out
 * (no key, network failure, unreadable body) — null means UNKNOWN, never zero,
 * so a caller can't mistake a failed check for an empty account.
 *
 * Costs no credits.
 */
export async function fetchRemoveBgCredits(): Promise<RemoveBgCredits | null> {
  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.remove.bg/v1.0/account", {
      headers: { "X-Api-Key": apiKey },
    });
    if (!response.ok) {
      console.error(
        `[removebg] account check failed: HTTP ${response.status}`,
      );
      return null;
    }
    const parsed = (await response.json()) as {
      data?: {
        attributes?: {
          credits?: {
            total?: number;
            subscription?: number;
            payg?: number;
            enterprise?: number;
          };
          api?: { free_calls?: number };
        };
      };
    };
    const credits = parsed.data?.attributes?.credits;
    if (!credits || typeof credits.total !== "number") {
      console.error("[removebg] account check returned no credit total");
      return null;
    }
    return {
      total: credits.total,
      subscription: credits.subscription ?? 0,
      payg: credits.payg ?? 0,
      enterprise: credits.enterprise ?? 0,
      freeCalls: parsed.data?.attributes?.api?.free_calls ?? null,
    };
  } catch (err) {
    console.error("[removebg] account check threw:", err);
    return null;
  }
}

/**
 * Record a background-removal failure on every channel that costs nothing.
 *
 * Sentry is scaffolded but inert without SENTRY_DSN (see
 * lib/notifications/alert.ts), so the console line is written FIRST and
 * unconditionally — it is the one channel that cannot itself fail. Never
 * throws: reporting a failure must not become a second failure.
 */
export function reportBgFailure(
  failure: BgFailure,
  context: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const operator = isOperatorFault(failure.reason);
  const line = `[removebg:${failure.reason}] status=${failure.status ?? "none"} ${failure.detail}`;

  if (operator) console.error(line);
  else console.warn(line);

  try {
    Sentry.captureMessage(`[removebg] ${failure.reason}`, {
      level: operator ? "error" : "warning",
      tags: { removebg_reason: failure.reason },
      extra: { status: failure.status, detail: failure.detail, ...context },
    });
  } catch {
    // Inert Sentry, or a Sentry that threw. The console line above stands.
  }
}
