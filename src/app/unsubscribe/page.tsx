import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * /unsubscribe?token=… — opt out of the listing-nudge sequence.
 *
 * Honoured on load, not behind a confirm button. Someone who clicked
 * "unsubscribe" has already decided; making them confirm is how a second email
 * arrives after they thought they were done. The page then tells them plainly
 * what did and did not stop.
 *
 * No login required: the whole point is that it works from an inbox. The token
 * is a per-user UUID, so a leaked link opts out exactly one person and can be
 * rotated for that person alone.
 *
 * SCOPE IS THE SEQUENCE, NOT ALL EMAIL. Transactional messages — an item
 * selling, a buyer waiting to pay, a refund — keep sending. Privacy policy 7.3
 * says transactional email cannot be disabled while the account is active, and
 * quietly switching those off here would be worse for the user than the nudges
 * they are trying to stop.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let state: "done" | "already" | "invalid" | "unavailable" = "invalid";

  if (token && /^[0-9a-f-]{36}$/i.test(token)) {
    const admin = createAdminSupabaseClient();
    if (!admin) {
      state = "unavailable";
    } else {
      const { data: user } = await admin
        .from("users")
        .select("id, nudge_unsubscribed_at")
        .eq("unsubscribe_token", token)
        .maybeSingle();

      if (!user) {
        state = "invalid";
      } else if (user.nudge_unsubscribed_at) {
        state = "already";
      } else {
        const { error } = await admin
          .from("users")
          .update({ nudge_unsubscribed_at: new Date().toISOString() })
          .eq("id", user.id);
        // Report the truth. Telling someone they are unsubscribed when the
        // write failed guarantees another email and destroys the trust the
        // page exists to protect.
        state = error ? "unavailable" : "done";
      }
    }
  }

  const copy = {
    done: {
      title: "You're unsubscribed",
      body:
        "We won't send you any more reminders about listing your gear. " +
        "You'll still get messages about your account — if something you list sells, we'll tell you.",
    },
    already: {
      title: "Already unsubscribed",
      body:
        "You'd already opted out of listing reminders, so there was nothing to change. " +
        "You'll still get messages about your account and any sales.",
    },
    invalid: {
      title: "That link didn't work",
      body:
        "The unsubscribe link looks incomplete or has already been replaced. " +
        "Email support@near-gear.com and we'll take care of it.",
    },
    unavailable: {
      title: "Something went wrong",
      body:
        "We couldn't update your preferences just now, so please assume you are " +
        "still subscribed. Email support@near-gear.com and we'll do it by hand.",
    },
  }[state];

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl border bg-white p-8 text-center">
        <h1 className="font-heading text-2xl font-bold text-navy">{copy.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{copy.body}</p>
        <Link
          href="/marketplace"
          className="mt-6 inline-block text-sm font-semibold text-orange hover:underline"
        >
          Back to NearGear
        </Link>
      </div>
    </main>
  );
}
