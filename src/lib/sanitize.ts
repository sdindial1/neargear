export const LIMITS = {
  NAME: 60,
  LISTING_TITLE: 100,
  LISTING_DESCRIPTION: 1000,
  MESSAGE: 500,
  ACE_MESSAGE: 500,
  REVIEW_TEXT: 500,
  CUSTOM_LOCATION: 200,
} as const;

// All callers ultimately render the result as React text or send it to
// Anthropic as plain text, so a tag-strip is enough — no HTML parser needed.
// Removing the jsdom dependency chain (the cause of an ERR_REQUIRE_ESM crash
// on Vercel: @exodus/bytes shipped as pure ESM while html-encoding-sniffer
// still require()'d it) makes this work in serverless.
function stripHtml(input: string): string {
  return input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "");
}

export function sanitizeText(input: string, maxLength = 500): string {
  if (!input) return "";
  return stripHtml(input).trim().slice(0, maxLength);
}
