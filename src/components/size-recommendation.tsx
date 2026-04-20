import { Ruler } from "lucide-react";
import { getSizeRecommendations } from "@/lib/sizecharts";

interface Props {
  age: number;
  sport: string;
  className?: string;
}

export function SizeRecommendation({ age, sport, className }: Props) {
  const rec = getSizeRecommendations(age, sport);
  const entries = Object.entries(rec.equipment);

  if (entries.length === 0) return null;

  return (
    <div className={`rounded-xl border border-orange/20 bg-orange/5 p-4 ${className ?? ""}`}>
      <div className="flex items-center gap-2 mb-3">
        <Ruler className="w-4 h-4 text-orange" />
        <h4 className="font-heading font-semibold text-navy text-sm">
          Recommended sizes for age {age} ({sport})
        </h4>
      </div>
      <dl className="space-y-1.5 text-sm">
        {entries.map(([category, range]) => (
          <div key={category} className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">{category}</dt>
            <dd className="font-medium text-navy text-right">
              {range.size}
              {range.notes && (
                <span className="block text-[11px] text-muted-foreground font-normal">
                  {range.notes}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
