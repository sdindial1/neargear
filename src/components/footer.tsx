"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SupportLink } from "@/components/support-link";

// Rendered once, from the root layout, so every page has a path to support —
// including a signed-out visitor on a listing page, who has no account menu.
// Hidden where a page carries its own footer (giveaway legal copy, founding,
// dyb) and on internal admin screens.
const HIDE_PREFIXES = ["/admin", "/giveaway", "/founding", "/dyb"];

export function Footer() {
  const pathname = usePathname() ?? "/";
  if (HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  return (
    // Below md, fixed bars sit over the bottom of the page: the bottom nav, and
    // on listing pages the buy bar stacked above it. The extra bottom padding
    // keeps the links scrollable clear of both.
    <footer className="bg-[#071520] border-t border-white/10 pt-8 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+6rem)] md:pb-8">
      <div className="container mx-auto max-w-7xl px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-gray-400">
            © {new Date().getFullYear()} NearGear LLC · Dallas-Fort Worth, TX
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <Link
              href="/privacy"
              className="text-gray-400 hover:text-orange transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-gray-400 hover:text-orange transition-colors"
            >
              Terms of Service
            </Link>
            <SupportLink className="text-gray-400 hover:text-orange transition-colors">
              Contact support
            </SupportLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
