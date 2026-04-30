/**
 * Mobile-friendly HTML email shell. Navy header with NearGear wordmark,
 * white content area, orange CTA buttons.
 */
export function emailShell(opts: {
  preheader: string;
  bodyHtml: string;
}): string {
  const { preheader, bodyHtml } = opts;
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>NearGear</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0d2438;">
    <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
            <tr>
              <td style="background:#0d2438;padding:28px 24px;text-align:center;">
                <span style="font-family:'Barlow Condensed',Helvetica,Arial,sans-serif;font-weight:700;font-size:32px;letter-spacing:-0.5px;">
                  <span style="color:#ffffff;">Near</span><span style="color:#ff6b35;">Gear</span>
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;line-height:1.6;font-size:15px;color:#0d2438;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px 28px;border-top:1px solid #eef0f2;font-size:12px;color:#7a8896;text-align:center;">
                Questions? Reply to this email or write us at <a href="mailto:support@near-gear.com" style="color:#ff6b35;text-decoration:none;">support@near-gear.com</a>.<br/>
                NearGear · Dallas-Fort Worth, Texas
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
    <tr>
      <td align="center" style="background:#ff6b35;border-radius:12px;">
        <a href="${escapeAttr(href)}" target="_blank" style="display:inline-block;padding:14px 26px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

export function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

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
