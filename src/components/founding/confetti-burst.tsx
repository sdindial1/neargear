"use client";

import { useEffect, useMemo } from "react";

const COLORS = ["#ff6b35", "#ff8c5a", "#ffd700", "#ffffff", "#f5f4f0"];

interface ParticleData {
  id: number;
  endX: number;
  endY: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  shape: "circle" | "rect";
  rotation: number;
}

function generateParticles(count: number): ParticleData[] {
  return Array.from({ length: count }).map((_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const velocity = 300 + Math.random() * 400;
    const endX = Math.cos(angle) * velocity;
    // Gravity adds to Y — particles fall down after launching.
    const baseY = Math.sin(angle) * velocity;
    const endY = baseY + 200 + Math.random() * 300;
    return {
      id: i,
      endX,
      endY,
      delay: Math.random() * 0.3,
      duration: 1.6 + Math.random() * 1.2,
      size: 8 + Math.random() * 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      shape: Math.random() > 0.4 ? "rect" : "circle",
      rotation: 360 + Math.random() * 720,
    };
  });
}

interface Props {
  active: boolean;
  particleCount?: number;
  onDone?: () => void;
  durationMs?: number;
}

export function ConfettiBurst({
  active,
  particleCount = 80,
  onDone,
  durationMs = 4000,
}: Props) {
  // Regenerate particles each time the burst activates so consecutive claims
  // don't replay identical confetti.
  const particles = useMemo(
    () => (active ? generateParticles(particleCount) : []),
    [active, particleCount],
  );

  useEffect(() => {
    if (!active || !onDone) return;
    const id = setTimeout(onDone, durationMs);
    return () => clearTimeout(id);
  }, [active, onDone, durationMs]);

  if (!active) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 0,
          height: 0,
        }}
      >
        {particles.map((p) => (
          <BurstParticle key={p.id} {...p} />
        ))}
      </div>
    </div>
  );
}

function BurstParticle({
  endX,
  endY,
  delay,
  duration,
  size,
  color,
  shape,
  rotation,
}: ParticleData) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: `${size}px`,
        height: `${shape === "rect" ? size * 0.4 : size}px`,
        backgroundColor: color,
        borderRadius: shape === "circle" ? "50%" : "2px",
        animation: `burst-particle ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}s forwards`,
        ["--end-x" as string]: `${endX}px`,
        ["--end-y" as string]: `${endY}px`,
        ["--rotation" as string]: `${rotation}deg`,
      } as React.CSSProperties}
    />
  );
}
