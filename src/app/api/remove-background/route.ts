import { NextRequest } from "next/server";
import {
  removeBackground,
  reportBgFailure,
  isOperatorFault,
  sellerMessage,
  type BgFailureReason,
} from "@/lib/remove-bg";
import { alertBackgroundRemovalDown } from "@/lib/notifications/alert";

export const runtime = "nodejs";

type Body = {
  imageBase64?: string;
  mimeType?: string;
  image?: string;
};

function stripDataUrl(input: string): { data: string; mimeType: string } {
  const match = input.match(/^data:(image\/\w+);base64,(.+)$/);
  if (match) return { data: match[2], mimeType: match[1] };
  return { data: input, mimeType: "image/png" };
}

/**
 * POST /api/remove-background
 *
 * Flattens a listing photo onto a white background, best-effort.
 *
 * STILL RETURNS 200 ON FAILURE, DELIBERATELY. Background removal is cosmetic;
 * a seller must never lose a listing because it failed. Signup → first listing
 * currently converts at 0%, and adding a hard failure to the one screen the ads
 * pay to reach would be the wrong trade in the wrong place.
 *
 * What changed is that the response now says WHY. It used to return the
 * original photo with `bgRemoved: false` and nothing else, which is the same
 * answer for an unconfigured key, a rejected key, an empty account and a photo
 * remove.bg couldn't use. On 2026-10-15 the account ran out of credits and the
 * next three listings uploaded with their backgrounds intact — the only trace
 * was a console.error nobody reads. Now every failure carries a `reason`, is
 * reported to Sentry, is shown to the seller, and — if it's ours, not the
 * photo's — emails support once per cooldown.
 *
 * Response (always 200 unless the request itself is malformed):
 *   { imageBase64, mimeType, bgRemoved, reason?, message? }
 * plus X-BG-Removed and X-BG-Reason headers for probing from outside.
 */
function respond(
  imageBase64: string,
  mimeType: string,
  bgRemoved: boolean,
  reason?: BgFailureReason,
) {
  return Response.json(
    {
      imageBase64,
      mimeType,
      bgRemoved,
      ...(reason
        ? { reason, message: sellerMessage(reason) }
        : {}),
    },
    {
      headers: {
        "X-BG-Removed": String(bgRemoved),
        ...(reason ? { "X-BG-Reason": reason } : {}),
      },
    },
  );
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const raw = body.imageBase64 ?? body.image;
  if (!raw) {
    return Response.json({ error: "imageBase64 is required" }, { status: 400 });
  }

  const { data: inputData, mimeType: detectedMime } = stripDataUrl(raw);
  const inputMime = body.mimeType || detectedMime;

  const result = await removeBackground({
    imageBase64: inputData,
    mimeType: inputMime,
    bgColor: "ffffff",
  });

  if (result.ok) {
    return respond(result.imageBase64, result.mimeType, true);
  }

  reportBgFailure(result, { inputMime, inputBytes: inputData.length });

  // Our fault, not the photo's → make sure a human finds out. Fire-and-forget:
  // the seller is already waiting on this response and an alert must not add
  // latency to the listing flow. Errors inside are swallowed by the helper.
  if (isOperatorFault(result.reason)) {
    void alertBackgroundRemovalDown(result.reason, result.detail);
  }

  return respond(inputData, inputMime, false, result.reason);
}
