import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { FoundingClient } from "./founding-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Founding Family · NearGear",
  description:
    "You've been invited to join NearGear as one of our first 15 DFW families. Zero platform fees. Forever.",
};

export default async function FoundingPage() {
  const supabase = await createServerSupabaseClient();

  const [{ data: spots }, { data: { user } }] = await Promise.all([
    supabase
      .from("founding_spots")
      .select("spots_claimed, total_spots")
      .eq("id", 1)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  let isFoundingMember = false;
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("is_founding_member")
      .eq("id", user.id)
      .maybeSingle();
    isFoundingMember = Boolean(profile?.is_founding_member);
  }

  return (
    <div className="min-h-screen bg-navy text-white safe-top safe-bottom">
      <header className="px-4 pt-6 pb-2 text-center">
        <Link
          href="/"
          className="inline-block text-3xl font-bold font-heading"
        >
          <span className="text-white">Near</span>
          <span className="text-orange">Gear</span>
        </Link>
      </header>

      <FoundingClient
        initialSpotsClaimed={spots?.spots_claimed ?? 0}
        initialTotalSpots={spots?.total_spots ?? 15}
        isSignedIn={Boolean(user)}
        isFoundingMember={isFoundingMember}
      />

      <footer className="text-center text-xs text-white/50 py-8 px-4 leading-relaxed">
        Questions?{" "}
        <a
          href="mailto:support@near-gear.com"
          className="text-orange hover:text-orange-light"
        >
          support@near-gear.com
        </a>
        <p className="mt-2">Free to list. Only pay when you sell.</p>
      </footer>
    </div>
  );
}
