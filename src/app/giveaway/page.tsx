import { existsSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Saira_Condensed, Public_Sans } from "next/font/google";
import { GiveawayLanding } from "@/components/giveaway/giveaway-landing";

/**
 * /giveaway — the $500 bat drawing.
 *
 * The URL is fixed: a live Meta campaign points at it, so this file is rebuilt
 * rather than replaced. The page itself is _design/giveaway-redesign.html,
 * ported; this component exists only to supply the two things a static design
 * file cannot decide for itself.
 *
 * NO DATABASE READ, AND NO COUNT. The previous build put a live entry count in
 * the headline. The approved design removes it, and the progress bar it
 * replaced is not coming back either. With nothing to read, the page is fully
 * static — every ad click is served from the edge without touching Supabase.
 */

/**
 * Self-hosted by next/font, so there is no render-blocking request to Google
 * and no layout shift while the display face arrives.
 *
 * These are exposed as CSS variables rather than named literally in the
 * stylesheet: next/font rewrites each family to a generated name, so a
 * stylesheet asking for "Saira Condensed" by that string would quietly get
 * Arial Narrow instead. landing.module.css points --disp and --body at these.
 */
const sairaCondensed = Saira_Condensed({
  variable: "--font-saira-condensed",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NearGear Bat Drawing",
  description:
    "Somebody in DFW is getting a $500 bat. Free to enter, no account and no purchase. Open to Texas residents 18+.",
  openGraph: {
    title: "NearGear Bat Drawing",
    description:
      "One bat, one winner, winner's choice of the Easton Ghost or The Dub. Entries close November 3, 2026. No purchase necessary.",
  },
};

/**
 * The photo band is conditional on the file actually being there.
 *
 * Checked on the filesystem rather than guarded in the browser with onError:
 * an onError guard ships the <img>, lets it 404, and removes the element after
 * the fact, which is a visible flash of empty band on a page a campaign is
 * paying for. Resolved here, the markup simply never contains the element.
 *
 * This runs at build time — the page is static, and on Vercel the filesystem
 * is the build output — so dropping bat-band.jpg into public/images and
 * redeploying is the whole of the change needed to make the band appear.
 */
const BAND_PATH = path.join(process.cwd(), "public", "images", "bat-band.jpg");

export default function GiveawayPage() {
  const bandAvailable = existsSync(BAND_PATH);

  return (
    <div className={`${sairaCondensed.variable} ${publicSans.variable}`}>
      <GiveawayLanding bandAvailable={bandAvailable} />
    </div>
  );
}
