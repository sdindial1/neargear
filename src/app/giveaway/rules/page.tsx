import Link from "next/link";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SWEEPSTAKES_RULES } from "@/content/sweepstakes-rules";
import s from "../giveaway.module.css";

export const metadata: Metadata = {
  title: "Official Rules — $500 Bat Giveaway",
  description:
    "Official Rules for the NearGear $500 Bat Giveaway. No purchase necessary. Open to Texas residents 18+.",
  // A rules page has no SEO value and shouldn't compete with the landing page.
  robots: { index: false, follow: true },
};

/**
 * /giveaway/rules — the Official Rules.
 *
 * Rendered from src/content/sweepstakes-rules.ts, which is the drafting
 * document with the placeholders filled, the AMOE link pointed at the route
 * that actually exists, and the internal "BEFORE PUBLISHING" notes removed.
 *
 * Static: the rules must not change under an entrant mid-promotion.
 */
export default function GiveawayRulesPage() {
  return (
    <div className={s.page}>
      <nav className={s.nav}>
        <Link href="/giveaway" className={`${s.logo} ${s.display}`}>
          Near<span className={s.g}>Gear</span>
        </Link>
        <Link href="/auth/signup?redirect=/sell" className={s.ctaSm}>
          List Your Gear
        </Link>
      </nav>

      <main className={s.doc}>
        <Link href="/giveaway" className={s.docBack}>
          &larr; Back to the giveaway
        </Link>
        <article className={s.prose}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {SWEEPSTAKES_RULES}
          </ReactMarkdown>
        </article>
      </main>

      <footer className={s.footer}>
        <div className={s.legal}>
          Questions about this promotion? Email{" "}
          <a href="mailto:support@near-gear.com">support@near-gear.com</a>.
        </div>
        <div style={{ marginTop: 10 }}>&copy; 2026 NearGear LLC.</div>
      </footer>
    </div>
  );
}
