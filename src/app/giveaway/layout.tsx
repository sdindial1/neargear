import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";

/**
 * Route-group shell for /giveaway.
 *
 * The mockup uses Inter for body text and Roboto Mono for the scoreboard
 * numerals; the rest of the site uses Barlow. Rather than add two fonts
 * site-wide, they are loaded here via next/font so they are scoped to this
 * section and self-hosted — no render-blocking Google Fonts @import, which is
 * what the mockup did.
 *
 * Barlow Condensed comes from the root layout and is reused for display type.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Win a $500 Bat",
  description:
    "List your kids' outgrown gear on NearGear and you're entered to win a $500 bat — winner's choice of Easton Ghost or The Dub. No purchase necessary. Texas residents 18+.",
  openGraph: {
    title: "Win a $500 Bat — NearGear",
    description:
      "One listing, one entry. Drawing at 500 listings or November 3, 2026, whichever comes first. No purchase necessary.",
  },
};

export default function GiveawayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${inter.variable} ${robotoMono.variable}`}>{children}</div>
  );
}
