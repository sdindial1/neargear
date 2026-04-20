import { SPORTS } from "@/lib/constants";

export function SportsTicker() {
  const items = [...SPORTS, ...SPORTS];

  return (
    <div className="bg-orange overflow-hidden py-3">
      <div className="animate-scroll flex whitespace-nowrap">
        {items.map((sport, i) => (
          <span
            key={`${sport}-${i}`}
            className="inline-flex items-center mx-6 text-white font-heading font-semibold text-lg uppercase tracking-wide"
          >
            <span className="w-2 h-2 rounded-full bg-white/60 mr-3" />
            {sport}
          </span>
        ))}
      </div>
    </div>
  );
}
