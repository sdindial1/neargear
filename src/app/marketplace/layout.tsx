import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marketplace — Youth Sports Gear in DFW",
  description:
    "Browse youth sports gear from DFW families. Baseball, soccer, football, basketball, golf and more across Dallas, Fort Worth, Plano, Frisco, McKinney, Arlington and the DFW metroplex.",
  alternates: {
    canonical: "https://near-gear.com/marketplace",
  },
  openGraph: {
    title: "Marketplace — Youth Sports Gear in DFW",
    description:
      "Browse youth sports gear from DFW families. Baseball, soccer, football, basketball, golf and more across the DFW metroplex.",
    url: "https://near-gear.com/marketplace",
    type: "website",
  },
};

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
