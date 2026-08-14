/**
 * The shared HTML email system. Every transactional email NearGear sends is
 * built from emailLayout() plus the optional blocks below — there is no second
 * way to render an email, so a fix here reaches all of them.
 *
 * EMAIL-SAFE RULES THIS FILE FOLLOWS, and why they are not negotiable:
 *   - Tables for layout. No flexbox, no grid, no divs doing structural work.
 *   - Inline styles on every element. Head <style> is a progressive enhancement
 *     only (dark mode); an email that loses it must still look right.
 *   - Web-safe font stack. Custom faces silently fall back, so the wordmark
 *     names Barlow Condensed first but is designed to read in Helvetica.
 *   - Every <img> carries alt text and explicit width/height. Assume images are
 *     blocked, because for a large share of recipients they are.
 *
 * DARK MODE — what is actually controllable:
 *   1. <meta name="color-scheme"> + the :root color-scheme declaration tell
 *      clients we handle dark ourselves and they should not auto-invert.
 *   2. @media (prefers-color-scheme: dark) carries the real dark palette.
 *      Honoured by Apple Mail, iOS Mail and Outlook for macOS.
 *   3. [data-ogsc] / [data-ogsb] are the hooks Outlook.com and Outlook for
 *      Windows inject when they recolour; they let us pin surfaces back.
 *   4. Gmail supports NONE of the above and runs its own inversion — full on
 *      Android, partial on web and iOS. It is not controllable, so instead we
 *      remove what its algorithm handles worst: every coloured surface carries
 *      a bgcolor ATTRIBUTE alongside its inline background-color (Gmail
 *      respects the attribute far more consistently, and this is the single
 *      biggest fix for a navy header turning pale blue), the page ground is
 *      #F2F4F6 rather than pure white (which Gmail inverts hardest), and the
 *      amount block reuses the header's exact navy so whatever Gmail decides,
 *      it decides the same thing for both and the email still reads as one
 *      design rather than half-inverted.
 */

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/** Light palette — the inline-style default every client starts from. */
const C = {
  page: "#F2F4F6",
  card: "#FFFFFF",
  border: "#E4E9ED",
  navy: "#0D2438",
  ink: "#0D2438",
  ink2: "#3D5468",
  muted: "#6B7E90",
  hairline: "#EEF1F4",
  panel: "#F7F9FB",
  orange: "#FF6B35",
  orangeLink: "#C24417",
  onNavy: "#FFFFFF",
  onNavyMuted: "#9FB3C4",
} as const;

const FONT = "Helvetica,Arial,sans-serif";
const MONO = "Consolas,Menlo,monospace";

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

export function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Attribute-safe escaping for href/src values. Broader than quote-stripping on
 * purpose: these values now include listing photo URLs from storage, which is
 * further from our control than the app URLs this used to see.
 */
export function escapeAttr(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Small formatters
// ---------------------------------------------------------------------------

export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "there";
  return fullName.trim().split(/\s+/)[0] || "there";
}

export function formatMoney(cents: number | null | undefined): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

export function mapsLink(address: string | null | undefined): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address || "")}`;
}

/**
 * Human-quotable order reference. Display only — never parsed back into a UUID.
 * Support looks an order up by prefix: `where id::text like '4f2a9c11%'`.
 */
export function orderRef(orderId: string | null | undefined): string {
  if (!orderId) return "—";
  return `NG-${orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** Sentence-case a listing condition enum for display next to the photo. */
export function conditionLabel(condition: string | null | undefined): string | null {
  if (!condition) return null;
  const map: Record<string, string> = {
    like_new: "Like new",
    good: "Good condition",
    fair: "Fair condition",
    poor: "Well used",
  };
  return map[condition] ?? null;
}

// ---------------------------------------------------------------------------
// Block types
// ---------------------------------------------------------------------------

export interface ProductBlock {
  title: string;
  /** Absolute https URL from listings.photo_urls[0]. Block renders without it. */
  imageUrl?: string | null;
  /** e.g. "Large · Good condition". */
  meta?: string | null;
}

export interface AmountLine {
  label: string;
  value: string;
}

export interface AmountBlock {
  /** Uppercase label above the figure, e.g. "Total charged". */
  label: string;
  /** The figure itself, pre-formatted. */
  value: string;
  /** Optional breakdown under the figure. */
  lines?: AmountLine[];
  /** Optional muted line under the breakdown. */
  note?: string | null;
}

export interface DetailRow {
  label: string;
  value: string;
  /** Second line under the value, muted. */
  sub?: string | null;
  /** Small link under the value, e.g. "Get directions". */
  link?: { href: string; label: string } | null;
  /** Render the value in a monospace face — order references. */
  mono?: boolean;
}

export interface NoticeBlock {
  title: string;
  body: string;
}

export interface EmailLayoutOpts {
  /** Hidden inbox-list preview text. */
  preheader: string;
  /** Uppercase event label above the headline. */
  eyebrow: string;
  heading: string;
  /** Opening paragraphs, plain text. Escaped here; one entry per <p>. */
  intro: string[];
  product?: ProductBlock | null;
  amount?: AmountBlock | null;
  details?: DetailRow[] | null;
  notice?: NoticeBlock | null;
  /**
   * Pre-escaped HTML dropped in after the detail rows. The single escape hatch
   * in this system — callers own escaping for anything they pass here.
   */
  bodyHtml?: string | null;
  cta?: { href: string; label: string } | null;
  /** Caption under the button. */
  ctaNote?: string | null;
}

// ---------------------------------------------------------------------------
// Dark mode stylesheet
// ---------------------------------------------------------------------------

const DARK_STYLES = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }

  @media (prefers-color-scheme: dark) {
    .ng-page    { background-color: #0A1622 !important; }
    .ng-card    { background-color: #11212F !important; border-color: #24394B !important; }
    .ng-h1      { color: #E6EDF3 !important; }
    .ng-text    { color: #B4C6D4 !important; }
    .ng-strong  { color: #E6EDF3 !important; }
    .ng-muted   { color: #8598A8 !important; }
    .ng-eyebrow { color: #8598A8 !important; }
    .ng-panel   { background-color: #1A2E3F !important; border-color: #24394B !important; }
    .ng-rule    { border-bottom-color: #24394B !important; }
    .ng-amount  { border: 1px solid #2C4358 !important; }
    .ng-footer  { background-color: #0D1F2E !important; border-top-color: #24394B !important; }
    .ng-link    { color: #FFA079 !important; }
    .ng-cta     { background-color: #FF7A47 !important; }
    .ng-cta a   { color: #1A0B03 !important; }
    .ng-notice  { background-color: #33240F !important; }
    .ng-notice-text { color: #F0C08A !important; }
  }

  /* Outlook.com / Outlook for Windows recolouring hooks. */
  [data-ogsb] .ng-card   { background-color: #11212F !important; }
  [data-ogsb] .ng-page   { background-color: #0A1622 !important; }
  [data-ogsb] .ng-header { background-color: #0D2438 !important; }
  [data-ogsb] .ng-amount { background-color: #0D2438 !important; }
  [data-ogsc] .ng-h1     { color: #E6EDF3 !important; }
  [data-ogsc] .ng-text   { color: #B4C6D4 !important; }
  [data-ogsc] .ng-muted  { color: #8598A8 !important; }
`;

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function renderProduct(p: ProductBlock): string {
  // Fixed 96px image cell keeps both columns intact down to a 320px viewport,
  // so this needs no media query — which matters because the clients that most
  // need stacking are the ones least likely to honour one.
  const image = p.imageUrl
    ? `<td width="96" valign="top" style="padding:12px;">
         <img src="${escapeAttr(p.imageUrl)}" width="72" height="72"
              alt="${escapeAttr(p.title)}"
              style="display:block;width:72px;height:72px;border:0;border-radius:8px;background-color:#DEE5EB;" />
       </td>`
    : "";

  return `
    <tr><td style="padding:16px 22px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ng-panel" bgcolor="${C.panel}" style="background-color:${C.panel};border:1px solid ${C.border};border-radius:10px;">
        <tr>
          ${image}
          <td valign="middle" style="padding:12px 12px 12px ${p.imageUrl ? "0" : "14px"};font-family:${FONT};">
            <p class="ng-strong" style="margin:0 0 3px;font-size:15px;line-height:1.35;color:${C.ink};font-weight:bold;">${escapeHtml(p.title)}</p>
            ${p.meta ? `<p class="ng-muted" style="margin:0;font-size:13px;color:${C.muted};">${escapeHtml(p.meta)}</p>` : ""}
          </td>
        </tr>
      </table>
    </td></tr>`;
}

function renderAmount(a: AmountBlock): string {
  const lines = (a.lines ?? [])
    .map(
      (l) => `
        <tr>
          <td style="padding:3px 0;color:${C.onNavyMuted};">${escapeHtml(l.label)}</td>
          <td align="right" style="padding:3px 0;color:#E6EDF3;">${escapeHtml(l.value)}</td>
        </tr>`,
    )
    .join("");

  // Deliberately the same navy as the header: whatever Gmail's inversion does,
  // it does it to both, so the email never ends up half-inverted.
  return `
    <tr><td style="padding:14px 22px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ng-amount" bgcolor="${C.navy}" style="background-color:${C.navy};border-radius:10px;">
        <tr><td style="padding:16px 18px;font-family:${FONT};">
          <p style="margin:0 0 2px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${C.onNavyMuted};font-weight:bold;">${escapeHtml(a.label)}</p>
          <p style="margin:0${lines || a.note ? " 0 10px" : ""};font-size:34px;line-height:1.1;color:${C.onNavy};font-weight:bold;letter-spacing:-1px;">${escapeHtml(a.value)}</p>
          ${
            lines
              ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};font-size:13px;">${lines}</table>`
              : ""
          }
          ${a.note ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:${C.onNavyMuted};">${escapeHtml(a.note)}</p>` : ""}
        </td></tr>
      </table>
    </td></tr>`;
}

function renderDetails(rows: DetailRow[]): string {
  const body = rows
    .map((r, i) => {
      const last = i === rows.length - 1;
      const rule = last ? "" : `border-bottom:1px solid ${C.hairline};`;
      const ruleClass = last ? "" : ` class="ng-rule"`;
      const valueStyle = r.mono
        ? `font-family:${MONO};font-size:12px;`
        : "font-weight:bold;";
      return `
        <tr>
          <td${ruleClass} width="40%" valign="top" style="padding:7px 10px 7px 0;color:${C.muted};${rule}" class="ng-muted">${escapeHtml(r.label)}</td>
          <td${ruleClass} align="right" valign="top" style="padding:7px 0;color:${C.ink};${rule}${valueStyle}" class="ng-strong">
            ${escapeHtml(r.value)}
            ${r.sub ? `<br /><span class="ng-muted" style="color:${C.muted};font-size:12px;font-weight:normal;">${escapeHtml(r.sub)}</span>` : ""}
            ${
              r.link
                ? `<br /><a class="ng-link" href="${escapeAttr(r.link.href)}" style="color:${C.orangeLink};font-size:12px;font-weight:normal;text-decoration:none;">${escapeHtml(r.link.label)}</a>`
                : ""
            }
          </td>
        </tr>`;
    })
    .join("");

  return `
    <tr><td style="padding:18px 22px 0;font-family:${FONT};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.5;">
        ${body}
      </table>
    </td></tr>`;
}

function renderNotice(n: NoticeBlock): string {
  return `
    <tr><td style="padding:18px 22px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ng-notice" bgcolor="#FFF3E6" style="background-color:#FFF3E6;border-left:3px solid ${C.orange};border-radius:0 8px 8px 0;">
        <tr><td style="padding:12px 14px;font-family:${FONT};">
          <p class="ng-notice-text" style="margin:0 0 4px;font-size:14px;color:#8A4A12;font-weight:bold;">${escapeHtml(n.title)}</p>
          <p class="ng-notice-text" style="margin:0;font-size:14px;line-height:1.55;color:#8A4A12;">${escapeHtml(n.body)}</p>
        </td></tr>
      </table>
    </td></tr>`;
}

export function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr><td class="ng-cta" bgcolor="${C.orange}" align="center" style="background-color:${C.orange};border-radius:10px;">
      <a href="${escapeAttr(href)}" target="_blank" style="display:inline-block;padding:13px 26px;color:${C.onNavy};font-family:${FONT};font-weight:bold;font-size:15px;text-decoration:none;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function emailLayout(opts: EmailLayoutOpts): string {
  const {
    preheader,
    eyebrow,
    heading,
    intro,
    product,
    amount,
    details,
    notice,
    bodyHtml,
    cta,
    ctaNote,
  } = opts;

  const introHtml = intro
    .map(
      (p) =>
        `<p class="ng-text" style="margin:0 0 10px;font-size:15px;line-height:1.6;color:${C.ink2};">${escapeHtml(p)}</p>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>NearGear</title>
    <style>${DARK_STYLES}</style>
  </head>
  <body class="ng-page" bgcolor="${C.page}" style="margin:0;padding:0;background-color:${C.page};font-family:${FONT};color:${C.ink};">
    <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ng-page" bgcolor="${C.page}" style="background-color:${C.page};">
      <tr><td align="center" style="padding:20px 10px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ng-card" bgcolor="${C.card}" style="max-width:560px;background-color:${C.card};border-radius:14px;overflow:hidden;border:1px solid ${C.border};">

          <tr><td class="ng-header" bgcolor="${C.navy}" align="center" style="background-color:${C.navy};padding:22px 20px;">
            <span style="font-family:'Barlow Condensed',${FONT};font-weight:bold;font-size:28px;letter-spacing:-0.5px;color:${C.onNavy};">Near<span style="color:${C.orange};">Gear</span></span>
          </td></tr>

          <tr><td style="padding:26px 22px 8px;font-family:${FONT};">
            <p class="ng-eyebrow" style="margin:0 0 6px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${C.muted};font-weight:bold;">${escapeHtml(eyebrow)}</p>
            <h1 class="ng-h1" style="margin:0 0 14px;font-size:23px;line-height:1.25;color:${C.ink};font-weight:bold;letter-spacing:-0.3px;">${escapeHtml(heading)}</h1>
            ${introHtml}
          </td></tr>

          ${product ? renderProduct(product) : ""}
          ${amount ? renderAmount(amount) : ""}
          ${details && details.length ? renderDetails(details) : ""}
          ${notice ? renderNotice(notice) : ""}
          ${bodyHtml ? `<tr><td style="padding:16px 22px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink2};" class="ng-text">${bodyHtml}</td></tr>` : ""}

          ${
            cta
              ? `<tr><td align="center" style="padding:22px 22px 4px;">${ctaButton(cta.href, cta.label)}</td></tr>`
              : ""
          }
          ${
            ctaNote
              ? `<tr><td align="center" style="padding:10px 22px 0;font-family:${FONT};">
                   <p class="ng-muted" style="margin:0;font-size:12px;line-height:1.5;color:${C.muted};">${escapeHtml(ctaNote)}</p>
                 </td></tr>`
              : ""
          }

          <tr><td style="padding:${cta || ctaNote ? "18" : "22"}px 22px 0;"></td></tr>

          <tr><td class="ng-footer" bgcolor="${C.panel}" align="center" style="background-color:${C.panel};padding:16px 22px 20px;border-top:1px solid ${C.border};font-family:${FONT};">
            ${
              cta
                ? `<p class="ng-muted" style="margin:0 0 8px;font-size:12px;line-height:1.55;color:${C.muted};">Button not working? Open <a class="ng-link" href="${escapeAttr(cta.href)}" style="color:${C.orangeLink};text-decoration:none;">${escapeHtml(cta.href)}</a></p>`
                : ""
            }
            <p class="ng-muted" style="margin:0 0 4px;font-size:12px;line-height:1.55;color:${C.muted};">Questions? Reply to this email or write <a class="ng-link" href="mailto:support@near-gear.com" style="color:${C.orangeLink};text-decoration:none;">support@near-gear.com</a></p>
            <p class="ng-muted" style="margin:0;font-size:12px;color:${C.muted};">NearGear &middot; Dallas&ndash;Fort Worth, Texas</p>
          </td></tr>

        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
