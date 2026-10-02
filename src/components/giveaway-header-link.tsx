"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy } from "lucide-react";
import { recordGiveawayEvent } from "@/lib/giveaway-events";
import { useGiveawayOpen } from "@/lib/use-giveaway-open";

/**
 * "Win a $500 bat" — the site-wide way into /giveaway.
 *
 * Until this existed /giveaway was linked from nowhere; the only way in was a
 * paid ad. Rendered by the two headers (Navbar and the homepage nav), which are
 * already absent from the pages this must stay off: the signup funnel (login,
 * signup, password reset, /welcome), admin, banned, unsubscribe. The pathname
 * guard below covers the one place a header could still appear around it —
 * the giveaway's own pages.
 *
 * HIDDEN UNTIL KNOWN OPEN. It appears only once the status says the drawing is
 * open, so it pops in a moment after load. The alternative — show by date and
 * hide if the count says closed — would advertise a closed drawing whenever the
 * count failed. Rules §3: 500 total active listings or November 3, whichever
 * comes first.
 *
 * No UTM on the link. First-touch attribution would record an organic visitor's
 * source as our own header, overwriting the real one. The click event is the
 * measure, and the giveaway_view that follows joins to it by session.
 */
export function GiveawayHeaderLink() {
  const pathname = usePathname() ?? "";
  const open = useGiveawayOpen();

  if (open !== true || pathname.startsWith("/giveaway")) return null;

  return (
    <Link
      href="/giveaway"
      onClick={() => recordGiveawayEvent("site_header_giveaway_clicked")}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-orange px-3 text-[13px] font-bold text-orange-light transition hover:bg-orange/10"
    >
      <Trophy className="h-3.5 w-3.5" aria-hidden />
      Win a $500 bat
    </Link>
  );
}
