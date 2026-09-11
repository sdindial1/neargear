/**
 * The per-visit id shared by every measurement on the giveaway funnel.
 *
 * WHY THIS IS ITS OWN MODULE. page_views and giveaway_events are separate
 * tables, and the only thing that stitches a view to the entry and the signup
 * that followed it is this string being identical in both. When the key lived
 * as a private constant inside page-view-logger.tsx, any second writer had to
 * re-declare it — and a funnel joined on two constants that are equal by
 * coincidence is a funnel that silently goes to zero the day one of them moves.
 *
 * No identity is attached. It is random, per-visit, and dies with the tab.
 */
const SESSION_KEY = "ng_view_session";

export function viewSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Private modes can refuse storage. An event with no session id is still
    // worth counting; it just cannot be joined to the view that preceded it.
    return null;
  }
}
