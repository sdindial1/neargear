import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";

/**
 * Out-of-band alerting for money-critical failures.
 *
 * Deliberately independent of every other notification path:
 *   - NOT the database (no notifications row, no admin table). The alerts this
 *     sends fire when a database write has just failed — routing them through
 *     the database is exactly the wrong channel.
 *   - NOT Sentry alone. Sentry is scaffolded in this project but inert unless
 *     SENTRY_DSN is set, so a Sentry-only alert can silently go nowhere.
 *   - NOT the templating layer in ./email.ts, so a template change can never
 *     break the alert path.
 *
 * It sends email via Resend (already configured, near-gear.com verified) AND
 * calls Sentry, so it works whether or not Sentry is ever wired up. Every
 * channel is best-effort and the function never throws — an alert failing must
 * not break the caller, which by definition is already in a bad state.
 *
 * Reserved for events where money moved (or may have moved) and the system
 * cannot self-correct. Do not use it for ordinary errors.
 */

const ALERT_TO = "support@near-gear.com";
const FROM = "NearGear Alerts <support@near-gear.com>";
const FROM_FALLBACK = "NearGear Alerts <onboarding@resend.dev>";

export interface CriticalAlert {
  /** Short stable label, e.g. "transfer_unrecorded". Becomes the subject tag. */
  event: string;
  /** One-line human summary. */
  summary: string;
  /** Structured context — ids, amounts, error text. */
  details?: Record<string, string | number | boolean | null | undefined>;
}

function renderDetails(details: CriticalAlert["details"]): string {
  if (!details) return "";
  return Object.entries(details)
    .map(([k, v]) => `${k}: ${v ?? "—"}`)
    .join("\n");
}

async function emailAlert(
  subject: string,
  body: string,
  attempt: "primary" | "fallback" = "primary",
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error(`[alert:no-email] RESEND_API_KEY unset, cannot send: ${subject}`);
    return;
  }
  try {
    const { error } = await new Resend(key).emails.send({
      from: attempt === "primary" ? FROM : FROM_FALLBACK,
      to: ALERT_TO,
      subject,
      // Plain <pre> on purpose: no shared template, nothing to break.
      html: `<pre style="font:14px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">${body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</pre>`,
    });
    if (error) {
      if (attempt === "primary" && /domain|from/i.test(String(error.message))) {
        return emailAlert(subject, body, "fallback");
      }
      console.error(`[alert:email-error] ${subject}:`, error.message);
      return;
    }
    console.error(`[alert:email-sent] ${subject}`);
  } catch (err) {
    console.error(`[alert:email-throw] ${subject}:`, err);
  }
}

/**
 * Raise a money-critical alert on every available channel. Never throws.
 */
export async function alertCritical(alert: CriticalAlert): Promise<void> {
  const { event, summary, details } = alert;
  const detailText = renderDetails(details);
  const body = `${summary}\n\n${detailText}\n\nenv: ${process.env.NODE_ENV ?? "unknown"}\ntime: ${new Date().toISOString()}`;

  // Always logged first — the one channel that cannot itself fail.
  console.error(`[CRITICAL:${event}] ${summary}\n${detailText}`);

  try {
    Sentry.captureMessage(`[CRITICAL:${event}] ${summary}`, {
      level: "error",
      extra: { ...details },
    });
  } catch (err) {
    console.error(`[alert:sentry-throw] ${event}:`, err);
  }

  await emailAlert(`[NearGear CRITICAL] ${event}`, body);
}
