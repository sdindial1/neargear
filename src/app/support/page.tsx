import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { SupportForm } from "./support-form";

export const metadata: Metadata = {
  title: "Contact support",
  description: "Questions about a listing, a meetup or your account? Send NearGear a message.",
  alternates: { canonical: "https://near-gear.com/support" },
};

/**
 * /support — contact form. Works signed in or out.
 *
 * `from` is the page the visitor clicked "Contact support" on. It is passed
 * through untrusted; /api/support validates it as a same-site path before it
 * goes anywhere near an email.
 */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { from } = await searchParams;
  const fromPath = typeof from === "string" ? from : null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 pb-28">
        <SupportForm fromPath={fromPath} />
      </main>
      <BottomNav />
    </div>
  );
}
