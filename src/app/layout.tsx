import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { AceFloating } from "@/components/ace/ace-floating";
import { MetaPixel } from "@/components/meta-pixel";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
});

const SITE_URL = "https://near-gear.com";
const SITE_DESCRIPTION =
  "DFW's AI-powered marketplace for youth sports gear. Serving Dallas, Fort Worth, Plano, Frisco, McKinney, Arlington, Irving, Grapevine, Keller and the surrounding DFW metro. Buy and sell with local families. Protected payments held until you confirm the handoff, at verified safe zones. Free to list — only pay when you sell.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NearGear — Buy & Sell Youth Sports Gear in DFW",
    template: "%s | NearGear",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "youth sports gear DFW",
    "used sports equipment Dallas",
    "baseball gear Dallas Fort Worth",
    "soccer cleats DFW",
    "youth sports marketplace",
    "kids sports gear Dallas",
    "used cleats DFW",
    "sports equipment resale Texas",
    "sports gear Plano TX",
    "sports gear Frisco TX",
    "sports gear McKinney",
    "sports gear Arlington TX",
    "sports gear Irving TX",
    "sports gear Fort Worth",
    "youth marketplace Dallas Fort Worth",
    "DFW metroplex sports",
    "used youth sports equipment Texas",
    "youth baseball Dallas",
    "youth soccer DFW",
    "youth football Plano",
    "kids basketball gear Texas",
    "parent to parent sports gear",
    "local sports marketplace DFW",
  ],
  authors: [{ name: "NearGear" }],
  creator: "NearGear",
  publisher: "NearGear LLC",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "NearGear",
    title: "NearGear — Buy & Sell Youth Sports Gear in DFW",
    description:
      "DFW families buy and sell youth sports gear at verified safe zones, with payment held until the handoff is confirmed. Local. Trusted. AI-powered.",
    // Image is supplied by app/opengraph-image.tsx (Next inlines it
    // automatically — don't list it here or you'll get duplicate tags).
  },
  twitter: {
    card: "summary_large_image",
    title: "NearGear — Buy & Sell Youth Sports Gear in DFW",
    description:
      "DFW families. Payment held until you confirm. Verified safe zones. AI-powered marketplace.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
  alternates: {
    canonical: SITE_URL,
  },
};

// Local-business / online-store schema so Google understands NearGear is a
// DFW-based marketplace. Lives in <body> as a JSON-LD script.
const LOCAL_BUSINESS_JSONLD = {
  "@context": "https://schema.org",
  "@type": "OnlineStore",
  name: "NearGear",
  url: SITE_URL,
  logo: `${SITE_URL}/opengraph-image`,
  description:
    "DFW's AI-powered marketplace for youth sports gear. Buy and sell with local families at verified safe zones.",
  areaServed: {
    "@type": "Place",
    name: "Dallas-Fort Worth Metroplex",
    geo: {
      "@type": "GeoCircle",
      geoMidpoint: {
        "@type": "GeoCoordinates",
        latitude: 32.7767,
        longitude: -96.797,
      },
      geoRadius: "50000",
    },
  },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Dallas",
    addressRegion: "TX",
    addressCountry: "US",
  },
  sameAs: [SITE_URL],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(LOCAL_BUSINESS_JSONLD),
          }}
        />
        {children}
        <MetaPixel />
        <AceFloating />
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "#0d2438",
              color: "#fff",
              border: "1px solid #1e3d56",
            },
            success: { iconTheme: { primary: "#ff6b35", secondary: "#fff" } },
          }}
        />
      </body>
    </html>
  );
}
