UPDATE "alert_rules"
SET "threshold" = "threshold" * 100
WHERE "metric" = 'table_bloat_ratio' AND "threshold" <= 1;

UPDATE "alert_rules"
SET "metric" = CASE "metric"
    WHEN 'connection_usage_pct' THEN 'connection_utilization_pct'
    WHEN 'active_queries' THEN 'active_query_count'
    WHEN 'idle_in_transaction' THEN 'idle_in_tx_count'
    WHEN 'waiting_locks' THEN 'lock_wait_count'
    WHEN 'blocked_sessions' THEN 'lock_wait_count'
    WHEN 'longest_query_ms' THEN 'long_running_query_ms'
    WHEN 'xid_age' THEN 'xid_age_max'
    WHEN 'table_bloat_ratio' THEN 'bloat_pct_max'
    WHEN 'deadlock_count' THEN 'deadlocks_delta'
END
WHERE "metric" IN ('connection_usage_pct', 'active_queries', 'idle_in_transaction', 'waiting_locks', 'blocked_sessions', 'longest_query_ms', 'xid_age', 'table_bloat_ratio', 'deadlock_count');

UPDATE "alert_rules"
SET "enabled" = false
WHERE "metric" IN ('unused_index_size', 'wal_size_bytes');

UPDATE "alert_rules"
SET "notifyChannels" = ARRAY(
    SELECT CASE WHEN c LIKE 'webhook:%' THEN c ELSE 'webhook:' || c END
    FROM unnest("notifyChannels") AS c
)
WHERE EXISTS (SELECT 1 FROM unnest("notifyChannels") AS c WHERE c NOT LIKE 'webhook:%');
