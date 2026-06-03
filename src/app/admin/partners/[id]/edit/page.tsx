import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAdminClientOrRedirect } from "@/lib/admin-page";
import { AdminServiceRoleNotice } from "@/components/admin-service-role-notice";
import { PartnerForm } from "../../partner-form";
import type { PartnerProgram } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function EditPartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getAdminClientOrRedirect();
  if (!admin) return <AdminServiceRoleNotice />;
  const { id } = await params;

  const { data: partner } = await admin
    .from("partner_programs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!partner) notFound();

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          href={`/admin/partners/${id}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {partner.name}
        </Link>
        <h1 className="mb-6 font-heading text-2xl font-bold text-navy">
          Edit Partner
        </h1>
        <PartnerForm mode="edit" partner={partner as PartnerProgram} />
      </div>
    </main>
  );
}
