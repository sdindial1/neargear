"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AceCharacter, type AceState } from "./ace-character";
import { AceChat } from "./ace-chat";

const STORAGE_KEY = "neargear:ace:position";
const TAP_THRESHOLD_PX = 6;
const HIDE_PATHS = ["/auth", "/admin"];

interface Position {
  x: number;
  y: number;
}

function defaultPosition(): Position {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return {
    x: window.innerWidth - 72,
    y: window.innerHeight - 160,
  };
}

function clamp(p: Position): Position {
  if (typeof window === "undefined") return p;
  const w = window.innerWidth - 56;
  const h = window.innerHeight - 56;
  return { x: Math.max(8, Math.min(w, p.x)), y: Math.max(8, Math.min(h, p.y)) };
}

export function AceFloating() {
  const pathname = usePathname();
  const [pos, setPos] = useState<Position | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AceState>("idle");
  const [hasUnread, setHasUnread] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    pointerId: number | null;
  } | null>(null);

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

  useEffect(() => {
    const onResize = () => {
      setPos((p) => (p ? clamp(p) : p));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < TAP_THRESHOLD_PX) return;
    drag.moved = true;
    setPos((prev) => {
      if (!prev) return prev;
      return clamp({ x: prev.x + dx, y: prev.y + dy });
    });
    drag.startX = e.clientX;
    drag.startY = e.clientY;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
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

  if (!signedIn) return null;
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
        className="fixed z-[60] w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center touch-none active:scale-95 transition-transform"
        style={{
          left: pos.x,
          top: pos.y,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <AceCharacter state={state} size="sm" />
        {hasUnread && (
          <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </button>

      {open && (
        <AceChat
          onClose={() => setOpen(false)}
          onAceState={setState}
          onUnread={setHasUnread}
        />
      )}
    </>
  );
}
