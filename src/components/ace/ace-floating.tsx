"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AceChat } from "./ace-chat";

const STORAGE_KEY = "neargear:ace:position";
const TAP_THRESHOLD_PX = 6;
const HIDE_PATHS = ["/auth", "/admin"];
const SIZE = 56;

interface Position {
  x: number;
  y: number;
}

function defaultPosition(): Position {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return {
    x: window.innerWidth - SIZE - 24,
    y: window.innerHeight - SIZE - 100,
  };
}

function clamp(p: Position): Position {
  if (typeof window === "undefined") return p;
  const maxX = window.innerWidth - SIZE - 8;
  const maxY = window.innerHeight - SIZE - 8;
  return {
    x: Math.max(8, Math.min(maxX, p.x)),
    y: Math.max(8, Math.min(maxY, p.y)),
  };
}

function ClosedFace() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 56 56">
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
  const [pos, setPos] = useState<Position | null>(null);
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    pointerId: number | null;
  } | null>(null);

  // Load saved position / set default
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Position;
        setPos(clamp(parsed));
        return;
      }
    } catch {}
    setPos(defaultPosition());
  }, []);

  // Reclamp on viewport resize
  useEffect(() => {
    const onResize = () => {
      setPos((p) => (p ? clamp(p) : p));
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
      if (!session?.user) setOpen(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (open) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (open) return;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < TAP_THRESHOLD_PX) return;
    drag.moved = true;
    setPos((prev) => (prev ? clamp({ x: prev.x + dx, y: prev.y + dy }) : prev));
    drag.startX = e.clientX;
    drag.startY = e.clientY;
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved) {
      try {
        if (pos) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
      } catch {}
      return;
    }
    setHasUnread(false);
    setOpen(true);
  };

  if (signedIn === null || !signedIn) return null;
  if (HIDE_PATHS.some((p) => pathname?.startsWith(p))) return null;
  if (!pos) return null;

  return (
    <>
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        aria-label="Open Ace"
        className="fixed z-[60] rounded-full flex items-center justify-center"
        style={{
          left: pos.x,
          top: pos.y,
          width: SIZE,
          height: SIZE,
          background: "#ff6b35",
          boxShadow:
            "0 4px 20px rgba(255, 107, 53, 0.45), 0 0 0 1px rgba(255, 107, 53, 0.1)",
          touchAction: "none",
          WebkitTapHighlightColor: "transparent",
          border: "none",
          padding: 0,
          animation: "ace-breathe 3s ease-in-out infinite",
        }}
      >
        <ClosedFace />
        {hasUnread && (
          <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </button>

      {open && (
        <AceChat
          onClose={() => setOpen(false)}
          onAceState={() => {}}
          onUnread={setHasUnread}
        />
      )}
    </>
  );
}
