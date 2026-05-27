import type { Metadata } from "next";
import { CONTENT } from "@/content/terms-of-service";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "NearGear's terms of service governing your use of our marketplace platform.",
  alternates: { canonical: "https://near-gear.com/terms" },
};

export default function TermsOfServicePage() {
  return <LegalPage content={CONTENT} />;
}
