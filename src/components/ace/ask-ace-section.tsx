"use client";

import { AceCharacter } from "@/components/ace/ace-character";

interface Props {
  sport: string;
}

const UNIVERSAL_QUESTIONS = [
  "Will this fit my kid?",
  "Is this a fair price?",
  "Any red flags I should know about?",
  "How does the meetup work?",
] as const;

function sportSpecificQuestion(sport: string | null | undefined): string | null {
  const s = (sport ?? "").toLowerCase();
  if (s.includes("baseball") || s.includes("softball")) {
    return "Has this glove been broken in?";
  }
  if (s.includes("soccer")) return "Indoor or outdoor cleats?";
  if (s.includes("football")) {
    return "Has this helmet been in a collision?";
  }
  if (s.includes("basketball") || s.includes("volleyball")) {
    return "Is this true to size?";
  }
  return null;
}

export function AskAceSection({ sport }: Props) {
  const sportQ = sportSpecificQuestion(sport);
  // Swap the second universal chip with the sport-specific one when one
  // exists; otherwise show all four universals.
  const chips: string[] = sportQ
    ? [
        UNIVERSAL_QUESTIONS[0],
        sportQ,
        UNIVERSAL_QUESTIONS[2],
        UNIVERSAL_QUESTIONS[3],
      ]
    : [...UNIVERSAL_QUESTIONS];

  const ask = (question: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("neargear:ace:ask", { detail: { question } }),
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-orange/20 p-4 mt-6">
      <div className="flex items-center gap-2 mb-3">
        <AceCharacter state="idle" size="sm" className="flex-shrink-0" />
        <p className="text-sm font-semibold text-navy">
          Have questions? Ask Ace 👇
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {chips.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => ask(q)}
            className="text-left text-sm border border-orange/30 text-orange rounded-xl px-3 py-2 hover:bg-orange/5 leading-tight"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
