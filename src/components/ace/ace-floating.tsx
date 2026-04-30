"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AceCharacter, type AceState } from "./ace-character";
import { AceChat } from "./ace-chat";

const STORAGE_KEY = "neargear:ace:center";
const TAP_THRESHOLD_PX = 6;
const HIDE_PATHS = ["/auth", "/admin"];

const ACE_OPEN_PX = 90;
const ACE_OPEN_HALF = ACE_OPEN_PX / 2;
const CLOSED_SCALE = 56 / ACE_OPEN_PX; // ≈0.62

type Phase = "closed" | "opening" | "popped" | "open" | "closing";

interface Center {
  x: number;
  y: number;
}

function defaultCenter(): Center {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return {
    x: window.innerWidth - 24 - 28,
    y: window.innerHeight - 100 - 28,
  };
}

function clampCenter(c: Center): Center {
  if (typeof window === "undefined") return c;
  const minX = 28;
  const maxX = window.innerWidth - 28;
  const minY = 28;
  const maxY = window.innerHeight - 28;
  return {
    x: Math.max(minX, Math.min(maxX, c.x)),
    y: Math.max(minY, Math.min(maxY, c.y)),
  };
}

export function AceFloating() {
  const pathname = usePathname();
  const [center, setCenter] = useState<Center | null>(null);
  const [phase, setPhase] = useState<Phase>("closed");
  const [chatState, setChatState] = useState<AceState>("idle");
  const [hasUnread, setHasUnread] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    pointerId: number | null;
  } | null>(null);

  // Load saved center / set default
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Center;
        setCenter(clampCenter(parsed));
        return;
      }
    } catch {}
    setCenter(defaultCenter());
  }, []);

  // Reclamp on viewport resize
  useEffect(() => {
    const onResize = () => {
      setCenter((c) => (c ? clampCenter(c) : c));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Auth presence
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(!!session?.user);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
      if (!session?.user) {
        setPhase("closed");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Phase transitions on open
  useEffect(() => {
    if (phase !== "opening") return;
    const t1 = window.setTimeout(() => setPhase("popped"), 400);
    const t2 = window.setTimeout(() => setPhase("open"), 900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [phase]);

  // Phase transition on close
  useEffect(() => {
    if (phase !== "closing") return;
    const t = window.setTimeout(() => {
      setPhase("closed");
      setChatState("idle");
    }, 350);
    return () => window.clearTimeout(t);
  }, [phase]);

  const isOpen = phase !== "closed";
  const isAnimatingOpen = phase === "opening";
  const isAnimatingClose = phase === "closing";

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isOpen) return; // drag locked while panel is up
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isOpen) return;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < TAP_THRESHOLD_PX) return;
    drag.moved = true;
    setCenter((prev) => (prev ? clampCenter({ x: prev.x + dx, y: prev.y + dy }) : prev));
    drag.startX = e.clientX;
    drag.startY = e.clientY;
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved) {
      try {
        if (center) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(center));
        }
      } catch {}
      return;
    }
    // Tap → open
    setHasUnread(false);
    setPhase("opening");
  };

  const close = () => {
    if (phase === "closing" || phase === "closed") return;
    setPhase("closing");
  };

  if (!signedIn) return null;
  if (HIDE_PATHS.some((p) => pathname?.startsWith(p))) return null;
  if (!center) return null;

  // Ace render position: top-left of a fixed 90×90 wrapper, centered on `center`.
  const aceLeft = center.x - ACE_OPEN_HALF;
  const aceTop = center.y - ACE_OPEN_HALF;

  // What state to render the Ace SVG in:
  // - opening (0–400ms): "idle" while it grows
  // - popped (400–900ms): "excited" jump
  // - open: chat-driven state (idle/thinking/responding/alert/excited)
  // - closing/closed: idle
  let renderedAceState: AceState;
  if (phase === "popped") renderedAceState = "excited";
  else if (phase === "open") renderedAceState = chatState;
  else renderedAceState = "idle";

  // Bubble geometry: full-width minus 24px gutters; sits above Ace with a gap
  // for the tail. Height capped to 70dvh and never exceeds the room above Ace.
  const aceTopVisible = isOpen ? center.y - ACE_OPEN_HALF : center.y - 28;
  const tailGap = 14;
  const bubbleBottomFromViewport =
    typeof window !== "undefined"
      ? Math.max(window.innerHeight - aceTopVisible + tailGap, 80)
      : 200;

  const bubbleClass = isAnimatingOpen
    ? "ace-bubble-expanding"
    : isAnimatingClose
      ? "ace-bubble-collapsing"
      : "ace-bubble-open";

  const aceAnimClass = isAnimatingOpen
    ? "ace-growing"
    : isAnimatingClose
      ? "ace-shrinking"
      : "";

  // Tail: small notch at bubble bottom edge horizontally over Ace's center
  const tailLeftFromViewport = center.x - 7; // 14px wide / 2

  return (
    <>
      {/* Backdrop (only when open) */}
      {isOpen && (
        <div
          className={`fixed inset-0 z-40 bg-black/40 ${
            isAnimatingClose ? "ace-fade-out" : "ace-fade-in"
          }`}
          onClick={close}
          aria-hidden
        />
      )}

      {/* Speech bubble */}
      {isOpen && (
        <>
          <div
            className={`fixed z-50 bg-white shadow-2xl flex flex-col overflow-hidden ${bubbleClass}`}
            style={{
              left: 24,
              right: 24,
              bottom: bubbleBottomFromViewport,
              height: `min(70dvh, calc(100dvh - ${bubbleBottomFromViewport + 24}px))`,
              borderRadius: "20px 20px 20px 4px",
              transformOrigin: "bottom right",
            }}
          >
            <AceChat
              onClose={close}
              onAceState={setChatState}
              onUnread={setHasUnread}
            />
          </div>

          {/* Tail — tiny triangle pointing down to Ace */}
          <span
            aria-hidden
            className={`fixed z-50 ${
              isAnimatingClose ? "ace-fade-out" : "ace-fade-in"
            }`}
            style={{
              left: tailLeftFromViewport,
              bottom: bubbleBottomFromViewport - tailGap,
              width: 14,
              height: tailGap,
              background: "white",
              clipPath: "polygon(50% 100%, 0 0, 100% 0)",
              filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.08))",
            }}
          />
        </>
      )}

      {/* Ace himself — always 90×90 box, scale handled via CSS class */}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        aria-label={isOpen ? "Ace assistant" : "Open Ace"}
        className={`fixed z-[60] flex items-center justify-center ${aceAnimClass}`}
        style={{
          left: aceLeft,
          top: aceTop,
          width: ACE_OPEN_PX,
          height: ACE_OPEN_PX,
          transform: phase === "closed" ? `scale(${CLOSED_SCALE})` : undefined,
          transformOrigin: "center",
          touchAction: isOpen ? "auto" : "none",
          WebkitTapHighlightColor: "transparent",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: isOpen ? "default" : "pointer",
        }}
      >
        {/* Glow halo when expanded — pulses softly while idle */}
        {isOpen && (
          <span
            aria-hidden
            className="ace-glow-pulse absolute -inset-3 rounded-full pointer-events-none"
          />
        )}
        <div className="relative">
          <AceCharacter state={renderedAceState} size="md" />
          {!isOpen && hasUnread && (
            <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-red-500 ring-2 ring-white" />
          )}
        </div>
      </button>
    </>
  );
}
