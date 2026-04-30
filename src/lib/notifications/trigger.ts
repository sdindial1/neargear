type TriggerEvent =
  | "meetup_requested"
  | "meetup_accepted"
  | "meetup_declined"
  | "transaction_complete";

type TriggerPayload =
  | { event: "meetup_requested" | "meetup_accepted" | "meetup_declined"; meetupId: string }
  | { event: "transaction_complete"; transactionId: string };

/**
 * Fire-and-forget client helper. POSTs to the server-side notification
 * trigger and swallows errors — notification failures must never break
 * the calling flow.
 */
export async function fireNotification(payload: TriggerPayload): Promise<void> {
  try {
    await fetch("/api/notifications/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (err) {
    console.warn("[notify:client] failed", err);
  }
}

export type { TriggerEvent };
