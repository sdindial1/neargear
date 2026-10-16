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
 * It sends email via Resend AND calls Sentry, so it works whether or not Sentry
 * is ever wired up. Every channel is best-effort and the function never throws —
 * an alert failing must not break the caller, which by definition is already in
 * a bad state.
 *
 * If near-gear.com is not verified with Resend this falls back to a shared
 * sender rather than dropping the alert, and says so on every channel it has.
 * It cannot call alertCritical about that (it is alertCritical), so the report
 * is console plus Sentry only.
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
        const note =
          `near-gear.com rejected by Resend — this CRITICAL alert is being sent ` +
          `from ${FROM_FALLBACK}. Verify the domain and DNS records. ` +
          `Resend error: ${error.message}`;
        console.error(`[alert:FALLBACK] ${note}`);
        try {
          Sentry.captureMessage(`[CRITICAL:email_domain_unverified] ${note}`, {
            level: "error",
          });
        } catch {
          // Sentry is inert without SENTRY_DSN; the console line above stands.
        }
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
 * Per-instance cooldown for repeating alerts.
 *
 * A seller uploading ten photos hits a broken integration ten times in one
 * burst. Ten identical emails is how an alert channel gets muted, and a muted
 * channel is worse than no channel.
 *
 * BEST-EFFORT BY CONSTRUCTION: this is module memory, so it is per serverless
 * instance, and a cold start forgets it. That is the right trade here — the
 * alternative is a database write on the error path, and the errors this guards
 * are exactly the ones where the environment is already misbehaving. Over-
 * sending a little beats a dependency that can fail. The photo burst that
 * motivates it lands on one warm instance anyway.
 */
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const lastAlertAt = new Map<string, number>();

function claimCooldown(key: string): boolean {
  const now = Date.now();
  const previous = lastAlertAt.get(key);
  if (previous !== undefined && now - previous < ALERT_COOLDOWN_MS) return false;
  lastAlertAt.set(key, now);
  return true;
}

/**
 * Raise an OPERATIONAL alert: something is broken and a human has to act, but
 * no money moved. Same channels as alertCritical, lower severity, and rate
 * limited per `event` so a burst of identical failures sends one email.
 *
 * Kept separate from alertCritical so that function's reservation for
 * money-critical events stays true — once "critical" includes cosmetic
 * breakage, the subject line stops meaning anything.
 *
 * Never throws.
 */
export async function alertOperational(alert: CriticalAlert): Promise<void> {
  const { event, summary, details } = alert;
  const detailText = renderDetails(details);

  // Logged every time, even when the email is suppressed — the function log
  // should show every occurrence, only the inbox gets the rate limit.
  console.error(`[WARNING:${event}] ${summary}\n${detailText}`);

  if (!claimCooldown(event)) return;

  try {
    Sentry.captureMessage(`[WARNING:${event}] ${summary}`, {
      level: "warning",
      extra: { ...details },
    });
  } catch (err) {
    console.error(`[alert:sentry-throw] ${event}:`, err);
  }

  // EMAIL ONLY FROM PRODUCTION. Unlike alertCritical — where money may have
  // moved and a missed alert is unrecoverable — these fire on ordinary
  // breakage, and the most common way to break them locally is to run the dev
  // server at all. Mailing support@ on every `npm run dev` upload is how the
  // inbox becomes something nobody opens. Console and Sentry still record it
  // in every environment, so nothing is lost; only the inbox is spared.
  if (process.env.NODE_ENV !== "production") {
    console.error(`[alert:dev-suppressed] would email: ${event}`);
    return;
  }

  const body = `${summary}\n\n${detailText}\n\nenv: ${process.env.NODE_ENV ?? "unknown"}\ntime: ${new Date().toISOString()}`;
  await emailAlert(`[NearGear WARNING] ${event}`, body);
}

/**
 * Background removal is down. Called from the sell flow's removal route on any
 * failure that is ours rather than the photo's.
 *
 * The cooldown key includes the reason so "out of credits" and "key rejected"
 * are not treated as the same incident — they need different fixes.
 */
export async function alertBackgroundRemovalDown(
  reason: string,
  detail: string,
): Promise<void> {
  const nextStep =
    reason === "insufficient_credits"
      ? "Top up remove.bg credits. Listings are uploading with backgrounds intact until you do."
      : reason === "invalid_key"
        ? "REMOVEBG_API_KEY was rejected. Check the key in Vercel Production."
        : reason === "not_configured"
          ? "REMOVEBG_API_KEY is missing from this deployment's environment."
          : "Check remove.bg status and the function logs.";

  await alertOperational({
    event: `background_removal_${reason}`,
    summary: `Listing photos are uploading WITHOUT background removal (${reason}). ${nextStep}`,
    details: { reason, detail },
  });
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
