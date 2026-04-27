"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface Props {
  windowStart: string;
  windowEnd: string;
  className?: string;
}

function formatLong(diffMs: number): { primary: string; secondary?: string } {
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  if (days >= 2) return { primary: `In ${days} days` };
  if (days === 1) return { primary: "Tomorrow", secondary: `${hours}h away` };
  if (hours >= 1) return { primary: `In ${hours} hour${hours === 1 ? "" : "s"}` };
  return { primary: "Soon" };
}

function formatHMS(diffMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function MeetupCountdown({ windowStart, windowEnd, className }: Props) {
  const startMs = new Date(windowStart).getTime();
  const endMs = new Date(windowEnd).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const remainingToStart = startMs - Date.now();
    const remainingToEnd = endMs - Date.now();
    // Tick every second while within 24h of start, or within the window;
    // otherwise tick every minute.
    const fast =
      (remainingToStart > 0 && remainingToStart <= 24 * 3600 * 1000) ||
      (remainingToStart <= 0 && remainingToEnd > 0);
    const id = setInterval(tick, fast ? 1000 : 60_000);
    return () => clearInterval(id);
  }, [startMs, endMs]);

  const toStart = startMs - now;
  const toEnd = endMs - now;

  if (toEnd <= 0) {
    return (
      <div className={`rounded-xl bg-gray-100 px-4 py-3 ${className ?? ""}`}>
        <p className="text-sm text-muted-foreground">
          Meetup window has ended.
        </p>
      </div>
    );
  }

  if (toStart <= 0) {
    return (
      <div
        className={`rounded-xl bg-green-50 border border-green-200 px-4 py-3 ${className ?? ""}`}
      >
        <p className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
          <Clock className="w-4 h-4" /> Meetup window is now!
        </p>
        <p className="text-xs text-green-800 mt-0.5">
          Tap below when you&apos;ve met up.
        </p>
      </div>
    );
  }

  if (toStart > 24 * 3600 * 1000) {
    const f = formatLong(toStart);
    return (
      <div
        className={`rounded-xl bg-orange/5 border border-orange/20 px-4 py-3 ${className ?? ""}`}
      >
        <p className="text-sm font-semibold text-orange flex items-center gap-1.5">
          <Clock className="w-4 h-4" /> {f.primary}
        </p>
        {f.secondary && (
          <p className="text-xs text-muted-foreground mt-0.5">{f.secondary}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl bg-orange/5 border border-orange/20 px-4 py-3 ${className ?? ""}`}
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Until meetup window
      </p>
      <p className="font-heading text-2xl font-bold text-orange tabular-nums mt-0.5">
        {formatHMS(toStart)}
      </p>
    </div>
  );
}
