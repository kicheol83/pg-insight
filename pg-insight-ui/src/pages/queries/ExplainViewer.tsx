import { useState } from "react";
import { Play } from "lucide-react";
import { Button, Badge, CopyButton, useToast } from "@/components/ui";
import { liveApi } from "@/api/endpoints";
import type { ExplainResult } from "@/types/model";
import { cn } from "@/lib/format";

export function ExplainViewer({ targetId }: { targetId: string }) {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const run = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    try {
      setResult(await liveApi.explain(targetId, sql));
    } catch (err) {
      toast({
        type: "error",
        title: "EXPLAIN failed",
        message: (err as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-secondary">
            SELECT query to analyze
          </label>
          <Badge variant="info" size="xs">
            Only SELECT / WITH supported
          </Badge>
        </div>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          rows={5}
          placeholder="SELECT * FROM users WHERE email = 'test@example.com'"
          className="input mono text-xs resize-y"
          style={{ minHeight: "120px" }}
        />
      </div>

      <Button
        variant="primary"
        icon={<Play size={13} />}
        onClick={run}
        loading={loading}
        disabled={!sql.trim()}
      >
        Run EXPLAIN ANALYZE
      </Button>

      {result && (
        <div className="space-y-3">
          <div className="flex gap-4 p-3 bg-[var(--bg-subtle)] rounded-lg text-sm">
            <div>
              <div className="text-xs text-muted mb-0.5">Execution time</div>
              <div className="font-bold text-primary">
                {result.executionTimeMs.toFixed(2)}ms
              </div>
            </div>
          </div>

          {result.recommendations?.length > 0 && (
            <div className="space-y-1.5">
              {result.recommendations.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-xs px-3 py-2 rounded-lg border",
                    r.startsWith("⚠")
                      ? "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/20"
                      : "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
                  )}
                >
                  {r}
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-secondary">
                Query plan (JSON)
              </span>
              <CopyButton text={JSON.stringify(result.plan, null, 2)} />
            </div>
            <pre className="text-[11px] mono bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg p-3 overflow-auto max-h-80 text-secondary">
              {JSON.stringify(result.plan, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
