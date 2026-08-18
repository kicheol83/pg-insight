import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn, copyToClipboard } from "@/lib/format";

export function CopyButton({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className={cn(
        "p-1 rounded text-muted hover:text-primary transition-colors",
        className,
      )}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check size={13} className="text-green-400" />
      ) : (
        <Copy size={13} />
      )}
    </button>
  );
}
