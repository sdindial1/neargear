import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { AceFloating } from "@/components/ace/ace-floating";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "NearGear — Buy & Sell Sports Gear in DFW",
  description:
    "The local marketplace for buying and selling youth sports equipment in the Dallas-Fort Worth area.",
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
        {children}
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
