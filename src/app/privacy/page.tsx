import type { Metadata } from "next";
import { CONTENT } from "@/content/privacy-policy";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "NearGear's privacy policy explaining how we collect, use, and protect your information.",
  alternates: { canonical: "https://near-gear.com/privacy" },
};

export default function PrivacyPolicyPage() {
  return <LegalPage content={CONTENT} />;
}
