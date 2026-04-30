"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AceCharacter, type AceState } from "./ace-character";
import { AceChat } from "./ace-chat";

const HIDE_PATHS = ["/auth", "/admin"];

const CLOSED_PX = 56;
const OPEN_PX = 90;
const ACE_BOTTOM = 100;
const ACE_RIGHT = 24;
const TAIL_GAP = 14;
const BUBBLE_BOTTOM = ACE_BOTTOM + OPEN_PX + TAIL_GAP;

/**
 * Minimal "chat button" face — two dot eyes + smile. Used only while the
 * panel is closed; tapping it morphs into the full AceCharacter.
 */
function ClosedFace() {
  return (
    <svg width={CLOSED_PX} height={CLOSED_PX} viewBox="0 0 56 56">
      <circle cx="22" cy="24" r="2.5" fill="#0d2438" />
      <circle cx="34" cy="24" r="2.5" fill="#0d2438" />
      <path
        d="M 22 34 Q 28 39 34 34"
        stroke="#0d2438"
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function AceFloating() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [aceState, setAceState] = useState<AceState>("idle");
  const [hasUnread, setHasUnread] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(!!session?.user);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
      if (!session?.user) setIsOpen(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Intro animation: excited on open, idle after 900ms. Plays once per open.
  // Chat callbacks (thinking/responding/alert) override later — the timer
  // only flips back to idle if the state is still "excited" at fire time,
  // so a fast tap-and-send doesn't get clobbered.
  useEffect(() => {
    if (isOpen) {
      setAceState("excited");
      const t = window.setTimeout(() => {
        setAceState((s) => (s === "excited" ? "idle" : s));
      }, 900);
      return () => window.clearTimeout(t);
    }
    setAceState("idle");
  }, [isOpen]);

  if (signedIn === null || !signedIn) return null;
  if (HIDE_PATHS.some((p) => pathname?.startsWith(p))) return null;

  const open = () => {
    if (isOpen) return;
    setHasUnread(false);
    setIsOpen(true);
  };

  const close = (e?: React.MouseEvent | React.PointerEvent) => {
    e?.stopPropagation();
    if (!isOpen) return;
    setIsOpen(false);
  };

  return (
    <>
      {/* Backdrop — only catches taps OUTSIDE the bubble. Tints the page. */}
      <div
        onClick={close}
        aria-hidden
        className="fixed inset-0 z-40 bg-black/40"
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 250ms ease",
        }}
      />

      {/* Speech bubble — always mounted, hidden via scaleY when closed. */}
      <div
        className="fixed z-50 bg-white flex flex-col overflow-hidden"
        style={{
          right: ACE_RIGHT,
          width: `calc(100vw - ${ACE_RIGHT * 2}px)`,
          bottom: BUBBLE_BOTTOM,
          height: "70dvh",
          maxHeight: `calc(100dvh - ${BUBBLE_BOTTOM + 24}px)`,
          borderRadius: "20px 20px 4px 20px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
          transformOrigin: "bottom center",
          transform: isOpen
            ? "scaleY(1) translateY(0)"
            : "scaleY(0) translateY(8px)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition:
            "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease",
        }}
      >
        <button
          type="button"
          onClick={(e) => close(e)}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Close Ace"
          className="absolute top-2 right-2 w-11 h-11 rounded-full hover:bg-gray-100 flex items-center justify-center text-navy"
          style={{ zIndex: 51, pointerEvents: "auto" }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 5l10 10M15 5l-10 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <AceChat
          onClose={() => close()}
          onAceState={setAceState}
          onUnread={setHasUnread}
        />
      </div>

      {/* Tail — small white triangle pointing down at Ace */}
      <span
        aria-hidden
        className="fixed z-50 pointer-events-none"
        style={{
          right: ACE_RIGHT + (OPEN_PX - 20) / 2,
          bottom: BUBBLE_BOTTOM - TAIL_GAP,
          width: 20,
          height: TAIL_GAP,
          background: "white",
          clipPath: "polygon(50% 100%, 0 0, 100% 0)",
          filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.08))",
          opacity: isOpen ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />

      {/* Ace himself — always rendered, fixed bottom-right.
          Closed circle and full character are layered and crossfade. */}
      <button
        type="button"
        onClick={open}
        aria-label={isOpen ? "Ace assistant" : "Open Ace"}
        className="fixed z-[60] flex items-center justify-center"
        style={{
          right: ACE_RIGHT - (OPEN_PX - CLOSED_PX) / 2,
          bottom: ACE_BOTTOM - (OPEN_PX - CLOSED_PX) / 2,
          width: OPEN_PX,
          height: OPEN_PX,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: isOpen ? "default" : "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {/* Glow halo (only visible while expanded) */}
        <span
          aria-hidden
          className="ace-glow-pulse absolute -inset-3 rounded-full pointer-events-none"
          style={{
            opacity: isOpen ? 1 : 0,
            transition: "opacity 250ms ease",
          }}
        />

        {/* Closed-state simple circle */}
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: isOpen ? "scale(1.6)" : "scale(1)",
            opacity: isOpen ? 0 : 1,
            transition:
              "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease",
          }}
        >
          <div
            style={{
              width: CLOSED_PX,
              height: CLOSED_PX,
              borderRadius: "50%",
              background: "#ff6b35",
              boxShadow:
                "0 4px 20px rgba(255, 107, 53, 0.45), 0 0 0 1px rgba(255, 107, 53, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "ace-breathe 3s ease-in-out infinite",
            }}
          >
            <ClosedFace />
          </div>
          {hasUnread && (
            <span
              className="absolute rounded-full bg-red-500 ring-2 ring-white"
              style={{
                top: "calc(50% - 26px)",
                right: "calc(50% - 26px)",
                width: 12,
                height: 12,
              }}
            />
          )}
        </div>

        {/* Open-state full Ace character */}
        <div
          aria-hidden={!isOpen}
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: isOpen ? "scale(1)" : "scale(0.62)",
            opacity: isOpen ? 1 : 0,
            transition:
              "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease",
          }}
        >
          <AceCharacter state={aceState} size="md" />
        </div>
      </button>
    </>
  );
}
