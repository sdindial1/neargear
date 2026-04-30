import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isAdmin } from "@/lib/admin";
import { AdminDashboard, type AdminPayload } from "./admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    redirect("/");
  }

  const admin = createAdminSupabaseClient();

  if (!admin) {
    return (
      <main className="min-h-screen bg-navy text-white flex flex-col items-center justify-center p-8 text-center">
        <h1 className="font-heading text-2xl font-bold text-orange mb-2">
          Admin dashboard unavailable
        </h1>
        <p className="text-sm text-white/70 max-w-md">
          Add{" "}
          <code className="bg-white/10 px-2 py-0.5 rounded">
            SUPABASE_SERVICE_ROLE_KEY
          </code>{" "}
          to <code className="bg-white/10 px-2 py-0.5 rounded">.env.local</code>{" "}
          and restart the dev server. You can find the key in Supabase Dashboard →
          Project Settings → API.
        </p>
      </main>
    );
  }

  const [
    usersRes,
    listingsRes,
    meetupsRes,
    transactionsRes,
    reportsRes,
  ] = await Promise.all([
    admin.from("users").select("*").order("created_at", { ascending: false }),
    admin
      .from("listings")
      .select(
        "id, title, sport, condition, status, price, photo_urls, created_at, seller_id, seller:users!seller_id(full_name, email)",
      )
      .order("created_at", { ascending: false }),
    admin
      .from("meetups")
      .select(
        "id, status, offered_price, meetup_window_start, meetup_window_end, meetup_location, created_at, buyer_id, seller_id, listing:listings!listing_id(title), buyer:users!buyer_id(full_name), seller:users!seller_id(full_name)",
      )
      .order("created_at", { ascending: false }),
    admin
      .from("transactions")
      .select(
        "id, gross_amount, platform_fee, net_amount, auto_completed, created_at, buyer_id, seller_id, listing:listings!listing_id(title), buyer:users!buyer_id(full_name), seller:users!seller_id(full_name)",
      )
      .order("created_at", { ascending: false }),
    admin
      .from("reports")
      .select(
        "id, reason, details, status, created_at, reporter_id, reported_listing_id, reported_user_id, reporter:users!reporter_id(full_name, email), reported_listing:listings!reported_listing_id(title), reported_user:users!reported_user_id(full_name, email)",
      )
      .order("created_at", { ascending: false }),
  ]);

  const payload: AdminPayload = {
    fetchedAt: new Date().toISOString(),
    users: (usersRes.data ?? []) as AdminPayload["users"],
    listings: (listingsRes.data ?? []) as unknown as AdminPayload["listings"],
    meetups: (meetupsRes.data ?? []) as unknown as AdminPayload["meetups"],
    transactions: (transactionsRes.data ??
      []) as unknown as AdminPayload["transactions"],
    reports: (reportsRes.data ?? []) as unknown as AdminPayload["reports"],
  };

  return <AdminDashboard payload={payload} />;
}
