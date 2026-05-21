"use client";

import { useEffect, useState } from "react";

type SparkleType = "star" | "sparkle";

interface SparkleData {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  type: SparkleType;
  color: string;
  drift: number;
}

const COLORS = [
  "#ff6b35", // NearGear orange
  "#ff8c5a", // light orange
  "#ffd700", // gold sparkle
  "#ffffff", // white
  "#f5f4f0", // cream
];

function generateSparkles(count: number): SparkleData[] {
  return Array.from({ length: count }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 8,
    duration: 10 + Math.random() * 8,
    size: 8 + Math.random() * 12,
    type: Math.random() > 0.5 ? "star" : "sparkle",
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    drift: (Math.random() - 0.5) * 80,
  }));
}

interface Props {
  count?: number;
}

// Random positions are generated client-side only — otherwise SSR and CSR
// disagree and React throws a hydration mismatch.
export function SparkleRain({ count = 35 }: Props) {
  const [sparkles, setSparkles] = useState<SparkleData[]>([]);

  useEffect(() => {
    setSparkles(generateSparkles(count));
  }, [count]);

  if (sparkles.length === 0) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {sparkles.map((s) => (
        <Sparkle key={s.id} {...s} />
      ))}
    </div>
  );
}

function Sparkle({ left, delay, duration, size, type, color, drift }: SparkleData) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${left}%`,
        top: "-20px",
        width: `${size}px`,
        height: `${size}px`,
        animation: `sparkle-fall ${duration}s linear ${delay}s infinite`,
        // CSS custom property consumed by the keyframes
        ["--drift" as string]: `${drift}px`,
      } as React.CSSProperties}
    >
      {type === "star" ? <StarSvg color={color} /> : <SparkleSvg color={color} />}
    </div>
  );
}

function SparkleSvg({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="100%" height="100%">
      <path
        d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z"
        fill={color}
      />
    </svg>
  );
}

function StarSvg({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="100%" height="100%">
      <path
        d="M12 2 L14.5 9 L22 9 L16 13.5 L18.5 21 L12 16.5 L5.5 21 L8 13.5 L2 9 L9.5 9 Z"
        fill={color}
      />
    </svg>
  );
}
