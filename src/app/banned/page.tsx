"use client";

import Link from "next/link";
import { ShieldOff } from "lucide-react";

export default function BannedPage() {
  return (
    <div className="min-h-screen bg-navy flex flex-col items-center justify-center px-4 safe-top safe-bottom">
      <ShieldOff className="w-16 h-16 text-red-400 mb-6" />
      <h1 className="font-heading text-2xl font-bold text-white text-center mb-2">
        Account Restricted
      </h1>
      <p className="text-white/60 text-center max-w-sm mb-6">
        Your account has been restricted due to policy violations.
        If you believe this is an error, please contact support.
      </p>
      <Link
        href="/"
        className="text-orange hover:text-orange-light font-semibold text-sm"
      >
        Return to Home
      </Link>
    </div>
  );
}
