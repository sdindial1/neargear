/**
 * Meetup presentation helpers, shared by every notification path.
 *
 * These lived inside /api/notifications/trigger/route.ts, which meant the
 * release and refund paths — the ones that run from the cron sweep with no user
 * session and therefore never call that route — had no way to render a location
 * or a date. That is why the money emails carried neither. Moving them here is
 * what lets a receipt state where and when the meetup happened.
 */

export interface MeetupLocation {
  name: string;
  address: string;
}

/**
 * meetups.meetup_location is a TEXT column holding a JSON blob. Malformed or
 * missing values degrade to a placeholder rather than throwing — a notification
 * must never fail because a location could not be parsed.
 */
export function parseLocation(raw: string | null): MeetupLocation {
  if (!raw) return { name: "TBD", address: "Address shared in app" };
  try {
    const parsed = JSON.parse(raw) as {
      name?: string;
      address?: string;
      type?: string;
    };
    if (parsed.type === "home_seller") {
      return {
        name: "Seller's home",
        address: parsed.address || "Address shared in app",
      };
    }
    if (parsed.type === "home_buyer") {
      return {
        name: "Buyer's home",
        address: parsed.address || "Address shared in app",
      };
    }
    return {
      name: parsed.name || "Meetup location",
      address: parsed.address || "Address shared in app",
    };
  } catch {
    return { name: "Meetup location", address: "Address shared in app" };
  }
}

/** "Tue, Aug 12, 5 PM – 6 PM" from a meetup window. */
export function formatDateLine(
  start: string | null,
  end: string | null,
): string {
  if (!start) return "TBD";
  const s = new Date(start);
  const datePart = s.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (!end) {
    return `${datePart}, ${s.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })}`;
  }
  const e = new Date(end);
  return `${datePart}, ${s.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })} – ${e.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })}`;
}

/** "Tue, Aug 12" — for receipts, where the time window no longer matters. */
export function formatDateOnly(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
