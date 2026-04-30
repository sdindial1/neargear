"use client";

export type AceState =
  | "idle"
  | "thinking"
  | "responding"
  | "excited"
  | "alert"
  | "celebrating"
  | "hero";

interface Props {
  state?: AceState;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES: Record<NonNullable<Props["size"]>, number> = {
  sm: 56,
  md: 90,
  lg: 200,
};

/**
 * Ace — friendly orange ferrofluid blob with state-driven animations.
 * SVG paths ported from ace_for_amaro.html reveal doc.
 */
export function AceCharacter({
  state = "idle",
  size = "md",
  className,
}: Props) {
  const px = SIZES[size];

  return (
    <div
      className={`relative inline-block ${className ?? ""}`}
      style={{ width: px, height: px }}
      aria-label={`Ace ${state}`}
    >
      {state === "celebrating" ? (
        <Celebrating size={px} />
      ) : (
        <StateSvg state={state} size={px} />
      )}
    </div>
  );
}

function StateSvg({ state, size }: { state: AceState; size: number }) {
  switch (state) {
    case "thinking":
      return <Thinking size={size} />;
    case "excited":
      return <Excited size={size} />;
    case "responding":
      return <Responding size={size} />;
    case "alert":
      return <Alert size={size} />;
    case "hero":
      return <Hero size={size} />;
    default:
      return <Idle size={size} />;
  }
}

function Idle({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 130"
      className="ace-anim-breathe"
      style={{ transformOrigin: "center" }}
    >
      <ellipse cx="60" cy="120" rx="30" ry="4" fill="#070f16" opacity=".4" />
      <path
        d="M60 16 Q96 16 102 52 Q108 88 84 110 Q60 124 36 110 Q12 88 18 52 Q24 16 60 16 Z"
        fill="#ff6b35"
      />
      <ellipse cx="60" cy="62" rx="32" ry="22" fill="#fff" />
      <ellipse cx="50" cy="60" rx="4" ry="6" fill="#0d2438" />
      <ellipse cx="70" cy="60" rx="4" ry="6" fill="#0d2438" />
      <path
        d="M52 73 Q60 78 68 73"
        stroke="#0d2438"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function Thinking({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="14" fill="#ff6b35" />
      <circle cx="60" cy="60" r="9" fill="#ff8c5a" />
      <g
        className="ace-anim-spin"
        style={{ transformOrigin: "60px 60px" }}
      >
        <ellipse cx="60" cy="22" rx="6" ry="9" fill="#ff6b35" />
        <ellipse cx="98" cy="60" rx="9" ry="6" fill="#ff6b35" />
        <ellipse cx="60" cy="98" rx="6" ry="9" fill="#ff6b35" />
        <ellipse cx="22" cy="60" rx="9" ry="6" fill="#ff6b35" />
      </g>
    </svg>
  );
}

function Excited({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 130">
      <ellipse cx="60" cy="125" rx="26" ry="3" fill="#070f16" opacity=".3" />
      <g className="ace-anim-jump" style={{ transformOrigin: "center" }}>
        <path
          d="M60 16 Q96 18 100 52 Q104 86 80 106 Q60 118 40 106 Q16 86 20 52 Q24 18 60 16 Z"
          fill="#ff6b35"
        />
        <ellipse cx="60" cy="60" rx="32" ry="22" fill="#fff" />
        <path
          d="M50 56 L52 60 L56 60 L53 63 L54 67 L50 65 L46 67 L47 63 L44 60 L48 60 Z"
          fill="#ff6b35"
        />
        <path
          d="M70 56 L72 60 L76 60 L73 63 L74 67 L70 65 L66 67 L67 63 L64 60 L68 60 Z"
          fill="#ff6b35"
        />
        <path
          d="M48 73 Q60 82 72 73"
          stroke="#0d2438"
          strokeWidth={2.5}
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M52 75 Q60 80 68 75 L67 78 Q60 82 53 78 Z"
          fill="#0d2438"
        />
      </g>
    </svg>
  );
}

function Responding({ size }: { size: number }) {
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
    >
      {[0, 500, 1000].map((delay) => (
        <span
          key={delay}
          className="ace-anim-ripple absolute inset-0 rounded-full bg-orange/40"
          style={{ animationDelay: `${delay}ms` }}
          aria-hidden
        />
      ))}
      <Idle size={size} />
    </div>
  );
}

function Alert({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 130"
      className="ace-anim-alert"
      style={{ transformOrigin: "center" }}
    >
      <ellipse cx="60" cy="120" rx="30" ry="4" fill="#070f16" opacity=".4" />
      <path
        d="M60 16 Q96 16 102 52 Q108 88 84 110 Q60 124 36 110 Q12 88 18 52 Q24 16 60 16 Z"
        fill="#ff6b35"
      />
      <polygon points="60,2 64,14 56,14" fill="#ff6b35" />
      <polygon points="118,62 104,66 104,58" fill="#ff6b35" />
      <polygon points="60,128 56,116 64,116" fill="#ff6b35" />
      <polygon points="2,62 16,58 16,66" fill="#ff6b35" />
      <ellipse cx="60" cy="62" rx="32" ry="22" fill="#fff" />
      <ellipse cx="50" cy="60" rx="4" ry="6" fill="#0d2438" />
      <ellipse cx="70" cy="60" rx="4" ry="6" fill="#0d2438" />
      <line
        x1="52"
        y1="74"
        x2="68"
        y2="74"
        stroke="#0d2438"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

function Hero({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 180"
      className="ace-anim-float"
      style={{ transformOrigin: "center" }}
    >
      <ellipse cx="80" cy="170" rx="44" ry="6" fill="#070f16" opacity=".5" />
      <path
        d="M80 20 Q128 20 136 68 Q144 118 112 148 Q80 168 48 148 Q16 118 24 68 Q32 20 80 20 Z"
        fill="#ff6b35"
      />
      <ellipse cx="60" cy="58" rx="18" ry="10" fill="#fff" opacity=".22" />
      <ellipse cx="80" cy="85" rx="44" ry="32" fill="#fff" />
      <ellipse cx="66" cy="82" rx="6" ry="9" fill="#0d2438" />
      <circle cx="68" cy="79" r="3" fill="#fff" />
      <ellipse cx="94" cy="82" rx="6" ry="9" fill="#0d2438" />
      <circle cx="96" cy="79" r="3" fill="#fff" />
      <path
        d="M68 99 Q80 107 92 99"
        stroke="#0d2438"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="56" cy="93" r="3.5" fill="#ff6b35" opacity=".5" />
      <circle cx="104" cy="93" r="3.5" fill="#ff6b35" opacity=".5" />
      <circle cx="80" cy="138" r="11" fill="#fff" />
      <text
        x="80"
        y="144"
        textAnchor="middle"
        fontFamily="'Barlow Condensed', sans-serif"
        fontSize="14"
        fontWeight={900}
        fill="#ff6b35"
      >
        A
      </text>
    </svg>
  );
}

function Celebrating({ size }: { size: number }) {
  const mini = Math.round(size * 0.4);
  const offsets: { className: string }[] = [
    { className: "ace-anim-bounce-1" },
    { className: "ace-anim-bounce-2" },
    { className: "ace-anim-bounce-3" },
  ];
  return (
    <div
      className="absolute inset-0 flex items-end justify-center gap-1"
      aria-hidden
    >
      {offsets.map((o, i) => (
        <div key={i} className={o.className}>
          <Idle size={mini} />
        </div>
      ))}
    </div>
  );
}
