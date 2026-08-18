import { useState, useEffect, useCallback, useRef } from "react";

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updatedAt: Date | null;
}

export function useQuery<T>(
  fetchFn: () => Promise<T>,
  options?: { refreshInterval?: number; enabled?: boolean },
): QueryState<T> {
  const { refreshInterval = 0, enabled = true } = options ?? {};

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRef.current();
      setData(result);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refetch();
    if (refreshInterval > 0) {
      const id = setInterval(refetch, refreshInterval);
      return () => clearInterval(id);
    }
  }, [refetch, refreshInterval]);

  return { data, loading, error, refetch, updatedAt };
}
