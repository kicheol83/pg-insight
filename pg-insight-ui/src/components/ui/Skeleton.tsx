import { cn } from "@/lib/format";

export function Skeleton({
  className,
  lines,
}: {
  className?: string;
  lines?: number;
}) {
  if (lines) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "skeleton h-4 rounded",
              i === lines - 1 ? "w-3/4" : "w-full",
            )}
          />
        ))}
      </div>
    );
  }
  return <div className={cn("skeleton", className)} />;
}
