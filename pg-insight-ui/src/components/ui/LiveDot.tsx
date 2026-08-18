import { cn } from "@/lib/format";

export function LiveDot({
  active = true,
  size = "sm",
}: {
  active?: boolean;
  size?: "xs" | "sm" | "md";
}) {
  const s = { xs: "w-1.5 h-1.5", sm: "w-2 h-2", md: "w-2.5 h-2.5" }[size];
  return (
    <span
      className={cn(
        "rounded-full inline-block",
        s,
        active ? "bg-green-400 animate-pulse-dot" : "bg-slate-400",
      )}
    />
  );
}
