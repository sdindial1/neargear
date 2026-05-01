"use client";

import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShoppingBag } from "lucide-react";

interface Props {
  suspensionEndsAt: string | null;
  permanent: boolean;
}

export function SuspensionScreen({ suspensionEndsAt, permanent }: Props) {
  const endDate = suspensionEndsAt
    ? new Date(suspensionEndsAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="page-with-nav flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-sm p-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-orange" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-navy mb-2">
            Selling access suspended
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            {permanent ? (
              <>
                Your selling access has been permanently removed due to
                repeated violations.
              </>
            ) : endDate ? (
              <>
                Your selling access is suspended until{" "}
                <span className="font-semibold text-navy">{endDate}</span>.
                You can still browse and buy gear.
              </>
            ) : (
              <>
                Your selling access is suspended. You can still browse and
                buy gear.
              </>
            )}
          </p>

          <Link href="/browse" className="inline-block w-full">
            <Button className="btn-large btn-primary w-full">
              <ShoppingBag className="w-5 h-5" /> Browse Gear
            </Button>
          </Link>
          <a
            href="mailto:support@near-gear.com"
            className="block mt-3 text-sm text-orange font-semibold"
          >
            Contact Support
          </a>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
