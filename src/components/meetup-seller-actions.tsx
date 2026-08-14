"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { acceptMeetup, declineMeetup } from "@/lib/meetups/actions";
import { fireNotification } from "@/lib/notifications/trigger";
import { Button } from "@/components/ui/button";
import { SellerPayoutWarning } from "@/components/seller-payout-warning";
import { Check, Loader2, X } from "lucide-react";

export function MeetupSellerActions({
  meetupId,
  listingId,
}: {
  meetupId: string;
  listingId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);

  const onAccept = async () => {
    if (busy) return;
    setBusy("accept");
    const { error } = await acceptMeetup(createClient(), meetupId);
    if (error) {
      setBusy(null);
      toast.error("Couldn't accept — please try again.");
      return;
    }
    void fireNotification({ event: "meetup_accepted", meetupId });
    toast.success("Request accepted — meetup scheduled.");
    router.refresh();
  };

  const onDecline = async () => {
    if (busy) return;
    setBusy("decline");
    await declineMeetup(createClient(), meetupId, listingId);
    void fireNotification({ event: "meetup_declined", meetupId });
    router.refresh();
  };

  return (
    <div className="bg-white rounded-2xl border p-4 mb-4">
      {/* Warns, never blocks. Accept stays enabled — see SellerPayoutWarning. */}
      <SellerPayoutWarning variant="pre-accept" className="mb-4" />

      <p className="font-semibold text-navy">Respond to this request</p>
      <p className="text-xs text-muted-foreground mt-1 mb-3">
        Accept to schedule the meetup. The buyer then pays the total securely
        online — held by NearGear until you confirm the handoff.
      </p>
      <div className="flex gap-2">
        <Button
          onClick={onAccept}
          disabled={busy !== null}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white h-11"
        >
          {busy === "accept" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          Accept
        </Button>
        <Button
          onClick={onDecline}
          disabled={busy !== null}
          variant="outline"
          className="flex-1 h-11 border-red-200 text-red-600"
        >
          {busy === "decline" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
          Decline
        </Button>
      </div>
    </div>
  );
}
