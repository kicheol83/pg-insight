import { fmtXidAge, cn } from "@/lib/format";
import { xidAgeColor } from "@/lib/colors";

const MAX_XID = 2_000_000_000;

export function XidAgeGauge({ age }: { age: number }) {
  const pct = Math.min((age / MAX_XID) * 100, 100);
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <span
          className={cn("text-3xl font-bold tabular-nums", xidAgeColor(age))}
        >
          {fmtXidAge(age)}
        </span>
        <span className="text-xs text-muted">of 2B wraparound limit</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden flex">
        <div className="h-full bg-green-500/25" style={{ width: "25%" }} />
        <div className="h-full bg-yellow-500/25" style={{ width: "25%" }} />
        <div className="h-full bg-orange-500/25" style={{ width: "25%" }} />
        <div className="h-full bg-red-500/25" style={{ width: "25%" }} />
        <div
          className="absolute top-0 h-full w-1 bg-[var(--text-primary)] rounded"
          style={{ left: `calc(${pct}% - 2px)` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-muted">
        <span>0</span>
        <span>500M</span>
        <span>1B</span>
        <span>1.5B</span>
        <span>2B</span>
      </div>
    </div>
  );
}
