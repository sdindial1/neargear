"use client";

import type { CSSProperties } from "react";

export type AceState =
  | "idle"
  | "thinking"
  | "responding"
  | "excited"
  | "alert";

interface Props {
  state?: AceState;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES: Record<NonNullable<Props["size"]>, number> = {
  sm: 56,
  md: 96,
  lg: 160,
};

/**
 * Ace — friendly orange ferrofluid blob with state-driven animations.
 * Pure SVG + CSS keyframes (no JS animation lib).
 */
export function AceCharacter({
  state = "idle",
  size = "md",
  className,
}: Props) {
  const px = SIZES[size];
  const showOrbit = state === "thinking";
  const showRipples = state === "responding";

  const blobClass =
    state === "idle"
      ? "ace-state-idle"
      : state === "thinking"
        ? "ace-state-thinking-core"
        : state === "responding"
          ? "ace-state-responding"
          : state === "excited"
            ? "ace-state-excited"
            : "";

  const blobBaseStyle: CSSProperties = {
    transformOrigin: "center",
  };

  const eyeShape =
    state === "excited" ? (
      <>
        <Star cx={36} cy={42} />
        <Star cx={64} cy={42} />
      </>
    ) : (
      <>
        <ellipse cx={38} cy={44} rx={3.2} ry={4.5} fill="#0d2438" />
        <ellipse cx={62} cy={44} rx={3.2} ry={4.5} fill="#0d2438" />
        <circle cx={38.8} cy={42.4} r={1} fill="#fff" />
        <circle cx={62.8} cy={42.4} r={1} fill="#fff" />
      </>
    );

  const mouth =
    state === "excited" ? (
      <path
        d="M 38 60 Q 50 72 62 60"
        stroke="#0d2438"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
    ) : state === "responding" ? (
      <ellipse cx={50} cy={62} rx={6} ry={3} fill="#0d2438" />
    ) : state === "alert" ? (
      <line
        x1="44"
        y1="62"
        x2="56"
        y2="62"
        stroke="#0d2438"
        strokeWidth={3}
        strokeLinecap="round"
      />
    ) : (
      <path
        d="M 42 60 Q 50 65 58 60"
        stroke="#0d2438"
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
    );

  return (
    <div
      className={`relative inline-block ${className ?? ""}`}
      style={{ width: px, height: px }}
      aria-label={`Ace ${state}`}
    >
      {showRipples && (
        <>
          <span
            className="ace-ripple absolute inset-0 rounded-full bg-orange/30"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="ace-ripple absolute inset-0 rounded-full bg-orange/30"
            style={{ animationDelay: "500ms" }}
          />
        </>
      )}

      <svg
        viewBox="0 0 100 100"
        width={px}
        height={px}
        className={blobClass}
        style={blobBaseStyle}
      >
        <defs>
          <radialGradient id="ace-grad" cx="35%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#ffa078" />
            <stop offset="55%" stopColor="#ff6b35" />
            <stop offset="100%" stopColor="#e55a24" />
          </radialGradient>
        </defs>
        <path
          d="M 50 8 C 70 8 90 26 90 48 C 90 70 74 92 50 92 C 26 92 10 72 10 48 C 10 26 30 8 50 8 Z"
          fill="url(#ace-grad)"
        />
        {state === "alert" && (
          <>
            <polygon points="50,2 53,12 47,12" fill="#ff6b35" />
            <polygon points="98,50 88,53 88,47" fill="#ff6b35" />
            <polygon points="50,98 47,88 53,88" fill="#ff6b35" />
            <polygon points="2,50 12,47 12,53" fill="#ff6b35" />
          </>
        )}
        {eyeShape}
        {mouth}
      </svg>

      {showOrbit && (
        <div className="absolute inset-0 ace-orbit-dot pointer-events-none">
          {[0, 90, 180, 270].map((deg) => (
            <span
              key={deg}
              className="absolute left-1/2 top-1/2 w-2 h-2 -ml-1 -mt-1 rounded-full bg-orange"
              style={{
                transform: `rotate(${deg}deg) translateY(-${px / 2}px)`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Star({ cx, cy }: { cx: number; cy: number }) {
  const points = [];
  const outer = 5;
  const inner = 2.2;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return <polygon points={points.join(" ")} fill="#0d2438" />;
}
