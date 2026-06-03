import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminClientOrRedirect } from "@/lib/admin-page";
import { AdminServiceRoleNotice } from "@/components/admin-service-role-notice";
import { PartnerForm } from "../partner-form";

export const dynamic = "force-dynamic";

export default async function NewPartnerPage() {
  const admin = await getAdminClientOrRedirect();
  if (!admin) return <AdminServiceRoleNotice />;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          href="/admin/partners"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Partner Programs
        </Link>
        <h1 className="mb-6 font-heading text-2xl font-bold text-navy">
          New Partner
        </h1>
        <PartnerForm mode="create" />
      </div>
    </main>
  );
}
