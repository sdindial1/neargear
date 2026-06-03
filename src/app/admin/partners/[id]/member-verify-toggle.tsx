"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Check, X } from "lucide-react";

interface Props {
  partnerId: string;
  userId: string;
  verified: boolean;
}

export function MemberVerifyToggle({ partnerId, userId, verified }: Props) {
  const router = useRouter();
  const [isVerified, setIsVerified] = useState(verified);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    const next = !isVerified;
    try {
      const res = await fetch(
        `/api/admin/partners/${partnerId}/members/${userId}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verified: next }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Could not update");
        setBusy(false);
        return;
      }
      setIsVerified(data.verified);
      toast.success(data.verified ? "Member verified" : "Verification removed");
      router.refresh();
    } catch {
      toast.error("Network error");
    }
    setBusy(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
        isVerified
          ? "bg-green-100 text-green-800 hover:bg-green-200"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : isVerified ? (
        <Check className="h-3 w-3" />
      ) : (
        <X className="h-3 w-3" />
      )}
      {isVerified ? "Verified" : "Unverified"}
    </button>
  );
}
